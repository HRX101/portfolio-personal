/**
 * Seeded pseudo-random and value noise.
 *
 * Deliberately dependency-free and fully deterministic: the same seed must
 * produce the same terrain and the same prop layout on every load, so props do
 * not rearrange themselves between refreshes.
 *
 * Uses mulberry32, which is small, fast and has a long enough period for the
 * few thousand samples this project needs.
 */

/** Deterministic 32-bit PRNG. Returns a function yielding values in [0, 1). */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash -> [0, 1). Stable across calls, unlike Math.random. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 2D value noise in [0, 1]. Cheap, smooth, and good enough for terrain. */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smooth(xf);
  const v = smooth(yf);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Signed value noise in [-1, 1]. */
export const signedNoise2 = (x: number, y: number, seed = 0): number =>
  valueNoise2(x, y, seed) * 2 - 1;

/**
 * Fractal Brownian motion over `octaves` of value noise, normalised to [-1, 1].
 *
 * Successive octaves halve the amplitude and double the frequency, which is what
 * gives terrain its characteristic mix of broad hills and fine detail.
 */
export function fbm2(
  x: number,
  y: number,
  octaves = 4,
  seed = 0,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    sum += signedNoise2(x * frequency, y * frequency, seed + i * 1013) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return norm > 0 ? sum / norm : 0;
}
