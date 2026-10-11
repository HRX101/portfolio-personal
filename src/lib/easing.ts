/** Small easing / math helpers shared by the scroll mapping and the DOM layer. */

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : clamp((v - a) / (b - a));

/** Classic Hermite smoothstep on an already-normalised value. */
export const smoothstep = (x: number): number => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

/** Symmetric window: 0 at the edges, 1 in the middle. Used for section fades. */
export const window = (x: number, edge = 0.5): number => smoothstep(1 - clamp(Math.abs(x) / edge));

/**
 * Frame-rate independent exponential damping.
 * `lambda` is roughly "how many e-folds per second"; higher = snappier.
 */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/**
 * Piecewise "ride profile" for one station-to-station segment.
 *
 *   x : 0..1 scroll progress inside the segment
 *   out: 0..1 progress along the track inside the segment
 *
 * The bike dwells (out = 0) while the reader looks at the current station,
 * accelerates out, cruises, then eases into the next station. This is what
 * makes the ride feel weighty instead of like a scrollbar.
 */
export const DWELL = 0.16;
const RAMP = 0.18;

/**
 * Ride profile for one station-to-station segment, split into three pieces that
 * join continuously at u = RAMP and u = 1-RAMP:
 *
 *   accelerate : 0.00 -> 0.25   (smoothstep, so it starts from rest)
 *   cruise     : 0.25 -> 0.75   (constant velocity)
 *   decelerate : 0.75 -> 1.00   (smoothstep, so it arrives at rest)
 *
 * Splitting the value range this way keeps velocity continuous across the
 * joins. Each piece covering a full 0..1 range instead would introduce a jump
 * in velocity — and therefore a visible snap in the bike's motion — exactly at
 * the cruise handover.
 */
export const segmentEase = (x: number): number => {
  if (x <= DWELL) return 0;
  // Remaining scroll after the dwell, normalised back to 0..1.
  const u = (x - DWELL) / (1 - DWELL);
  if (u < RAMP) return ACCEL_END * smoothstep(u / RAMP);
  if (u > 1 - RAMP) return 1 - ACCEL_END * smoothstep((1 - u) / RAMP);
  return ACCEL_END + ((u - RAMP) / (1 - 2 * RAMP)) * (1 - 2 * ACCEL_END);
};

/** Value reached at the end of the accelerate piece. */
const ACCEL_END = 0.25;

/**
 * Inverse of `segmentEase`: given a track position within a segment, recover the
 * scroll position that produces it.
 *
 * `segmentEase` is monotonic but the cubic `smoothstep` inside it has no clean
 * real-valued closed-form inverse that stays precise — `1 - sqrt(1 + v)`
 * suffers catastrophic cancellation for small `v`, losing the first several
 * decimal places. Bisection over a monotonic function is exact to the iteration
 * count and only runs on user interaction (minimap clicks), not per frame.
 *
 * Returns 0 for values inside the dwell window, where the mapping is
 * deliberately many-to-one.
 */
export const segmentEaseInverse = (y: number): number => {
  const target = clamp(y);
  if (target <= 0) return 0;
  if (target >= 1) return 1;

  let lo = DWELL;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (segmentEase(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
