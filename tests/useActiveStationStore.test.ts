/**
 * Pure unit tests for the Phase 4 station store maths.
 *
 * These cover the two pieces that are easy to get subtly wrong and awkward to
 * verify in a browser: the visibility ramp and the active-station hysteresis.
 * Both are pure functions of `t`, so they are tested directly rather than through
 * the DOM, where the outcome depends on frame timing as much as on the logic.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_HYSTERESIS,
  FADE_WIDTH,
  STATION_T,
  VISIBLE_HALF_WIDTH,
  resolveActiveIndex,
  stationVisibility,
} from '../src/hooks/useActiveStationStore';

describe('stationVisibility', () => {
  it('is fully opaque at the station itself', () => {
    for (const t of STATION_T) expect(stationVisibility(t, t)).toBe(1);
  });

  it('stays fully opaque across the visible half-width', () => {
    const edge = VISIBLE_HALF_WIDTH - 1e-9;
    expect(stationVisibility(0.15 + edge, 0.15)).toBe(1);
    expect(stationVisibility(0.15 - edge, 0.15)).toBe(1);
  });

  it('is symmetric in both directions', () => {
    for (const d of [0.031, 0.04, 0.05, 0.058]) {
      expect(stationVisibility(0.15 + d, 0.15)).toBeCloseTo(
        stationVisibility(0.15 - d, 0.15),
        10,
      );
    }
  });

  it('falls to zero at the end of the fade and never goes negative', () => {
    const edge = VISIBLE_HALF_WIDTH + FADE_WIDTH;
    expect(stationVisibility(0.15 + edge, 0.15)).toBe(0);
    expect(stationVisibility(0.15 + edge + 0.2, 0.15)).toBe(0);
    expect(stationVisibility(0.15 + edge + 5, 0.15)).toBe(0);
  });

  it('decreases monotonically through the fade', () => {
    let previous = 1;
    for (let d = 0; d <= VISIBLE_HALF_WIDTH + FADE_WIDTH + 1e-6; d += 0.002) {
      const v = stationVisibility(0.15 + d, 0.15);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });

  it('never leaves two stations fully opaque at once', () => {
    // The core acceptance requirement: one card on screen at a time.
    for (let t = 0; t <= 1; t += 0.0005) {
      const opaque = STATION_T.filter((st) => stationVisibility(t, st) > 0.5).length;
      expect(opaque).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolveActiveIndex', () => {
  it('starts at the first station', () => {
    expect(resolveActiveIndex(0, 0)).toBe(0);
  });

  it('holds the current station inside the hysteresis dead band', () => {
    // Exactly on the about/experience midpoint (0.235).
    expect(resolveActiveIndex(0.235, 1)).toBe(1);
    expect(resolveActiveIndex(0.235, 2)).toBe(2);
    // And just inside the band on either side.
    const boundary = 0.235;
    expect(resolveActiveIndex(boundary + ACTIVE_HYSTERESIS - 1e-6, 1)).toBe(1);
    expect(resolveActiveIndex(boundary - ACTIVE_HYSTERESIS + 1e-6, 2)).toBe(2);
  });

  it('moves once the gap is cleared', () => {
    expect(resolveActiveIndex(0.235 + ACTIVE_HYSTERESIS + 1e-6, 1)).toBe(2);
    expect(resolveActiveIndex(0.235 - ACTIVE_HYSTERESIS - 1e-6, 2)).toBe(1);
  });

  it('does not chatter when the input oscillates around a boundary', () => {
    // A jittery signal centred on the boundary must still produce one stable
    // answer, not a stream of index changes.
    let index = 1;
    const seen: number[] = [];
    for (let i = 0; i < 500; i++) {
      const jitter = ((i % 2) * 2 - 1) * 0.002;
      index = resolveActiveIndex(0.235 + jitter, index);
      seen.push(index);
    }
    expect(new Set(seen).size).toBe(1);
  });

  it('walks the whole ride forwards and backwards', () => {
    let index = 0;
    const forward: number[] = [index];
    for (let t = 0; t <= 1.0001; t += 0.001) {
      index = resolveActiveIndex(t, index);
      forward[index] = index;
    }
    expect(index).toBe(STATION_T.length - 1);

    for (let t = 1; t >= -1e-9; t -= 0.001) {
      index = resolveActiveIndex(t, index);
    }
    expect(index).toBe(0);
  });

  it('clamps an out-of-range starting index', () => {
    expect(resolveActiveIndex(0.5, -5)).toBeGreaterThanOrEqual(0);
    expect(resolveActiveIndex(0.5, 99)).toBeLessThanOrEqual(STATION_T.length - 1);
  });
});
