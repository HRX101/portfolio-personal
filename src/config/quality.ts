/**
 * ============================================================================
 * QUALITY
 * ============================================================================
 *
 * One table decides everything expensive in the app: how dense the world is,
 * whether post-processing runs, and whether each bike effect exists at all.
 *
 * Phase 3 shipped two parallel systems — `QUALITY` (render settings) and
 * `WORLD_COMPLEXITY` (geometry counts), selected from `DeviceTier`. Phase 5 adds
 * a third axis (per-effect on/off). Three tables keyed by overlapping names is
 * exactly the kind of thing that drifts, so they are unified here:
 *
 *  - `QUALITY_LEVELS` is the single source of truth, keyed by `QualityLevel`.
 *  - `WorldTier` is gone; `QualityLevel` replaces it.
 *  - `QUALITY[device.tier]` is gone; callers read the resolved settings object.
 *  - The old names survive as narrow aliases (`RENDER_PRESETS`, `WORLD_COMPLEXITY`)
 *    so nothing outside this file needs to know the two systems were merged.
 *
 * The important property for Phase 6: effects are *absent*, not disabled. Each
 * effect component reads a flag and returns `null`, so a LOW tier does not pay
 * for a hidden trail's update loop. Adding a new switch means adding a flag here
 * and one `if` at the top of the effect's component.
 */

/** Quality tiers. Uppercase, matching the brief; `LOW` is the floor. */
export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** All levels in descending order, for the debug overlay and any cycling UI. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

/* -------------------------------------------------------------------------- */
/* Render settings (was `QUALITY` in scene.ts)                                 */
/* -------------------------------------------------------------------------- */

export interface RenderPreset {
  /** Device-pixel-ratio range handed to the Canvas. */
  dpr: [number, number];
  /** Whether the moon casts shadows. Only the top tier pays for the shadow map. */
  shadows: boolean;
  /** MSAA on the default framebuffer. The post chain runs `multisampling={0}`. */
  antialias: boolean;
  /** Terrain mesh subdivisions along the long axis. */
  terrainSegments: number;
}

/* -------------------------------------------------------------------------- */
/* World complexity (was `WORLD_COMPLEXITY` in scene.ts)                       */
/* -------------------------------------------------------------------------- */

export interface WorldComplexity {
  trees: number;
  stars: number;
  rocks: number;
  crystals: number;
  /** Segments per mountain silhouette. */
  mountainSegments: number;
  /** Haze planes in flight. */
  haze: number;
  /** Terrain noise octaves. */
  terrainOctaves: number;
}

/* -------------------------------------------------------------------------- */
/* The unified table                                                           */
/* -------------------------------------------------------------------------- */

export interface QualitySettings {
  readonly level: QualityLevel;

  /* --- Phase 5 effects: absent when false, never "on but invisible" --- */

  /** Post-processing composer: bloom, vignette, chromatic aberration. */
  readonly bloom: boolean;
  /** Rear-wheel light trail ribbon. */
  readonly trail: boolean;
  /** Pooled dust/spark particles from the rear wheel. */
  readonly dust: boolean;
  /** Additive headlight cone plus its small point light. */
  readonly headlight: boolean;
  /** Velocity-driven FOV kick and camera shake. */
  readonly cameraKick: boolean;
  /** Cursor glow, magnetic buttons, tilt cards. Desktop pointer only. */
  readonly cursorEffects: boolean;
  /** Loader-and-glide intro sequence on first visit of a session. */
  readonly intro: boolean;

  /**
   * Multiplier on every pooled particle budget (dust pool, trail ring buffer).
   * Fractional values are fine: the pool rounds down to whole particles and the
   * trail to whole ring-buffer slots, so 0 means "mount nothing".
   */
  readonly particles: number;

  readonly render: RenderPreset;
  readonly world: WorldComplexity;
}

/**
 * The one table.
 *
 * HIGH is the desktop default and is the only tier with bloom, dust and cursor
 * effects — those are the three costs that scale worst, and the three that
 * Phase 6 will most want to shed on mobile. MEDIUM keeps the trail, since it is
 * the single strongest cue for speed and it scales down cleanly via `particles`.
 * LOW carries no Phase 5 effect at all.
 */
export const QUALITY_LEVELS_TABLE: Record<QualityLevel, QualitySettings> = {
  HIGH: {
    level: 'HIGH',
    bloom: true,
    trail: true,
    dust: true,
    headlight: true,
    cameraKick: true,
    cursorEffects: true,
    intro: true,
    particles: 1,
    render: { dpr: [1, 1.75], shadows: true, antialias: true, terrainSegments: 190 },
    world: {
      trees: 250,
      stars: 1500,
      rocks: 100,
      crystals: 44,
      mountainSegments: 96,
      haze: 7,
      terrainOctaves: 5,
    },
  },

  MEDIUM: {
    level: 'MEDIUM',
    bloom: false,
    trail: true,
    dust: false,
    headlight: true,
    cameraKick: true,
    cursorEffects: false,
    intro: true,
    particles: 0.5,
    render: { dpr: [1, 1.6], shadows: false, antialias: true, terrainSegments: 140 },
    world: {
      trees: 150,
      stars: 1000,
      rocks: 66,
      crystals: 30,
      mountainSegments: 64,
      haze: 5,
      terrainOctaves: 4,
    },
  },

  LOW: {
    level: 'LOW',
    /*
     * Every Phase 5 effect is off here.
     *
     * An earlier draft kept the trail on LOW with the argument that it is "only two
     * draw calls" — but the ribbon rewrites a 96-vertex position buffer plus two
     * derived attributes and re-uploads both every frame, so the draw-call count
     * was the wrong metric: the cost is the buffer upload and the additive
     * overdraw, both of which are exactly what a low-end machine cannot absorb.
     * LOW is also the tier the LOW is reached on when no GPU is available at all,
     * so it needs to be genuinely cheap rather than cheap-looking.
     */
    bloom: false,
    trail: false,
    dust: false,
    headlight: false,
    cameraKick: false,
    cursorEffects: false,
    intro: false,
    particles: 0,
    render: { dpr: [1, 1.25], shadows: false, antialias: false, terrainSegments: 96 },
    world: {
      trees: 70,
      stars: 500,
      rocks: 34,
      crystals: 14,
      mountainSegments: 40,
      haze: 3,
      terrainOctaves: 3,
    },
  },
};

/* -------------------------------------------------------------------------- */
/* Back-compat aliases                                                         */
/* -------------------------------------------------------------------------- */

/** Render settings per level. Retained name for the handful of old call sites. */
export const RENDER_PRESETS: Record<QualityLevel, RenderPreset> = {
  HIGH: QUALITY_LEVELS_TABLE.HIGH.render,
  MEDIUM: QUALITY_LEVELS_TABLE.MEDIUM.render,
  LOW: QUALITY_LEVELS_TABLE.LOW.render,
};

/** World complexity per level. Retained name for the old call sites. */
export const WORLD_COMPLEXITY: Record<QualityLevel, WorldComplexity> = {
  HIGH: QUALITY_LEVELS_TABLE.HIGH.world,
  MEDIUM: QUALITY_LEVELS_TABLE.MEDIUM.world,
  LOW: QUALITY_LEVELS_TABLE.LOW.world,
};
