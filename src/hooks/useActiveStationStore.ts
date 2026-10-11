import { STATIONS as STATION_MARKERS } from '../config/scene';
import { STATIONS, type StationId } from '../data/content';
import { clamp, smoothstep } from '../lib/easing';
import { trackTAtProgress } from '../lib/rideMath';
import { getRide, isRideDriverActive } from './useScrollProgress';

/**
 * ============================================================================
 * STATION STATE
 * ============================================================================
 * One store, three consumers: the section overlay, the nav and the mini-map.
 *
 * The values split cleanly in two:
 *
 *  - Discrete (`activeId`, `activeIndex`) changes at most a handful of times per
 *    ride, so it goes through React state (see `useActiveStation.tsx`).
 *  - Continuous (`t`, `localProgress`, `visibility`) changes every frame, so it
 *    never touches React. Components register a frame listener and write to
 *    refs, CSS variables or SVG attributes directly.
 *
 * Keeping them apart is what stops the overlay re-rendering seven sections sixty
 * times a second while the rider scrolls.
 *
 * This module deliberately has no React import: the store is plain module state,
 * and the context that publishes the discrete half lives next door.
 */

/** Fully opaque within this distance of a station's `t`. */
export const VISIBLE_HALF_WIDTH = 0.03;
/** Additional distance on each side over which the card fades out. */
export const FADE_WIDTH = 0.03;
/**
 * Dead band around a station boundary. Without it, a rider parked exactly on the
 * midpoint between two stations would flip the active card every time the ride
 * damping settled a fraction closer, and the card would strobe.
 */
export const ACTIVE_HYSTERESIS = 0.008;

/**
 * Track position of each station, in ride order.
 *
 * Exported so the visibility and hysteresis maths can be tested directly,
 * without standing up the ticker or waiting on frames.
 */
export const STATION_T: readonly number[] = STATION_MARKERS.map((marker) => marker.t);

export interface ActiveStation {
  /** Damped position along the ride, 0..1. */
  t: number;
  /** The one station currently owning the screen. */
  activeId: StationId;
  activeIndex: number;
  /**
   * How far the bike is between the active station and the next one, 0..1.
   * Stays 0 at the last station, which has nowhere left to travel.
   */
  localProgress: number;
  /** Visibility of the active station's card, 0..1. */
  visibility: number;
  /** Visibility of every station's card, indexed in `STATIONS` order. */
  readonly visibilities: readonly number[];
}

/** Internal mutable form. The public type only widens `visibilities` to readonly. */
interface StationState extends ActiveStation {
  visibilities: number[];
}

/** Card opacity at track position `t` for a station docked at `stationT`. */
export function stationVisibility(t: number, stationT: number): number {
  const distance = Math.abs(t - stationT);
  if (distance <= VISIBLE_HALF_WIDTH) return 1;
  const remaining = 1 - (distance - VISIBLE_HALF_WIDTH) / FADE_WIDTH;
  return remaining <= 0 ? 0 : smoothstep(remaining);
}

/** Midpoint in `t` between station `index` and the next one. */
function boundary(index: number): number {
  const a = STATION_T[index] ?? 0;
  const b = STATION_T[index + 1] ?? a;
  return (a + b) / 2;
}

/**
 * Which station owns the screen, with hysteresis.
 *
 * The index only moves once `t` clears a boundary by `ACTIVE_HYSTERESIS`, and
 * only moves back once `t` drops below it by the same amount, so a value resting
 * on a boundary settles on one side instead of chattering.
 */
export function resolveActiveIndex(t: number, current: number): number {
  let index = clamp(current, 0, STATION_T.length - 1);
  while (index < STATION_T.length - 1 && t > boundary(index) + ACTIVE_HYSTERESIS) index += 1;
  while (index > 0 && t < boundary(index - 1) - ACTIVE_HYSTERESIS) index -= 1;
  return index;
}

const state: StationState = {
  t: 0,
  activeId: STATIONS[0]?.id ?? 'hero',
  activeIndex: 0,
  localProgress: 0,
  visibility: 1,
  visibilities: STATION_T.map((t) => stationVisibility(0, t)),
};

/**
 * The discrete snapshot handed to React.
 *
 * `useSyncExternalStore` compares snapshots with `Object.is`, so this object is
 * only ever replaced when the active station changes. Building a fresh object on
 * every read would look like a change on every read and re-render forever.
 */
let discrete: { activeId: StationId; activeIndex: number } = {
  activeId: state.activeId,
  activeIndex: state.activeIndex,
};

export interface StationSnapshot {
  readonly activeId: StationId;
  readonly activeIndex: number;
}

export function getStationSnapshot(): StationSnapshot {
  return discrete;
}

const stateListeners = new Set<() => void>();
const frameListeners = new Set<() => void>();

/**
 * Live station state. Read inside a frame listener; never read it during render,
 * because these values change without a render ever happening.
 */
export function readActiveStation(): ActiveStation {
  return state;
}

function emit(): void {
  for (const listener of stateListeners) listener();
}

/** Recomputes every derived value from a new `t`. */
function update(t: number): void {
  const previousIndex = state.activeIndex;
  const nextIndex = resolveActiveIndex(t, previousIndex);

  state.t = t;
  for (let i = 0; i < state.visibilities.length; i++) {
    state.visibilities[i] = stationVisibility(t, STATION_T[i] ?? 0);
  }
  state.visibility = state.visibilities[nextIndex] ?? 0;

  if (nextIndex === previousIndex) return;

  state.activeIndex = nextIndex;
  state.activeId = STATION_MARKERS[nextIndex]?.id ?? STATIONS[0]?.id ?? 'hero';
  discrete = { activeId: state.activeId, activeIndex: nextIndex };
  const from = STATION_T[nextIndex] ?? 0;
  const to = STATION_T[nextIndex + 1];
  state.localProgress = to === undefined || to === from ? 0 : clamp((t - from) / (to - from));
  emit();
}

/**
 * Runs the store. One rAF loop, mounted once by `ActiveStationProvider`, feeding
 * every frame listener in the same tick so the overlay, nav and mini-map can
 * never disagree about where the bike is.
 */
export function startStationTicker(): () => void {
  let frame = 0;
  const tick = () => {
    const ride = getRide();
    // With the canvas running, `t` is the damped value from the render loop and
    // carries the bike's weight. Without it (no WebGL) nothing damps `t`, so the
    // raw scroll-to-track mapping stands in and the content still tracks scroll.
    update(isRideDriverActive() ? ride.t : trackTAtProgress(ride.progress));
    for (const listener of frameListeners) listener();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** Subscribe to the discrete state. Fires only when the active station changes. */
export function subscribeActiveStation(listener: () => void): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Subscribe to every frame. The callback must not set state with a continuous value. */
export function onStationFrame(listener: () => void): () => void {
  frameListeners.add(listener);
  return () => {
    frameListeners.delete(listener);
  };
}
