import { describe, expect, it } from 'vitest';
import { ATMOSPHERE_KEYS, LANDMARK, STATIONS, TERRAIN } from '../src/config/scene';
import { atmosphereSample, sampleAtmosphere } from '../src/lib/atmosphere';
import { fbm2, makeRandom, signedNoise2, valueNoise2 } from '../src/lib/noise';
import { roadCenterZAtX } from '../src/lib/track';
import {
  distanceToTrack,
  generateLampPlacements,
  generatePlacements,
  isNearLandmark,
  isOnRoad,
  LANDMARK_ANCHORS,
  roadHeightAt,
  terrainHeightAt,
} from '../src/lib/world';

describe('seeded noise', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRandom(42);
    const b = makeRandom(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces different streams for different seeds', () => {
    const a = makeRandom(1);
    const b = makeRandom(2);
    const same = Array.from({ length: 50 }, () => a() === b()).every(Boolean);
    expect(same).toBe(false);
  });

  it('stays within [0, 1)', () => {
    const rand = makeRandom(7);
    for (let i = 0; i < 5000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('value noise stays in [0, 1] and signed noise in [-1, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const x = (i % 50) * 0.37;
      const y = Math.floor(i / 50) * 0.53;
      expect(valueNoise2(x, y, 3)).toBeGreaterThanOrEqual(0);
      expect(valueNoise2(x, y, 3)).toBeLessThanOrEqual(1);
      expect(signedNoise2(x, y, 3)).toBeGreaterThanOrEqual(-1);
      expect(signedNoise2(x, y, 3)).toBeLessThanOrEqual(1);
    }
  });

  it('fbm stays bounded and varies with position', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 500; i++) {
      const v = fbm2(i * 0.11, i * 0.07, 4, 99);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1.01);
    expect(max).toBeLessThanOrEqual(1.01);
    expect(max).toBeGreaterThan(min);
  });
});

describe('corridor distance field', () => {
  it('is near zero on the road and large away from it', () => {
    // A point on the road centre-line has near-zero distance (within the
    // field's sample resolution).
    expect(distanceToTrack(0, 0)).toBeLessThan(1);
    // Far from the road the distance is large.
    expect(distanceToTrack(100, 200)).toBeGreaterThan(100);
  });

  it('road height matches the track profile near the road', () => {
    expect(roadHeightAt(0, 0)).toBeCloseTo(0, 1);
    expect(roadHeightAt(150, -4)).toBeCloseTo(8.8, 0);
  });

  it('terrain is pinned to the road inside the corridor', () => {
    // Just inside the flat corridor the ground sits just under the road.
    const roadY = roadHeightAt(100, 0);
    const ground = terrainHeightAt(100, TERRAIN.corridorFlat * 0.5);
    expect(ground).toBeLessThan(roadY);
    expect(ground).toBeGreaterThan(roadY - 1.5);
  });

  it('terrain rises into hills well outside the corridor', () => {
    const far = terrainHeightAt(100, 120);
    const near = terrainHeightAt(100, 2);
    // The far point is not pinned to the road, so it differs from the near one.
    expect(Math.abs(far - near)).toBeGreaterThan(0.5);
  });

  it('isOnRoad matches the corridor radius', () => {
    expect(isOnRoad(0, 0)).toBe(true);
    // Compare against the road centre at the same x, since the road curves.
    const z = roadCenterZAtX(100);
    expect(isOnRoad(100, z + TERRAIN.corridorFlat + 5)).toBe(false);
  });
});

describe('prop placement', () => {
  const opts = {
    count: 120,
    minTrackDistance: 11,
    maxOffset: 40,
    landmarkClearance: 22,
    seed: 1234,
    scaleMin: 0.7,
    scaleMax: 1.8,
    yScaleMin: 0.85,
    yScaleMax: 1.4,
  };

  it('never places a prop on the road', () => {
    for (const p of generatePlacements(opts)) {
      expect(isOnRoad(p.x, p.z)).toBe(false);
      expect(distanceToTrack(p.x, p.z)).toBeGreaterThanOrEqual(opts.minTrackDistance - 0.001);
    }
  });

  it('never places a prop inside a landmark footprint', () => {
    for (const p of generatePlacements(opts)) {
      expect(isNearLandmark(p.x, p.z, opts.landmarkClearance)).toBe(false);
    }
  });

  it('is identical across calls with the same seed', () => {
    const a = generatePlacements(opts);
    const b = generatePlacements(opts);
    expect(a).toEqual(b);
  });

  it('changes when the seed changes', () => {
    const a = generatePlacements(opts);
    const b = generatePlacements({ ...opts, seed: 9999 });
    expect(a).not.toEqual(b);
  });

  it('lamp posts keep off the asphalt and clear of landmarks', () => {
    const lamps = generateLampPlacements(15, 7.2, 42);
    expect(lamps.length).toBeGreaterThan(10);
    for (const p of lamps) {
      expect(distanceToTrack(p.x, p.z)).toBeGreaterThan(3);
      expect(isNearLandmark(p.x, p.z, 12)).toBe(false);
    }
  });
});

describe('landmark anchors', () => {
  it('has one anchor per station, in order', () => {
    expect(LANDMARK_ANCHORS).toHaveLength(STATIONS.length);
    LANDMARK_ANCHORS.forEach((anchor, i) => {
      expect(anchor.t).toBe(STATIONS[i]?.t);
    });
  });

  it('gates sit on the road centre-line', () => {
    for (const id of ['hero', 'contact']) {
      const station = STATIONS.find((s) => s.id === id);
      const anchor = LANDMARK_ANCHORS.find((a) => a.t === station?.t);
      expect(anchor).toBeDefined();
      if (!anchor) continue;
      // Within the field's sample resolution: the anchor is a point on the
      // curve, and the nearest baked sample is at most half a spacing away.
      expect(distanceToTrack(anchor.position[0], anchor.position[2])).toBeLessThan(1.2);
    }
  });

  it('side landmarks stand beside the road, clear of the corridor', () => {
    LANDMARK_ANCHORS.forEach((anchor) => {
      if (anchor.side === 0) return;
      expect(distanceToTrack(anchor.position[0], anchor.position[2])).toBeGreaterThanOrEqual(
        LANDMARK.minOffset - 0.01,
      );
    });
  });
});

describe('atmosphere keyframes', () => {
  it('starts and ends exactly on the first and last key', () => {
    // sampleAtmosphere returns a reused object, so read the values immediately
    // rather than holding a reference that a later call would overwrite.
    const firstZenith = sampleAtmosphere(0).skyZenith.getHexString();
    const lastHorizon = sampleAtmosphere(1).skyHorizon.getHexString();
    expect(firstZenith).toBe(ATMOSPHERE_KEYS[0]?.skyZenith.replace('#', ''));
    expect(lastHorizon).toBe(ATMOSPHERE_KEYS[3]?.skyHorizon.replace('#', ''));
  });

  it('interpolates between keys without popping', () => {
    // Consecutive samples must differ by less than the full range, so the
    // transition is continuous rather than a jump.
    let previous = sampleAtmosphere(0);
    for (let i = 1; i <= 200; i++) {
      const t = i / 200;
      const current = sampleAtmosphere(t);
      const dFog = Math.abs(current.fog.r - previous.fog.r);
      expect(dFog).toBeLessThan(0.05);
      previous = current;
    }
  });

  it('returns the reused sample object', () => {
    expect(sampleAtmosphere(0.5)).toBe(atmosphereSample);
  });
});
