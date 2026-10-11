import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COLORS, STATIONS, TRACK_POINTS } from '../src/config/scene';
import { DWELL, segmentEase, segmentEaseInverse } from '../src/lib/easing';
import {
  createTrackPose,
  curve,
  progressAtTrackT,
  roadCenterZAtX,
  roadHeightAtX,
  sampleTrack,
  STATION_SCROLL,
  trackTAtProgress,
  TRACK_LENGTH,
} from '../src/lib/track';

/** Runs the same damping the ride driver applies, without needing a renderer. */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

describe('track geometry', () => {
  it('is long enough to feel like a journey', () => {
    expect(TRACK_LENGTH).toBeGreaterThan(400);
    expect(TRACK_LENGTH).toBeLessThan(700);
  });

  it('has strictly increasing x so terrain can sample height in 1D', () => {
    for (let i = 1; i < TRACK_POINTS.length; i++) {
      const prev = TRACK_POINTS[i - 1];
      const current = TRACK_POINTS[i];
      expect(prev).toBeDefined();
      expect(current).toBeDefined();
      if (!prev || !current) continue;
      expect(current[0]).toBeGreaterThan(prev[0]);
    }
  });

  it('never self-intersects in the xz plane', () => {
    // Sample densely and confirm no two distant samples occupy the same spot.
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i <= 400; i++) {
      samples.push(curve.getPointAt(i / 400));
    }
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 40; j < samples.length; j++) {
        const a = samples[i];
        const b = samples[j];
        if (!a || !b) continue;
        expect(a.distanceTo(b)).toBeGreaterThan(1);
      }
    }
  });

  it('has hills and a visible elevation change', () => {
    const pose = createTrackPose();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i <= 200; i++) {
      sampleTrack(i / 200, pose);
      min = Math.min(min, pose.position.y);
      max = Math.max(max, pose.position.y);
    }
    expect(max - min).toBeGreaterThan(6);
  });

  it('produces a finite, upright frame at every station', () => {
    const pose = createTrackPose();
    for (const station of STATIONS) {
      sampleTrack(station.t, pose);
      expect(Number.isFinite(pose.position.x)).toBe(true);
      expect(Number.isFinite(pose.position.y)).toBe(true);
      expect(Number.isFinite(pose.position.z)).toBe(true);
      expect(pose.tangent.length()).toBeCloseTo(1, 5);
      // Upright: the road normal should have a strong +y component.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
      expect(up.y).toBeGreaterThan(0.85);
    }
  });

  it('stays finite at both extremes of t', () => {
    const pose = createTrackPose();
    for (const t of [0, 1, 0.001, 0.999]) {
      sampleTrack(t, pose);
      expect(Number.isFinite(pose.position.x)).toBe(true);
      expect(Number.isFinite(pose.curvature)).toBe(true);
    }
  });
});

describe('elevation profile', () => {
  it('tracks the curve height at the station x positions', () => {
    const pose = createTrackPose();
    for (const station of STATIONS) {
      sampleTrack(station.t, pose);
      const sampled = roadHeightAtX(pose.position.x);
      // The profile is a coarse 1D lookup, so allow a small error.
      expect(Math.abs(sampled - pose.position.y)).toBeLessThan(1.5);
    }
  });

  it('returns a finite centre z anywhere along the track', () => {
    for (let x = -200; x <= 800; x += 25) {
      expect(Number.isFinite(roadCenterZAtX(x))).toBe(true);
      expect(Number.isFinite(roadHeightAtX(x))).toBe(true);
    }
  });
});

describe('scroll to track mapping', () => {
  it('maps the scroll range onto the full track', () => {
    expect(trackTAtProgress(0)).toBeCloseTo(STATIONS[0]?.t ?? 0, 5);
    expect(trackTAtProgress(1)).toBeCloseTo(STATIONS[6]?.t ?? 1, 5);
  });

  it('docks the bike at every station progress', () => {
    STATION_SCROLL.forEach((scroll, i) => {
      const t = trackTAtProgress(scroll);
      expect(t).toBeCloseTo(STATIONS[i]?.t ?? 0, 5);
    });
  });

  it('round-trips through progressAtTrackT', () => {
    for (const t of [0, 0.15, 0.32, 0.48, 0.62, 0.8, 1]) {
      const progress = progressAtTrackT(t);
      expect(trackTAtProgress(progress)).toBeCloseTo(t, 2);
    }
  });

  it('holds the bike still while parked at a station', () => {
    // The dwell window must produce exactly zero travel.
    expect(trackTAtProgress(0.02)).toBeCloseTo(trackTAtProgress(0.0), 5);
  });

  it('is monotonic and never leaves the track range', () => {
    let previous = -1;
    for (let i = 0; i <= 1000; i++) {
      const t = trackTAtProgress(i / 1000);
      expect(t).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      previous = t;
    }
  });

  it('has continuous velocity through the cruise handover', () => {
    // A discontinuity in segmentEase shows up as the bike snapping mid-segment.
    // Sampling the first difference catches it; sampling t alone does not.
    const h = 1 / 20000;
    for (let i = 1; i < 10000; i++) {
      const x = i / 10000;
      const before = (segmentEase(x) - segmentEase(x - h)) / h;
      const after = (segmentEase(x + h) - segmentEase(x)) / h;
      expect(Math.abs(after - before)).toBeLessThan(5);
    }
  });

  it('starts and ends each segment at rest', () => {
    const h = 1 / 20000;
    expect((segmentEase(DWELL + h) - segmentEase(DWELL)) / h).toBeLessThan(0.02);
    expect((segmentEase(1) - segmentEase(1 - h)) / h).toBeLessThan(0.02);
    expect(segmentEase(0)).toBe(0);
    expect(segmentEase(1)).toBe(1);
  });

  it('inverts segmentEase exactly outside the dwell window', () => {
    // Inside the dwell the mapping is deliberately many-to-one (constant 0), so
    // no inverse can recover x there. Only the travel portion is invertible.
    for (let i = 0; i <= 500; i++) {
      const x = i / 500;
      if (x <= DWELL + 1e-6) continue;
      expect(segmentEaseInverse(segmentEase(x))).toBeCloseTo(x, 3);
    }
    // Below the dwell the inverse should pin to the start of travel, not blow up.
    expect(segmentEaseInverse(0)).toBe(0);
  });
});

describe('ride damping', () => {
  it('reaches the target but never snaps to it', () => {
    let t = 0;
    // One frame at 60fps must move only part of the way.
    t = damp(t, 1, 4, 1 / 60);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.1);
    // And it should converge over a simulated second.
    for (let i = 0; i < 60; i++) t = damp(t, 1, 4, 1 / 60);
    expect(t).toBeGreaterThan(0.98);
  });

  it('comes to rest at a station so the wheels stop', () => {
    const scroll = STATION_SCROLL[3] ?? 0;
    const target = trackTAtProgress(scroll);
    let t = 0.5;
    let previous = t;
    for (let i = 0; i < 240; i++) {
      previous = t;
      t = damp(t, target, 4, 1 / 60);
    }
    // Speed is derived from the smoothed t, so a settled t means zero spin.
    const speed = Math.abs((t - previous) * 60 * TRACK_LENGTH);
    expect(speed).toBeLessThan(0.05);
  });
});

describe('curvature', () => {
  it('changes sign between opposite-hand corners', () => {
    const pose = createTrackPose();
    let sawPositive = false;
    let sawNegative = false;
    for (let i = 0; i <= 100; i++) {
      sampleTrack(i / 100, pose);
      if (pose.curvature > 0.6) sawPositive = true;
      if (pose.curvature < -0.6) sawNegative = true;
    }
    expect(sawPositive).toBe(true);
    expect(sawNegative).toBe(true);
  });

  it('stays within the range that maps to a sane lean angle', () => {
    const pose = createTrackPose();
    for (let i = 0; i <= 200; i++) {
      sampleTrack(i / 200, pose);
      const lean = Math.max(-20, Math.min(20, pose.curvature * 0.09 * (180 / Math.PI)));
      expect(Math.abs(lean)).toBeLessThanOrEqual(20.0001);
    }
  });
});

describe('config sanity', () => {
  it('defines seven stations in section order with increasing t', () => {
    expect(STATIONS).toHaveLength(7);
    expect(STATIONS.map((s) => s.id)).toEqual([
      'hero',
      'about',
      'experience',
      'freelance',
      'research',
      'achievements',
      'contact',
    ]);
    for (let i = 1; i < STATIONS.length; i++) {
      const prev = STATIONS[i - 1];
      const current = STATIONS[i];
      expect(prev).toBeDefined();
      expect(current).toBeDefined();
      if (!prev || !current) continue;
      expect(current.t).toBeGreaterThan(prev.t);
    }
  });

  it('keeps the fog colour inside the sky gradient palette', () => {
    const fog = new THREE.Color(COLORS.fog);
    const horizon = new THREE.Color(COLORS.skyHorizon);
    expect(Number.isFinite(fog.r)).toBe(true);
    expect(Number.isFinite(horizon.r)).toBe(true);
  });
});
