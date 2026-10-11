import { STATIONS } from '../config/scene';
import { MAGNET } from '../config/effects';
import { clamp, segmentEase, segmentEaseInverse } from './easing';

/**
 * ============================================================================
 * RIDE MATH — NO THREE.JS
 * ============================================================================
 *
 * The pure half of `lib/track`: scroll progress <-> track position, station
 * docking positions, the settle magnet. Nothing here constructs a vector, a
 * curve or a quaternion, which is what lets the scroll driver, the station
 * store, the progress bar and the 2D fallback import it without downloading the
 * renderer.
 *
 * `lib/track` owns the 3D geometry (the spline, its length, pose sampling) and
 * re-exports everything here, so 3D code keeps importing from `lib/track` and
 * 2D/entry code imports from here. The rule: if the module will ever load in
 * 2D mode — directly or transitively — it imports from this file, never from
 * `lib/track`.
 */

/** Gaps between adjacent stations. */
export const SEGMENT_COUNT = STATIONS.length - 1;

/**
 * Scroll progress (0..1) at which each station is docked and the bike is parked.
 * Scroll is divided into equal spans regardless of how far apart the stations
 * sit on the spline, so every gap gets the same amount of scroll travel.
 */
export const STATION_SCROLL: readonly number[] = STATIONS.map((_, i) => i / SEGMENT_COUNT);

/** Track-space `t` of each station, in section order. */
export const STATION_TRACK_T: readonly number[] = STATIONS.map((s) => s.t);

/**
 * Pulls `t` gently toward the nearest station inside its magnetic region.
 *
 * The "settle": within `MAGNET.radius` of a station's `t`, the position is
 * eased a fraction of the way toward that station, weighted by a smoothstep
 * that is zero at the region's edge and `MAGNET.strength` at its centre. The
 * effect is asymmetric in the way that matters — it never pulls a position that
 * is already exactly on the station, so it cannot fight the dwell — and it acts
 * on `t` only, never on scroll. The reader's scroll position is untouched, so
 * leaving a station is exactly as easy as arriving at one.
 *
 * Monotonic within the region, which matters: the derivative is
 * `1 - strength * w'(d)`, always positive for `strength < 1`, so the bike can
 * never reverse inside the magnet.
 */
export function applyStationMagnet(t: number): number {
  let nearest = STATION_TRACK_T[0] ?? 0;
  let bestDistance = Infinity;
  for (const stationT of STATION_TRACK_T) {
    const distance = Math.abs(t - stationT);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = stationT;
    }
  }

  if (bestDistance >= MAGNET.radius || bestDistance < 1e-9) return t;

  // 0 at the region's edge, 1 at the station.
  const weight = 1 - bestDistance / MAGNET.radius;
  const eased = weight * weight * (3 - 2 * weight);
  return t + (nearest - t) * eased * MAGNET.strength;
}

/**
 * Scroll progress (0..1) -> position along the track (0..1).
 *
 * Scroll is split into equal spans, one per gap between adjacent stations.
 * Inside a span, position comes from `segmentEase`: the bike holds still while
 * the reader reads the station, then accelerates, cruises, and eases into the
 * next dock.
 */
export function trackTAtProgress(progress: number): number {
  const scaled = clamp(progress) * SEGMENT_COUNT;
  const index = Math.min(Math.floor(scaled), SEGMENT_COUNT - 1);
  const from = STATION_TRACK_T[index] ?? 0;
  const to = STATION_TRACK_T[index + 1] ?? from;
  return applyStationMagnet(from + (to - from) * segmentEase(scaled - index));
}

/** Position along the track (0..1) -> scroll progress (0..1). */
export function progressAtTrackT(t: number): number {
  const value = clamp(t);
  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const a = STATION_TRACK_T[i] ?? 0;
    const b = STATION_TRACK_T[i + 1] ?? a;
    if (value <= b || i === SEGMENT_COUNT - 1) {
      const local = b === a ? 0 : (value - a) / (b - a);
      return (i + segmentEaseInverse(local)) / SEGMENT_COUNT;
    }
  }
  return 1;
}
