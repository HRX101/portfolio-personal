import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  QUALITY_LEVELS,
  QUALITY_LEVELS_TABLE,
  type QualityLevel,
  type QualitySettings,
} from '../config/quality';
import { parseQualityOverride } from '../lib/capabilities';
import { isSoftwareRenderer, type DeviceProfile } from './useIsLowEnd';

/**
 * ============================================================================
 * QUALITY RESOLUTION
 * ============================================================================
 *
 * Resolves the active `QualitySettings` and lets the debug overlay override the
 * level at runtime. Two very different kinds of state share this module:
 *
 *  - The *level* changes a dozen times in a dev session (L/M/H keys) and once in
 *    a user's life (their hardware). It goes through React, because components
 *    genuinely need to mount and unmount when it changes — that is the whole
 *    mechanism by which LOW removes the trail rather than hiding it.
 *  - Everything the effects read per frame (trail brightness, dust rate, FOV
 *    kick) is *continuous*, so it is derived inside the frame loops from
 *    `getQuality()`, never from React state.
 *
 * The store lives in module scope rather than a context because the 3D layer
 * reads it from `useFrame`, outside React's tree entirely.
 */

/* -------------------------------------------------------------------------- */
/* Reduced-motion variants                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Reduced-motion settings per level, built once at module scope.
 *
 * Returning a frozen singleton matters: a freshly built object on every render
 * would remount every effect consumer each time a media query fired.
 *
 * Only the two effects a reader perceives as *motion* are switched off. The
 * trail streaks across the screen and the FOV kick changes the whole framing, so
 * both go. Dust stays — it sits behind the bike, drifts at low contrast, and
 * carries no vestibular load — as do bloom and every world setting, because a
 * reader who asked for less animation should not silently also get a flatter
 * world.
 */
const REDUCED_MOTION: Record<QualityLevel, QualitySettings> = Object.freeze(
  Object.fromEntries(
    QUALITY_LEVELS.map((level) => {
      const base = QUALITY_LEVELS_TABLE[level];
      return [
        level,
        Object.freeze({ ...base, trail: false, cameraKick: false, cursorEffects: false }),
      ];
    }),
  ) as Record<QualityLevel, QualitySettings>,
);

/* -------------------------------------------------------------------------- */
/* Level store                                                                 */
/* -------------------------------------------------------------------------- */

type Listener = () => void;

/**
 * `null` = follow the device profile. Seeded from `?quality=` when present, so
 * a pinned tier survives from the first frame rather than flashing the
 * auto-detected tier first. Set at runtime by the debug overlay's L/M/H keys.
 *
 * This is the store the 3D tree actually reads (`getQuality`, `useQuality`,
 * `useQualityLevel`). The capabilities hook keeps a parallel
 * `recommendedQuality` for the 2D side and for reporting; the two agree because
 * they seed from the same query parser.
 */
let override: QualityLevel | null = parseQualityOverride();

/**
 * Whether the reader has asked for reduced motion, mirrored into module scope so
 * `getQuality()` can reach it.
 *
 * This flag is the reason the reduced-motion variants are a table rather than a
 * boolean checked at each call site. The effects that matter most — the trail and
 * the camera kick — are updated from `useFrame`, below React entirely, and were
 * reading the raw quality table. Every per-frame consumer therefore ignored the
 * preference completely, and the `trail: false` / `cameraKick: false` entries in
 * `REDUCED_MOTION` were true statements about an object nothing on the hot path
 * ever consulted.
 */
let reducedMotionActive = false;

/** Set once, by the first `useQuality` mount. See `seeded` below. */
let detected: QualityLevel = 'MEDIUM';
/**
 * Guards the one-time seed. Without it, a second `useQuality` mount — a remount
 * under Strict Mode, or a future second consumer — would re-run detection and
 * overwrite `detected`, which `useQualityLevel` reads during render as a stable
 * value. Seeding once keeps `detected` immutable after startup, so it is safe to
 * read without being a snapshot.
 */
let seeded = false;

const listeners = new Set<Listener>();

/** Current override, or null when following the device. */
export const getQualityOverride = (): QualityLevel | null => override;

/**
 * The resolved settings for the active level, reduced-motion aware.
 *
 * Callable from frame loops; returns a stable frozen object from the tables rather
 * than building one per call, so a per-frame `getQuality()` is two property reads
 * and a table lookup.
 *
 * Derived per call rather than cached behind an invalidation flag, because the
 * inputs are all module state anyway and deriving removes any chance of a frame
 * reading a stale object after a level or preference change.
 */
export const getQuality = (): QualitySettings => {
  const level = override ?? detected;
  return reducedMotionActive ? REDUCED_MOTION[level] : QUALITY_LEVELS_TABLE[level];
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getLevelSnapshot = (): QualityLevel => override ?? detected;

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Sets the level explicitly, or passes `null` to hand control back to the device
 * profile. Every consumer re-renders, which is what makes a LOW switch actually
 * pull the trail and dust out of the scene graph.
 */
export function setQualityOverride(level: QualityLevel | null): void {
  if (override === level) return;
  override = level;
  notify();
}

/** Cycles LOW -> MEDIUM -> HIGH -> LOW. Bound to a debug key. */
export function cycleQuality(): QualityLevel {
  const index = QUALITY_LEVELS.indexOf(getLevelSnapshot());
  const next = QUALITY_LEVELS[(index + 1) % QUALITY_LEVELS.length] ?? 'HIGH';
  setQualityOverride(next);
  return next;
}

/* -------------------------------------------------------------------------- */
/* Device detection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Picks a starting level. Desktop defaults to HIGH, as the brief requires.
 *
 * Ordered by how decisive each signal is. A dead context outranks everything,
 * because with no WebGL the 2D fallback is the only thing left to draw. A
 * software rasteriser outranks the tier heuristic, because the heuristic measures
 * the CPU and the bottleneck on a software renderer is CPU fill rate: SwiftShader
 * in CI reports a desktop-class core count, scores `high`, and then runs the
 * mip-blurred bloom chain at a fraction of the frame rate it costs a real GPU.
 *
 * A phone outranks the heuristic for the same reason in the other direction:
 * an 8-core phone with 4 GB of memory scores `high` on paper, but a phone GPU
 * under thermal throttling is not a desktop GPU, and HIGH's bloom chain is the
 * single most expensive thing in the frame. MEDIUM keeps the trail — the
 * strongest speed cue — and drops everything that scales worst.
 *
 * `prefers-reduced-motion` is *not* handled here: it trims motion effects from an
 * otherwise-capable level rather than dropping the whole tier.
 */
export function detectQualityLevel(device: DeviceProfile): QualityLevel {
  if (device.webglFailed) return 'LOW';
  if (isSoftwareRenderer(device.renderer)) return 'LOW';
  if (device.isMobile) return device.tier === 'low' ? 'LOW' : 'MEDIUM';
  if (device.tier === 'low') return 'LOW';
  if (device.tier === 'mid') return 'MEDIUM';
  return 'HIGH';
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The active quality settings.
 *
 * Mount once, high in the tree. The returned object is stable per (level,
 * reduced-motion) pair, so passing it down as a prop or using it in a dependency
 * array is safe.
 */
export function useQuality(device: DeviceProfile, reducedMotion = false): QualitySettings {
  // `useState`'s initialiser runs exactly once per mount and is the idiomatic
  // place to seed module state during the first render. Guarded so `detected`
  // stays immutable after startup.
  useState(() => {
    if (!seeded) {
      detected = detectQualityLevel(device);
      seeded = true;
    }
  });

  /*
   * Mirrored into module scope so the frame loops can see the preference.
   *
   * In an effect rather than during render so the component keeps no side effects
   * in its body, which means a reader who flips the OS setting mid-session gets
   * the trail back within one frame. That single frame is not an accessibility
   * regression worth contorting the render path for.
   */
  useEffect(() => {
    reducedMotionActive = reducedMotion;
  }, [reducedMotion]);

  const { level } = useQualityLevel();
  return reducedMotion ? REDUCED_MOTION[level] : QUALITY_LEVELS_TABLE[level];
}

export interface QualityLevelState {
  /** Level currently in force. */
  level: QualityLevel;
  /** True when no manual override is set, i.e. the device profile decides. */
  auto: boolean;
  /** Level the device profile chose, so the overlay can read "auto (HIGH)". */
  detected: QualityLevel;
}

/**
 * Subscribes to level changes without dragging in the settings table.
 *
 * Separate from `useQuality` because the two have very different audiences: every
 * scene component needs the settings, but only the debug overlay needs to know
 * *that* the level changed. Adding a field to the table therefore never causes
 * the overlay to re-render, and toggling the overlay never re-renders the scene.
 *
 * Dev-only in practice — `DebugOverlay` is the only caller, and it is stripped
 * from production builds along with the overlay itself.
 */
export function useQualityLevel(): QualityLevelState {
  const level = useSyncExternalStore(subscribe, getLevelSnapshot, getLevelSnapshot);

  /*
   * The auto flag is read during render and reconciled with state rather than
   * subscribed to. `override` is module state mutated by the same keyboard
   * handler this component already listens to via `subscribe`, so the level
   * snapshot re-renders this component on every override change — at which point
   * reading `override` during render is always current, and the derived boolean
   * needs no store of its own. `detected` never changes after first mount, so it
   * is captured as state.
   */
  return { level, auto: override === null, detected };
}
