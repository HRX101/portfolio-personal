import { useEffect } from 'react';
import { invalidate, useFrame } from '@react-three/fiber';
import { MAX_SPEED } from '../../config/effects';
import { clamp } from '../../lib/easing';
import { TRACK_LENGTH } from '../../lib/track';
import { trackTAtProgress } from '../../lib/rideMath';
import {
  RIDE_LAMBDA,
  getRide,
  markRideDriverActive,
  markRideDriverInactive,
  nearestStation,
} from '../../hooks/useScrollProgress';

/**
 * Drives the ride from raw scroll progress. Mount once, inside the Canvas.
 *
 * Per frame:
 *   targetT = trackTAtProgress(progress)    // eased scroll -> track position
 *   t       = damp(t, targetT, LAMBDA, dt)  // exponential smoothing
 *   speed   = (t - prevT) / dt * TRACK_LENGTH
 *
 * The damping is what gives the bike weight. Raw scroll is a step function of
 * the scroll wheel; following it directly looks robotic. Lambda 4 closes ~98%
 * of the gap in 1s and ~63% in 0.25s, which reads as momentum rather than lag.
 *
 * `speed` is derived from the *smoothed* t, so wheel spin and lean respond to
 * real motion instead of scroll jitter, and reach exactly 0 when the bike is
 * parked at a station.
 *
 * This lives next to the Canvas rather than in `hooks/` because it imports the
 * frame loop — and through it, transitively, the renderer. `hooks/` is
 * reachable from the entry chunk; `components/canvas/` is not.
 */

/**
 * `THREE.MathUtils.damp`, written out.
 *
 * The frame driver needs exponential smoothing and nothing else from the math
 * utilities, so it implements the one function it needs rather than importing
 * the whole namespace into a module the entry chunk can reach. `1 - e^(-λ·dt)`
 * is the exact smoothing factor `damp` uses; with it the behaviour is identical
 * down to the floating point.
 */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function useRideDriver(): void {
  useEffect(() => {
    markRideDriverActive();
    return () => {
      markRideDriverInactive();
    };
  }, []);

  useFrame((_, rawDelta) => {
    // Clamp delta: tab switches and GC hitches produce huge dt values that would
    // otherwise tunnel the bike through a corner.
    const dt = Math.min(rawDelta, 1 / 20);

    const ride = getRide();
    const targetT = trackTAtProgress(ride.progress);
    const previousT = ride.t;
    ride.t = damp(ride.t, targetT, RIDE_LAMBDA, dt);
    ride.speed = ((ride.t - previousT) / dt) * TRACK_LENGTH;
    ride.station = nearestStation(ride.progress);
    // Normalised 0..1 speed magnitude, shared by every velocity-driven effect
    // so they all agree on what "fast" means. Derived from the *smoothed* t, so
    // it reaches zero exactly when the bike is parked.
    ride.speedFactor = clamp(Math.abs(ride.speed) / MAX_SPEED);

    /*
     * Demand-loop tail: the Canvas renders only on `invalidate()`, and scroll
     * events stop the moment the reader stops — but the damped ride keeps
     * travelling toward its target for ~a second after that. Re-requesting
     * while unsettled keeps frames flowing through the tail; parked means
     * silence, which is what idles the GPU. Called from inside `useFrame`,
     * so R3F folds it into one extra frame rather than restarting the loop.
     */
    if (Math.abs(targetT - ride.t) > 1e-4) invalidate();
  });
}
