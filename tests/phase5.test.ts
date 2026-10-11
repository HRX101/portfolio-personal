import { describe, expect, it } from 'vitest';
import { MAGNET, SCROLL } from '../src/config/effects';
import { EMISSIVE } from '../src/config/scene';
import { QUALITY_LEVELS, QUALITY_LEVELS_TABLE, type QualityLevel } from '../src/config/quality';
import { STATIONS } from '../src/config/scene';
import { applyStationMagnet, STATION_TRACK_T, trackTAtProgress } from '../src/lib/track';
import { resetCameraKick, cameraKick } from '../src/lib/cameraKick';
import { isSoftwareRenderer, type DeviceProfile } from '../src/hooks/useIsLowEnd';
import { detectQualityLevel } from '../src/hooks/useQuality';

/**
 * Phase 5's pure logic. Everything here is deliberately free of three.js objects
 * and the DOM, because these are the parts with an actual chance of being subtly
 * wrong: the magnet changes the scroll mapping that four Phase 4 test suites and
 * a browser script all depend on, and the quality table is the contract the rest
 * of the app reads its switches from.
 */

describe('station magnet', () => {
  it('leaves positions outside its radius completely untouched', () => {
    for (const t of [0.05, 0.2, 0.4, 0.55, 0.7, 0.9]) {
      expect(applyStationMagnet(t)).toBe(t);
    }
  });

  it('never moves a position past the station it is pulling toward', () => {
    // A magnet that overshoots would make the bike rock back and forth on
    // approach, which is the one failure mode a "settle" must not have.
    // Equality is allowed: the outermost sample sits exactly on the radius, where
    // the effect is zero by definition.
    let moved = 0;
    for (const stationT of STATION_TRACK_T) {
      for (let i = 1; i <= 20; i++) {
        const offset = (MAGNET.radius * i) / 20;
        for (const sign of [1, -1]) {
          const t = stationT + offset * sign;
          if (t < 0 || t > 1) continue;
          const pulled = applyStationMagnet(t);
          // Toward the station, or not at all.
          expect(sign > 0 ? pulled : -pulled).toBeLessThanOrEqual(sign > 0 ? t : -t);
          // And never past it, so the bike can never reverse.
          expect(Math.abs(pulled - stationT)).toBeLessThanOrEqual(Math.abs(t - stationT) + 1e-12);
          if (pulled !== t) moved += 1;
        }
      }
    }
    // Guards against the assertions above passing on a no-op implementation.
    expect(moved).toBeGreaterThan(0);
  });

  it('pulls by at most the configured strength', () => {
    for (const stationT of STATION_TRACK_T) {
      for (let i = 0; i <= 40; i++) {
        const t = stationT + (MAGNET.radius * i) / 40;
        if (t > 1) continue;
        const pull = Math.abs(t - applyStationMagnet(t));
        expect(pull).toBeLessThanOrEqual(Math.abs(t - stationT) * MAGNET.strength + 1e-12);
      }
    }
  });

  it('is a no-op exactly on a station, so it cannot fight the dwell', () => {
    for (const stationT of STATION_TRACK_T) {
      expect(applyStationMagnet(stationT)).toBe(stationT);
    }
  });

  it('stays monotonic across the whole track', () => {
    // Monotonic is what keeps the bike from reversing inside the magnet. The
    // derivative of the eased pull is bounded by `strength`, so with
    // `strength < 1` the map cannot turn back on itself.
    expect(MAGNET.strength).toBeLessThan(1);
    let previous = -Infinity;
    for (let i = 0; i <= 20000; i++) {
      const t = applyStationMagnet(i / 20000);
      expect(t).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = t;
    }
  });

  it('does not perturb the mapping outside the magnet regions', () => {
    // The existing scroll-mapping tests assert exact station docks. If the
    // magnet moved a dock, `trackTAtProgress` would no longer land on the
    // station's authored t.
    for (let i = 0; i <= STATIONS.length - 1; i++) {
      const progress = i / (STATIONS.length - 1);
      expect(trackTAtProgress(progress)).toBeCloseTo(STATIONS[i]?.t ?? 0, 12);
    }
  });
});

describe('quality table', () => {
  it('defines exactly the three levels, in order', () => {
    expect(QUALITY_LEVELS).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    expect(Object.keys(QUALITY_LEVELS_TABLE).sort()).toEqual(['HIGH', 'LOW', 'MEDIUM']);
  });

  it('is internally consistent: each entry names its own level', () => {
    for (const level of QUALITY_LEVELS) {
      expect(QUALITY_LEVELS_TABLE[level].level).toBe(level);
    }
  });

  it('scales every cost monotonically upward with the level', () => {
    const order: readonly QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
    for (let i = 1; i < order.length; i++) {
      const lower = QUALITY_LEVELS_TABLE[order[i - 1] as QualityLevel];
      const higher = QUALITY_LEVELS_TABLE[order[i] as QualityLevel];
      expect(higher.particles).toBeGreaterThan(lower.particles);
      expect(higher.world.trees).toBeGreaterThan(lower.world.trees);
      expect(higher.world.stars).toBeGreaterThan(lower.world.stars);
      expect(higher.render.dpr[1]).toBeGreaterThanOrEqual(lower.render.dpr[1]);
      expect(higher.render.terrainSegments).toBeGreaterThan(lower.render.terrainSegments);
    }
  });

  it('only pays for shadows and bloom at the top tier', () => {
    // Both are the two costs worth a hard cut rather than a reduction: the
    // shadow map is a second render of the scene, and the composer is a
    // full-screen copy plus a blur pyramid.
    for (const level of ['LOW', 'MEDIUM'] as const) {
      expect(QUALITY_LEVELS_TABLE[level].render.shadows).toBe(false);
      expect(QUALITY_LEVELS_TABLE[level].bloom).toBe(false);
    }
    expect(QUALITY_LEVELS_TABLE.HIGH.render.shadows).toBe(true);
    expect(QUALITY_LEVELS_TABLE.HIGH.bloom).toBe(true);
  });

  it('never lets a tier advertise an effect it has no particle budget for', () => {
    // Dust and the trail share `particles`. A tier with dust on and a zero
    // multiplier would mount a pool that can never emit anything.
    for (const level of QUALITY_LEVELS) {
      const quality = QUALITY_LEVELS_TABLE[level];
      if (quality.dust) expect(quality.particles).toBeGreaterThan(0);
    }
  });

  it('gives LOW no particle budget at all', () => {
    expect(QUALITY_LEVELS_TABLE.LOW.particles).toBe(0);
    expect(QUALITY_LEVELS_TABLE.LOW.dust).toBe(false);
  });

  it('always carries a draw-call-counted effect at HIGH', () => {
    const high = QUALITY_LEVELS_TABLE.HIGH;
    expect(high.trail).toBe(true);
    expect(high.headlight).toBe(true);
    expect(high.cameraKick).toBe(true);
    expect(high.cursorEffects).toBe(true);
  });
});

describe('bloom tuning', () => {
  it('separates the intended light sources from the merely-lit surfaces', () => {
    /*
     * This is the whole point of the Phase 5 retune, expressed as the two facts
     * that matter rather than as raw numbers:
     *
     *  - Lamp heads are the primary bloom source, and comfortably so.
     *  - Wheel hubs are lit accents that must *never* cross the threshold; at
     *    Phase 3's 0.35 they were close enough that both wheels glowed as discs
     *    while spinning.
     *
     * The road's edge line is deliberately allowed just over the threshold. It is
     * a neon strip and is meant to glow; what it is not meant to do is cover the
     * road, which is why the width, not the intensity, is what changed. What
     * matters is that it sits far below the lamps, so the lamps read as the
     * brightest thing on screen.
     */
    expect(EMISSIVE.lampHead).toBeGreaterThan(EMISSIVE.bloomThreshold * 2);
    expect(EMISSIVE.wheelHub).toBeLessThan(EMISSIVE.bloomThreshold);
    expect(EMISSIVE.roadEdge).toBeLessThan(EMISSIVE.lampHead);
  });

  it('keeps the bloom kernel restrained so the scene does not read as haze', () => {
    expect(EMISSIVE.bloomIntensity).toBeLessThanOrEqual(1);
    expect(EMISSIVE.bloomRadius).toBeLessThan(1);
    expect(EMISSIVE.bloomSmoothing).toBeGreaterThan(0);
  });

  it('smooths the threshold just enough that a glowing line does not pop', () => {
    // A threshold with zero smoothing aliases: a surface sitting exactly on it
    // flickers in and out as the camera moves. Some smoothing is what lets the
    // road edge fade into bloom instead of switching on.
    expect(EMISSIVE.bloomSmoothing).toBeGreaterThanOrEqual(0.1);
  });
});

describe('scroll damping', () => {
  it('is faster than Phase 3 but still leaves visible lag', () => {
    // Below about 2 the shot tracks the scroll almost rigidly and the bike stops
    // reading as having mass; above about 8 it feels like a spring.
    expect(SCROLL.rideLambda).toBeGreaterThan(4);
    expect(SCROLL.rideLambda).toBeLessThan(8);
  });
});

describe('camera kick channel', () => {
  it('resets every channel', () => {
    cameraKick.fovOffset = 4;
    cameraKick.shakeX = 0.1;
    cameraKick.shakeY = 0.1;
    cameraKick.shakeRoll = 0.01;
    resetCameraKick();
    expect(cameraKick.fovOffset).toBe(0);
    expect(cameraKick.shakeX).toBe(0);
    expect(cameraKick.shakeY).toBe(0);
    expect(cameraKick.shakeRoll).toBe(0);
  });
});

describe('software renderer detection', () => {
  it('recognises the CPU rasterisers that must never be given the HIGH tier', () => {
    // These strings are what the browser actually reports. SwiftShader is the
    // headless-CI case; the others are what a GPU-blocklisted laptop falls back
    // to and then renders at a few frames per second with a mip-blurred bloom.
    for (const renderer of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      'Google SwiftShader',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'softpipe',
      'Microsoft Basic Render Driver',
      'Generic Renderer (Paravirtual)',
    ]) {
      expect(isSoftwareRenderer(renderer)).toBe(true);
    }
  });

  it('leaves real GPUs alone', () => {
    for (const renderer of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
      'AMD Radeon RX 7900 XTX (0x0000744C)',
      'Mali-G78',
      'Adreno (TM) 740',
    ]) {
      expect(isSoftwareRenderer(renderer)).toBe(false);
    }
  });

  it('treats an empty string as unknown rather than as software', () => {
    // Browsers that block WEBGL_debug_renderer_info report nothing usable. That
    // must fall back to the cores-and-memory heuristic, not clamp everything low.
    expect(isSoftwareRenderer('')).toBe(false);
  });

  it('detects the tier from the profile, lowest signal first', () => {
    const profile = (over: Partial<DeviceProfile>): DeviceProfile => ({
      tier: 'high',
      webglFailed: false,
      renderer: '',
      isMobile: false,
      isTouch: false,
      ...over,
    });

    expect(detectQualityLevel(profile({ tier: 'low' }))).toBe('LOW');
    expect(detectQualityLevel(profile({ tier: 'mid' }))).toBe('MEDIUM');
    expect(detectQualityLevel(profile({ tier: 'high' }))).toBe('HIGH');
    // A dead context beats everything: the 2D fallback is the only option left.
    expect(detectQualityLevel(profile({ tier: 'high', webglFailed: true }))).toBe('LOW');
  });

  it('routes a software rasteriser to LOW no matter how capable the machine looks', () => {
    // The regression this guards: SwiftShader in CI reports a desktop-class core
    // count, so the cores-and-memory heuristic scored it `high` and it was handed
    // the mip-blurred bloom chain. That halved the frame rate for no visual gain.
    const profile = (over: Partial<DeviceProfile>): DeviceProfile => ({
      tier: 'high',
      webglFailed: false,
      renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      isMobile: false,
      isTouch: false,
      ...over,
    });

    expect(detectQualityLevel(profile({ tier: 'low' }))).toBe('LOW');
    expect(detectQualityLevel(profile({ tier: 'mid' }))).toBe('LOW');
    expect(detectQualityLevel(profile({ tier: 'high' }))).toBe('LOW');
  });
});

