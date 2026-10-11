/**
 * ============================================================================
 * EFFECT MAGNITUDES — PHASE 5
 * ============================================================================
 *
 * Pure numbers: how long the trail is, how fast dust emits, how far the FOV
 * kicks. Deliberately separate from `config/quality.ts`, which answers "does this
 * effect exist at all". Keeping "on/off" and "how much" apart means Phase 6 can
 * dial a level down without touching this file, and can retune the feel without
 * changing which effects mount.
 *
 * Velocities throughout are in world units per second, matching `ride.speed`,
 * which is derived from the damped track position and `TRACK_LENGTH`.
 */

/** Speed that counts as "flat out" for scaling any velocity-driven effect. */
export const MAX_SPEED = 42;

/* -------------------------------------------------------------------------- */
/* Rear-wheel light trail                                                      */
/* -------------------------------------------------------------------------- */

export const TRAIL = {
  /**
   * Ring-buffer length in samples. The brief asks for 40-60; 48 is a power-of-two
   * multiple so the index wraps with a mask rather than a modulo, and at 60fps it
   * holds four fifths of a second of history, which is about how long an accent
   * streak should read.
   */
  points: 48,
  /**
   * Width of the ribbon at its head, in world units. The tail tapers to zero, so
   * the shape is a teardrop rather than a constant-width stripe.
   */
  width: 0.55,
  /** How fast the head reaches full width as a fraction of max speed. */
  /** Speed at which the trail first appears at all; below this it is invisible. */
  speedFloor: 0.6,
  /** Speed at which the trail is at full length and brightness. */
  speedCeiling: MAX_SPEED,
  /** Opacity at full speed. Kept low: this is a hint of light, not a laser. */
  maxOpacity: 0.5,
  /**
   * Seconds for a point's opacity to decay to nothing. The buffer is overwritten
   * in 48/60 = 0.8s, so this matches the buffer lifetime and every point fades
   * out exactly as its slot is reused.
   */
  lifetime: 0.8,
  /** Vertical offset from the road so the ribbon rides just above the surface. */
  height: 0.16,
} as const;

/* -------------------------------------------------------------------------- */
/* Dust and sparks                                                             */
/* -------------------------------------------------------------------------- */

export const DUST = {
  /** Pool size at `particles: 1`. LOW uses 0 and mounts nothing. */
  count: 220,
  /** Emissions per second at full speed. Fractional, so it scales smoothly. */
  rateMax: 90,
  /** Speed at which emission begins. */
  speedFloor: 1.2,
  /** Initial speed along the bike's backward direction, world units/second. */
  driftBack: 2.6,
  /** Initial lateral spread, world units/second. */
  spread: 1.9,
  /** Upward bias, world units/second. Dust lifts off the road. */
  lift: 1.4,
  /** Gravity applied to particles, world units/second squared. */
  gravity: -2.4,
  /** Seconds a particle lives. */
  lifetime: 0.9,
  /** Point size at spawn and at death, in world units. */
  sizeStart: 0.19,
  sizeEnd: 0.05,
  /** Opacity at spawn. Additive blending, so this stays well under 1. */
  maxOpacity: 0.42,
  /** Emission origin, relative to the rear wheel contact patch. */
  origin: { x: 0, y: 0.08, z: -0.7 } as const,
  /** Spawn radius around the contact patch. */
  jitter: 0.16,
} as const;

/* -------------------------------------------------------------------------- */
/* Headlight                                                                   */
/* -------------------------------------------------------------------------- */

export const HEADLIGHT = {
  /** Cone length ahead of the bike, world units. */
  length: 9,
  /** Cone radius at the far end. */
  spread: 1.9,
  /** Additive sprite opacity at the bulb. Low: it is a glow, not a lamp. */
  glow: 0.55,
  /**
   * Point light intensity and range. The only light added in Phase 5, and it
   * casts no shadow: a second shadow-casting light doubles the shadow pass for a
   * contact highlight nobody would notice.
   */
  lightIntensity: 6,
  lightDistance: 14,
  lightDecay: 2,
} as const;

/* -------------------------------------------------------------------------- */
/* Camera kick                                                                 */
/* -------------------------------------------------------------------------- */

export const CAMERA_KICK = {
  /**
   * Extra FOV at full speed, in degrees. Four is visible without being
   * conspicuous; much past six and the frame edges start to swim.
   */
  fovKick: 4,
  /** Speed at which the kick reaches full strength. */
  speedCeiling: MAX_SPEED,
  /**
   * How fast the FOV returns to rest when the reader stops, in e-folds per
   * second. Lower than the ride's own damping so the shot settles rather than
   * snapping back.
   */
  fovReturn: 3.2,
  /**
   * Positional shake amplitude at full speed, world units. Sub-unit on purpose:
   * the shake should register as the road being rough, not as the camera
   * detaching. Zero at rest.
   */
  shake: 0.09,
  /** Shake frequency in hertz. Two cycles a second reads as texture, not noise. */
  shakeHz: 2.1,
  /** Shake rotation amplitude at full speed, radians. */
  shakeRoll: 0.007,
  /**
   * Speed below which the shake is switched off entirely. A tiny amount of
   * jitter while parked reads as a broken camera, not a live one.
   */
  speedFloor: 3,
} as const;

/* -------------------------------------------------------------------------- */
/* Station magnet (scroll feel)                                                */
/* -------------------------------------------------------------------------- */

export const MAGNET = {
  /**
   * Half-width of the ease region either side of a station's `t`, in track
   * space. 0.01 of a 500u track is ~5u — a couple of bike lengths.
   */
  radius: 0.01,
  /**
   * Peak pull toward the station, as a fraction of the remaining distance.
   * 0.45 is deliberately less than half: above 0.5 the bike would overshoot and
   * oscillate, and the ease would fight the reader instead of settling them.
   */
  strength: 0.45,
} as const;

/* -------------------------------------------------------------------------- */
/* Scroll damping                                                              */
/* -------------------------------------------------------------------------- */

export const SCROLL = {
  /**
   * Ride damping, in e-folds per second. Phase 3 used 4, which felt right on a
   * trackpad and mushy on a wheel. 5.2 closes the gap noticeably faster while
   * keeping enough lag to read as momentum — the difference between "the bike has
   * mass" and "the bike is on a spring".
   */
  rideLambda: 5.2,
} as const;

/* -------------------------------------------------------------------------- */
/* Loader and intro                                                            */
/* -------------------------------------------------------------------------- */

export const INTRO = {
  /**
   * Minimum loader display time. Without it, a warm cache resolves in 40ms and
   * the loader flashes, which reads as a glitch rather than a sequence. Kept
   * short: every millisecond here is scroll-locked time before first interaction.
   */
  minLoaderMs: 450,
  /** Duration of the camera glide from the high wide shot into the chase rig. */
  glideMs: 2500,
  /**
   * How high and how far back the opening camera sits, relative to the bike.
   * Deliberately generous: the glide is the first thing a visitor sees, and a
   * large move reads as a camera rather than a lerp.
   */
  startOffset: { x: -26, y: 34, z: -62 } as const,
  /** Hero copy reveal delay after the glide begins, milliseconds. */
  heroRevealDelayMs: 400,
  /** Hero copy reveal duration, milliseconds. */
  heroRevealMs: 900,
  /** Fade-out duration for the loader once both conditions are met. */
  fadeMs: 320,
} as const;

/* -------------------------------------------------------------------------- */
/* Micro-interactions                                                          */
/* -------------------------------------------------------------------------- */

export const MICRO = {
  /** Cursor glow radius in CSS pixels. */
  cursorRadius: 190,
  /**
   * How quickly the glow chases the real pointer, in e-folds per second. Below
   * the pointer's own speed this reads as a physical light source lagging
   * slightly behind the hand.
   */
  cursorLambda: 11,
  /** Magnetic pull radius and strength for buttons. */
  magnetRadius: 60,
  magnetStrength: 0.28,
  /** Spring constant and damping for the return. */
  magnetReturn: 9,
  /** Max tilt angle for cards, degrees. */
  tiltMax: 6,
  tiltLambda: 12,
  /** Skill tile hover scale. */
  tileScale: 1.06,
  /** How far a neighbouring tile is displaced by a hovered one, in pixels. */
  tileRipple: 2,
} as const;

/* -------------------------------------------------------------------------- */
/* Audio                                                                       */
/* -------------------------------------------------------------------------- */

export const AUDIO = {
  /** Cross-fade duration on toggle, seconds. */
  fadeMs: 0.5,
  /** Drone base frequency, Hz. Low enough to feel rather than hear. */
  droneHz: 58,
  /** Detune between the two oscillators, in cents. */
  droneDetune: 7,
  /** Lowpass cutoff for the drone at rest and at full speed. */
  droneCutoffRest: 240,
  droneCutoffFast: 900,
  /** Wind noise gain at rest and at full speed. */
  windGainRest: 0.006,
  windGainFast: 0.075,
  /** Wind lowpass cutoff, rest to full speed. */
  windCutoffRest: 420,
  windCutoffFast: 2600,
  /**
   * Drone pitch shift per station index, in semitones. A semitone per station
   * across six gaps is audible as a slow ascent; anything larger turns the drone
   * into a soundtrack.
   */
  semitonesPerStation: 1,
  /** Master output ceiling. Deliberately quiet: this is ambience. */
  masterGain: 0.22,
} as const;
