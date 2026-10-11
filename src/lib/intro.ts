/**
 * ============================================================================
 * INTRO SEQUENCE STATE
 * ============================================================================
 *
 * Plain module state, deliberately not React.
 *
 * The intro is read by two callers on opposite sides of the Canvas boundary: the
 * DOM loader needs to know when to fade out and when to release the scroll lock,
 * and `CameraRig` needs to know how far through the glide it is, every frame, from
 * inside a `useFrame`. Routing that through a context would mean either putting
 * React state in the frame loop or a second subscription mechanism; a module with
 * two functions is smaller than either.
 *
 * Nothing here allocates per frame. The camera reads `intro.progress` and
 * `intro.offset`, both plain numbers, and interpolates from them.
 */

import { INTRO } from '../config/effects';
import { clamp } from './easing';

export interface IntroState {
  /** True from `start()` until `finish()`. Drives the camera blend. */
  active: boolean;
  /** 0..1 through the glide. Written by `tick`, read by the camera rig. */
  progress: number;
  /**
   * Seconds remaining. The loader reads this to size its "skip" affordance and to
   * know whether it is still waiting on something.
   */
  remaining: number;
  /** True once `finish()` has run, so the loader knows not to wait again. */
  done: boolean;
}

export const intro: IntroState = {
  active: false,
  progress: 0,
  remaining: 0,
  done: false,
};

let elapsed = 0;

/**
 * Starts the glide. Idempotent-ish: calling it while already active is ignored,
 * because React's StrictMode double-invokes effects in development and a second
 * start would restart the camera from the wide shot mid-glide.
 */
export function startIntro(): void {
  if (intro.active || intro.done) return;
  intro.active = true;
  intro.done = false;
  intro.progress = 0;
  intro.remaining = INTRO.glideMs / 1000;
  elapsed = 0;
}

/** Ends the glide immediately. Safe to call when already finished. */
export function finishIntro(): void {
  intro.active = false;
  intro.done = true;
  intro.progress = 1;
  intro.remaining = 0;
}

/** Whether the camera should still be blending from the opening shot. */
export function isIntroActive(): boolean {
  return intro.active;
}

/**
 * Advances the glide. Called from the camera rig's frame callback rather than a
 * timer, so the camera's blend and the DOM's "remaining seconds" can never drift
 * apart by a frame, and so a backgrounded tab does not fast-forward the intro.
 *
 * `dt` is expected to be already clamped by the caller.
 */
export function tickIntro(dt: number): void {
  if (!intro.active) return;
  elapsed += dt;
  const duration = INTRO.glideMs / 1000;
  intro.progress = clamp(elapsed / duration);
  intro.remaining = Math.max(0, duration - elapsed);
  if (intro.progress >= 1) finishIntro();
}

/**
 * Easing for the glide, applied here rather than in the rig so both the camera
 * and anything else that needs the intro's shape agree on it.
 *
 * An ease-in-out cubic: a linear move from a high wide shot into a chase rig
 * reads as a dolly, which is the intent, but a purely linear one also starts and
 * ends at full speed, which reads as a cut. `smootherstep` has zero derivative at
 * both ends, so the camera settles into the rig instead of arriving at it.
 */
export function introEase(progress: number): number {
  const t = clamp(progress);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
