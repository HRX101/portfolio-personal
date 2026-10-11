import type { StationId } from '../data/content';

/* ========================================================================== */
/* BIKE MODEL                                                                  */
/* ========================================================================== */
/**
 * >>> SWAP YOUR BIKE MODEL HERE <<<
 *
 * Drop your file at `public/models/bike.glb` and it is picked up automatically.
 * If the file is missing or fails to parse, Bike.tsx renders a procedural
 * low-poly bike instead, so a fresh clone never crashes.
 *
 * Compression notes:
 *  - Draco  : `npx gltf-transform draco in.glb out.glb` (needs the drei Draco
 *             decoder, already wired up in the GLTF loader below).
 *  - meshopt: `npx gltf-transform meshopt in.glb out.glb` (smaller and faster
 *             to decode than Draco; needs EXT_meshopt_compression).
 *  - Keep it single-material or under ~8 materials, under ~150k tris, and apply
 *    transforms / strip unused morph targets before shipping.
 */
export const BIKE_MODEL_PATH = '/models/bike.glb';

/* ========================================================================== */
/* PHASE 5 EFFECT TUNING                                                        */
/* ========================================================================== */
/*
 * Phase 5 moves render/world complexity into `config/quality.ts` and leaves
 * here only the numbers that are about *feel* rather than *budget*. Effect
 * magnitudes live in `config/effects.ts`; these are the two that the track
 * geometry itself depends on.
 */

/** Emissive intensities, retuned in Phase 5 so bloom lands on intended surfaces. */
export const EMISSIVE = {
  /**
   * Bloom's luminance threshold, in linear terms before tone mapping. The scene
   * is lit at roughly 1.5-2.0, so anything at or above this is a deliberate light
   * source and everything else stays crisp. Road edges and wheel hubs sit just
   * under it and are visibly retuned down from their Phase 3 values.
   */
  bloomThreshold: 0.82,
  /** Bloom smoothing: how wide the falloff above the threshold is. */
  bloomSmoothing: 0.28,
  /** Bloom strength. Low, because a wide falloff plus a high strength reads as haze. */
  bloomIntensity: 0.62,
  /** Radius of the bloom kernel in screen space. */
  bloomRadius: 0.62,

  /**
   * Road edge glow. Was 3.2 in Phase 3, which put the entire 500u road ribbon
   * above the bloom threshold and turned the whole road into a glowing tube.
   * Now a thin line that only the brightest segments pick up.
   */
  roadEdge: 1.35,
  /** Lamp heads. These *should* glow, so they sit comfortably above threshold. */
  lampHead: 2.6,
  /** Lamp post housings: lit geometry, not a light source. */
  lampHousing: 0.55,
  /** Wheel hub accents on the procedural bike. */
  wheelHub: 0.3,
} as const;

/**
 * Escape hatch used by scripts/fallback.mjs to prove the fallback path works
 * without having to rename the real asset. Undefined in normal use.
 */
declare global {
  interface Window {
    __BIKE_MODEL_OVERRIDE__?: string;
  }
}

export const overriddenModelPath =
  typeof window !== 'undefined' ? window.__BIKE_MODEL_OVERRIDE__ : undefined;

/** Uniform scale applied to the loaded GLB. */
export const BIKE_MODEL_SCALE = 1;

/**
 * Yaw (radians) for the loaded GLB so its forward axis matches the direction
 * the procedural bike faces (glTF models conventionally face +Z).
 */
export const BIKE_MODEL_YAW = 0;

/* ========================================================================== */
/* TRACK                                                                       */
/* ========================================================================== */

export const TRACK_WIDTH = 6;
export const TRACK_SEGMENTS = 720;
/** Road surface samples used to build the ribbon mesh. */
export const TRACK_RIBBON_SAMPLES = 320;

/**
 * Control points for the ride.
 *
 * Two invariants this configuration relies on:
 *  1. x is strictly increasing, so the road never doubles back on itself and
 *     terrain can sample road height with a 1D lookup.
 *  2. The path stays inside |z| < 40 so a single 1500u ground plane covers it.
 *
 * Gentle S-bends in z, three hills in y (crest ~9u near x=160, dip to 0 near
 * x=280, second crest ~9u near x=440).
 */
export const TRACK_POINTS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [38, 0.4, 16],
  [74, 3.1, 25],
  [112, 6.6, 13],
  [150, 8.8, -4],
  [190, 6.9, -21],
  [228, 2.8, -27],
  [266, 0, -15],
  [304, 0, 5],
  [342, 2.1, 19],
  [380, 5.8, 25],
  [418, 8.6, 15],
  [456, 7.7, -3],
  [492, 3.6, -19],
  [522, 0.8, -26],
  [548, 0, -13],
];

/** Named stations along the ride, in section order. `t` is 0..1 along the spline. */
export interface StationMarker {
  id: StationId;
  t: number;
}

export const STATIONS: readonly StationMarker[] = [
  { id: 'hero', t: 0 },
  { id: 'about', t: 0.15 },
  { id: 'experience', t: 0.32 },
  { id: 'freelance', t: 0.48 },
  { id: 'research', t: 0.62 },
  { id: 'achievements', t: 0.8 },
  { id: 'contact', t: 1 },
];

/* ========================================================================== */
/* CAMERA RIGS                                                                 */
/* ========================================================================== */

export type Vec3Tuple = readonly [number, number, number];

export interface CameraRig {
  /** Inclusive start of this rig's t range. */
  from: number;
  /** Exclusive end; the next rig takes over. */
  to: number;
  /** Offset from the bike in the bike's local frame (-z is behind). */
  offset: Vec3Tuple;
  /** Look-at point relative to the bike. */
  lookAhead: Vec3Tuple;
  fov: number;
  /** Higher = snappier follow. */
  positionLambda: number;
  /** Higher = snappier aim. */
  targetLambda: number;
}

/**
 * Rigs keyed by t range, blended over `CAMERA_BLEND` at each boundary so there
 * is never a snap. Phase 3 gives each station its own signature angle.
 *
 * Offsets are in the bike's local frame: +z is the direction of travel, so a
 * negative z offset places the camera behind the bike (a chase view) and the
 * positive-z lookAhead aims it back down the road.
 */
export const CAMERA_RIGS: readonly CameraRig[] = [
  // Opening 5%: wide establishing shot, high and far back.
  {
    from: 0,
    to: 0.05,
    offset: [-4.5, 6, -22],
    lookAhead: [0, 1.8, 7],
    fov: 43,
    positionLambda: 2.2,
    targetLambda: 2.4,
  },
  // Middle: tight third-person chase — the bike fills the frame.
  {
    from: 0.05,
    to: 0.95,
    offset: [-1.8, 3, -8.5],
    lookAhead: [0, 1.4, 5],
    fov: 48,
    positionLambda: 4.6,
    targetLambda: 5,
  },
  // Closing 5%: slow pull-back.
  {
    from: 0.95,
    to: 1,
    offset: [-5.5, 5, -26],
    lookAhead: [0, 2.2, 2],
    fov: 46,
    positionLambda: 1.8,
    targetLambda: 2.1,
  },
];

/** Fraction of a rig's range spent cross-fading into the next one. */
export const CAMERA_BLEND = 0.35;

/* ========================================================================== */
/* PALETTE — committed to dark dusk / neon                                     */
/* ========================================================================== */

export const COLORS = {
  /** Sky dome gradient, top to horizon. */
  skyZenith: '#04050d',
  skyMid: '#1b1b45',
  skyHorizon: '#4a2a63',
  /** Fog matches the horizon so distant geometry dissolves cleanly. */
  fog: '#0a0b1c',
  fogNear: 70,
  fogFar: 460,

  /** Accent glow: edge lines, dust, rider highlight. */
  accent: '#45f0e0',
  accentAlt: '#ff4f9a',
  accentViolet: '#a06bff',

  /** Road. */
  road: '#0b0d1a',
  roadEdge: '#45f0e0',
  roadStripe: '#1d2242',

  /** Bike. */
  bikeBody: '#e8ecff',
  bikeFrame: '#ff4f9a',
  bikeRider: '#0a0c18',

  /** Ground / world. */
  ground: '#070914',
  groundGrid: '#1c2340',

  /**
   * Terrain vertex-colour ramp (valley -> peak). Terrain is shaded by height, so
   * these read as a low-poly landscape lit by a dim sky rather than flat paint.
   */
  terrainLow: '#05060f',
  terrainMid: '#141a3c',
  terrainHigh: '#2b2f66',
  terrainPeak: '#43407e',

  /** Distant mountain rings, front to back. Each ring is darker than the last. */
  mountainNear: '#141735',
  mountainMid: '#0e1027',
  mountainFar: '#090a1a',

  /** Stars. */
  star: '#cfd6ff',

  /** Drifting haze planes. Additive, so they lift the horizon without occluding. */
  haze: '#3b2c66',

  /** Landmarks. */
  landmark: '#1a1f45',
  landmarkAccent: '#45f0e0',
  landmarkWarm: '#ffb84f',
  landmarkGold: '#ffcf5c',
  lampHead: '#ffe6a8',
} as const;

/* ========================================================================== */
/* LIGHTING                                                                    */
/* ========================================================================== */

export const LIGHTING = {
  hemisphereSky: '#4a5aa8',
  hemisphereGround: '#0a0b18',
  hemisphereIntensity: 0.7,
  moonColor: '#a8bcff',
  moonIntensity: 1.5,
  moonDirection: [-0.45, 0.72, -0.35] as Vec3Tuple,
  /** Shadow camera half-extent, kept tight around the bike. */
  shadowExtent: 16,
  shadowMapSize: 1024,
  /** Bounce light travelling with the bike so the far side is never pitch black. */
  fillIntensity: 12,
  fillDistance: 26,
} as const;

/* ========================================================================== */
/* WORLD GEOMETRY                                                              */
/* ========================================================================== */
/*
 * Render presets and world complexity moved to `config/quality.ts` in Phase 5,
 * where they live alongside the per-effect switches. Anything below is geometry
 * and layout, not budget.
 */

/**
 * Terrain patch extents. x is padded well past both ends of the track so the
 * ground is never visible ending from the chase camera; z reaches far enough out
 * that the mountains can take over as the only thing on the horizon.
 */
export const TERRAIN = {
  minX: -160,
  maxX: 760,
  farZ: 420,
  /** Segments along x per segment along z. The track is long and thin. */
  aspect: 1.6,
  /** Lateral distance where terrain is fully road height, and where hills resume. */
  corridorFlat: 9,
  corridorBlend: 34,
  /** Vertical scale of the noise hills. */
  hillHeight: 26,
  /** Extra large-scale swell so distant terrain is not uniformly noisy. */
  swellHeight: 34,
  /** Folds the terrain down to a flat plain at the patch edge to hide the seam. */
  edgeFadeStart: 0.62,
} as const;

/** Distance to the curve is baked from this many samples along the spline. */
export const CORRIDOR_SAMPLES = 400;

/** Props. All seeded, so the layout is byte-identical on every load. */
export const PROPS = {
  /** Lateral distance from the road centre a prop must keep, before jitter. */
  minSideOffset: 11,
  /** Lamp posts sit closer because they are meant to line the road. */
  lampSideOffset: 7.2,
  /** Spacing along x between lamp posts. */
  lampSpacing: 15,
  /** A prop is rejected if it lands within this distance of a landmark centre. */
  landmarkClearance: 22,
  /** Lateral half-width of the gate openings (hero/contact) that props avoid. */
  gateClearance: 9,
  maxOnRoadSlope: 0.45,
} as const;

/**
 * Landmark placement. Each landmark sits beside the road at its station's `t`,
 * offset laterally, and yaws to face the road so the bike sees its front.
 */
export const LANDMARK = {
  /** Lateral offset range for side-standing landmarks. */
  minOffset: 13,
  maxOffset: 18,
  /** `side` alternates so landmarks do not all stack on one shoulder. */
  sides: [-1, 1, -1, 1, -1, 1, -1] as const,
  /** Only animate landmarks within this much `t` of the bike. */
  animationRange: 0.15,
} as const;

/* ========================================================================== */
/* SEED                                                                        */
/* ========================================================================== */

/** Seed for every seeded placement in the world. Changing it restyles the world. */
export const WORLD_SEED = 20260421;

/* ========================================================================== */
/* ATMOSPHERE KEYFRAMES                                                        */
/* ========================================================================== */

export interface AtmosphereKey {
  /** Progress along the ride this palette applies at. */
  at: number;
  skyZenith: string;
  skyMid: string;
  skyHorizon: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  moonColor: string;
  moonIntensity: number;
  hemisphereSky: string;
  hemisphereIntensity: number;
  /** Ambient tint applied to terrain and mountains at this point in the ride. */
  worldTint: string;
  worldTintIntensity: number;
  /** Star brightness. Dusk starts bright, pre-dawn washes them out. */
  starOpacity: number;
}

/**
 * Four palettes across the ride: late dusk, deep night, the purple-blue heart of
 * the journey, then a pre-dawn glow. Atmosphere.tsx interpolates every field, so
 * any pair of keyframes produces a continuous gradient with no pops.
 */
export const ATMOSPHERE_KEYS: readonly AtmosphereKey[] = [
  {
    at: 0,
    skyZenith: '#04050d',
    skyMid: '#1b1b45',
    skyHorizon: '#4a2a63',
    fog: '#0a0b1c',
    fogNear: 70,
    fogFar: 460,
    moonColor: '#a8bcff',
    moonIntensity: 1.5,
    hemisphereSky: '#4a5aa8',
    hemisphereIntensity: 0.7,
    worldTint: '#2a2f66',
    worldTintIntensity: 0.18,
    starOpacity: 1,
  },
  {
    at: 0.34,
    skyZenith: '#03040a',
    skyMid: '#120f33',
    skyHorizon: '#2c1a4f',
    fog: '#07081a',
    fogNear: 60,
    fogFar: 400,
    moonColor: '#93a8ff',
    moonIntensity: 1.25,
    hemisphereSky: '#3a488f',
    hemisphereIntensity: 0.55,
    worldTint: '#20265c',
    worldTintIntensity: 0.12,
    starOpacity: 1,
  },
  {
    at: 0.62,
    skyZenith: '#050520',
    skyMid: '#20154a',
    skyHorizon: '#54256b',
    fog: '#0c0a22',
    fogNear: 66,
    fogFar: 430,
    moonColor: '#c6a8ff',
    moonIntensity: 1.6,
    hemisphereSky: '#5b3f9e',
    hemisphereIntensity: 0.72,
    worldTint: '#3a2a6b',
    worldTintIntensity: 0.2,
    starOpacity: 0.85,
  },
  {
    at: 1,
    skyZenith: '#0a1030',
    skyMid: '#3a2a63',
    skyHorizon: '#c9567f',
    fog: '#1a1436',
    fogNear: 90,
    fogFar: 520,
    moonColor: '#ffc89a',
    moonIntensity: 2.1,
    hemisphereSky: '#8f6bb5',
    hemisphereIntensity: 0.9,
    worldTint: '#6b4a80',
    worldTintIntensity: 0.26,
    starOpacity: 0.35,
  },
];

