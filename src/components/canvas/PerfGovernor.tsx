import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { setQualityOverride, getQualityOverride } from '../../hooks/useQuality';
import {
  PERF_STEP_FPS,
  PERF_OFFER_2D_FPS,
  PERF_WINDOW_SECONDS,
  PERF_RECOVERY_FPS,
} from '../../lib/capabilities';

/**
 * ============================================================================
 * PERFORMANCE GOVERNOR
 * ============================================================================
 *
 * Two cooperating mechanisms, because they answer different questions:
 *
 *  1. drei's `<PerformanceMonitor>` — a fast, per-frame signal. It reports a
 *     declining/inclining FPS factor and a rolling average, which is what the
 *     scale actually reacts to. React state, so it must not be wired to the
 *     frame loop directly.
 *
 *  2. A slow rolling average sampled in `useFrame`. drei's factor is reactive
 *     and can dip for a single slow frame; stepping quality on that would flip
 *     the level on the first garbage collection and leave it stuck low. The
 *     average over `PERF_WINDOW_SECONDS` is what earns a level change.
 *
 * Step-down is one-way per session. Oscillation is worse than a slightly low
 * tier: a scene that keeps rebuilding bloom and trail passes is both more
 * expensive than either steady state and visibly worse to look at. Recovery is
 * allowed only after a much longer clean window (`PERF_RECOVERY_FPS`), and only
 * if the user has not pinned a level with the debug overlay.
 *
 * Context loss is handled here rather than on the canvas from `App`, because the
 * canvas element only exists once React has committed it, and this component is
 * already guaranteed to be inside the tree at that point.
 */

/** Exposes the "offer 2D" flag to the UI layer. */
let offer2D = false;
export const getOffer2D = (): boolean => offer2D;
export const resetOffer2D = (): void => {
  offer2D = false;
};

/** Tracks whether we've already stepped down once this session. */
let hasSteppedDown = false;
export const resetHasSteppedDown = (): void => {
  hasSteppedDown = false;
};

/** Last measured average FPS (for dev tools). */
let lastFps = 60;
export const devGetAvgFps = (): number => lastFps;

/** drei's instantaneous performance factor, 0..1. Diagnostic only. */
let lastFactor = 1;
export const devGetPerfFactor = (): number => lastFactor;

const LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
type Level = (typeof LEVELS)[number];

function isLevel(value: string | null): value is Level {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW';
}

interface PerfGovernorProps {
  /** Rendered mode; the governor idles itself outside 3D. */
  mode: '3D' | '2D';
  /** Whether a real WebGL context exists — gates the performance work. */
  webgl: boolean;
  /** Called when the context is lost and cannot be restored. */
  onContextLost: () => void;
}

export function PerfGovernor({ mode, webgl, onContextLost }: PerfGovernorProps) {
  const frameCount = useRef(0);
  const fpsSum = useRef(0);
  const windowStart = useRef(0);
  const cleanStart = useRef(0);
  const gl = useThree((state) => state.gl);

  /*
   * Restarts the averaging window.
   *
   * Called on mount and whenever the mode changes, because the frames leading up
   * to a switch were spent on the *other* experience's workload: a 3D frame
   * budget is meaningless right after a 2D page that never drew a frame.
   */
  const restartWindow = (): void => {
    windowStart.current = performance.now();
    cleanStart.current = windowStart.current;
    frameCount.current = 0;
    fpsSum.current = 0;
  };

  useEffect(() => {
    restartWindow();
  }, [mode]);

  /*
   * Context loss and restoration.
   *
   * `gl.domElement` rather than `document.querySelector('canvas')`: the document
   * may hold the 2D-mode hidden canvas too, and the query would bind the
   * handlers to whichever one happened to come first in the DOM.
   *
   * Restoration gets a grace period. Drivers do drop and come back — a laptop
   * switching GPUs, a tab backgrounded by the OS compositor — and switching a
   * whole site to a different experience over a blip would be wrong. Only a
   * context that stays gone falls back to 2D.
   */
  useEffect(() => {
    const canvas = gl.domElement;
    if (typeof canvas.addEventListener !== 'function') return;

    let restorationTimeout: number | undefined;

    const onLost = (event: Event): void => {
      // Without this the browser never attempts restoration at all.
      event.preventDefault();
      console.warn('[PerfGovernor] WebGL context lost');

      restorationTimeout = window.setTimeout(() => {
        console.warn('[PerfGovernor] Context not restored after grace period; switching to 2D');
        onContextLost();
      }, 5000);
    };

    const onRestored = (): void => {
      if (restorationTimeout !== undefined) {
        clearTimeout(restorationTimeout);
        restorationTimeout = undefined;
      }
      // Restart the averaging window rather than folding a multi-second freeze
      // into it, which would otherwise average out as a catastrophic frame rate.
      restartWindow();
      console.warn('[PerfGovernor] WebGL context restored');
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (restorationTimeout !== undefined) clearTimeout(restorationTimeout);
    };
  }, [gl, onContextLost]);

  /*
   * Rolling average. `delta` is the actual frame interval the renderer is
   * achieving, so this measures real throughput rather than a target — which is
   * the number a user experiences.
   */
  useFrame((_, delta) => {
    if (mode !== '3D' || !webgl) return;

    frameCount.current += 1;
    fpsSum.current += 1 / Math.max(delta, 0.001);

    const elapsed = performance.now() - windowStart.current;
    if (elapsed < PERF_WINDOW_SECONDS * 1000 || frameCount.current === 0) return;

    /*
     * Stale window after an idle gap. The demand loop renders nothing while
     * parked, so the first frames after minutes of stillness would otherwise
     * average a multi-minute gap as a catastrophic frame rate — one slow
     * re-upload frame stepping the quality down for no reason. Restart the
     * window instead of judging it; the next evaluation then uses real data.
     */
    if (elapsed > PERF_WINDOW_SECONDS * 1000 * 4) {
      restartWindow();
      return;
    }

    const avgFps = fpsSum.current / frameCount.current;
    lastFps = avgFps;

    /*
     * The user's pin outranks everything. Someone who pressed L to compare tiers
     * must not have the governor pull the level back up mid-measurement, or the
     * per-tier FPS table in the debug overlay reports nonsense.
     */
    const pinned = getQualityOverride();
    const current: Level = isLevel(pinned) ? pinned : 'HIGH';

    if (pinned === null && current === 'HIGH') {
      if (avgFps >= PERF_RECOVERY_FPS) {
        cleanStart.current = windowStart.current;
      } else {
        cleanStart.current = 0;
      }
    }

    if (!isLevel(pinned)) {
      if (avgFps < PERF_STEP_FPS && current !== 'LOW' && !hasSteppedDown) {
        const next = LEVELS[LEVELS.indexOf(current) + 1];
        if (next) {
          console.warn(`[PerfGovernor] ${avgFps.toFixed(1)} fps < ${PERF_STEP_FPS}; stepping down to ${next}`);
          setQualityOverride(next);
          hasSteppedDown = true;
          cleanStart.current = 0;
        }
      } else if (
        current === 'LOW' &&
        avgFps < PERF_OFFER_2D_FPS &&
        mode === '3D'
      ) {
        /*
         * Even the cheapest tier cannot hold a frame budget worth looking at.
         * One-way latch: once raised it stays raised until the reader acts on it,
         * so a momentary dip cannot stack prompts or re-raise it while they read.
         */
        if (!offer2D) {
          console.warn(`[PerfGovernor] ${avgFps.toFixed(1)} fps < ${PERF_OFFER_2D_FPS} on LOW; offering 2D`);
          offer2D = true;
        }
      }

      /*
       * Recovery, after a longer unbroken clean stretch. Gated on `hasSteppedDown`
       * so it only ever undoes a downgrade this component performed.
       */
      if (
        hasSteppedDown &&
        cleanStart.current > 0 &&
        avgFps >= PERF_RECOVERY_FPS &&
        current !== 'HIGH'
      ) {
        const up = LEVELS[LEVELS.indexOf(current) - 1];
        if (up) {
          console.warn(`[PerfGovernor] sustained ${avgFps.toFixed(1)} fps; stepping up to ${up}`);
          setQualityOverride(up);
          hasSteppedDown = current === 'MEDIUM';
          cleanStart.current = performance.now();
        }
      }
    }

    frameCount.current = 0;
    fpsSum.current = 0;
    windowStart.current = performance.now();
  });

  if (mode !== '3D' || !webgl) return null;

  return (
    <PerformanceMonitor
      /*
       * `bounds` is a function of the display's refresh rate, and drei measures
       * it itself. Bounding to a fraction of the actual panel matters on a 120 Hz
       * laptop, where a fixed 58 ceiling would sit above half the refresh rate
       * and therefore read as "healthy" while looking like a 30 fps slideshow.
       */
      bounds={(refreshrate) => [refreshrate * 0.5, refreshrate * 0.95]}
      flipflops={3}
      onChange={(api) => {
        /*
         * drei's own factor, surfaced for the debug overlay and for anyone
         * debugging a regression with the browser's own FPS overlay. It is not
         * used to drive quality directly — see the note at the top about single
         * frames flipping the level.
         */
        lastFactor = api.factor;
      }}
      onFallback={() => {
        /*
         * drei gives up when the frame rate stays under its floor. This is the
         * strongest signal available that 3D is not viable here, and unlike the
         * FPS average it accounts for the renderer reporting it directly.
         */
        console.warn('[PerformanceMonitor] Fell below the playable floor; offering 2D');
        offer2D = true;
      }}
    />
  );
}