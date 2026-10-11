/**
 * ============================================================================
 * DEVICE & CAPABILITY DETECTION — PHASE 6
 * ============================================================================
 *
 * Single source of truth for everything that affects which experience a user gets.
 * All thresholds are named constants so they can be tuned and tested without
 * hunting through logic. Storage access is wrapped so it never throws.
 */

import type { DeviceProfile } from '../hooks/useIsLowEnd';
import type { QualityLevel } from '../config/quality';

export type { QualityLevel };

/* -------------------------------------------------------------------------- */
/* Threshold constants                                                        */
/* -------------------------------------------------------------------------- */

/** Minimum cores for "not low-end" when combined with memory. */
export const TIER_CORES_THRESHOLD = 4;
/** Minimum device memory (GB) for "not low-end". */
export const TIER_MEMORY_THRESHOLD = 4;
/** Width at which the layout switches to mobile presentation. */
export const MOBILE_WIDTH = 900;
/** Minimum DPR cap for mobile devices. */
export const MOBILE_DPR_CAP = 1.25;
/** Touch target minimum size (px). */
export const TOUCH_TARGET_MIN = 44;

/** Viewport width below which we consider the viewport "small" (mobile-first). */
export const SMALL_VIEWPORT_WIDTH = 640;
/** Viewport height below which we consider the viewport "short" (landscape phones). */
export const SMALL_VIEWPORT_HEIGHT = 480;

/**
 * FPS below which we consider stepping quality down.
 *
 * 45 rather than 60: a sustained 45 is already visibly choppy for a
 * scroll-driven camera, so waiting for a full 60 means stepping down only once
 * the stutter has been visible for a second or more.
 */
export const PERF_STEP_FPS = 45;
/**
 * FPS below which we offer the 2D fallback.
 *
 * Set at 25 because that is the point where the motion stops reading as a ride
 * and starts reading as a slideshow — below it the scroll camera is the primary
 * thing making the experience feel broken.
 */
export const PERF_OFFER_2D_FPS = 25;
/**
 * FPS that has to be *sustained* before stepping back up.
 *
 * Higher than `PERF_STEP_FPS` and asymmetric on purpose: stepping down should be
 * eager, stepping back up should be reluctant. A device that has just been
 * downgraded is much more likely to hover near the boundary than to sit well
 * clear of it.
 */
export const PERF_RECOVERY_FPS = 55;
/** Seconds to average FPS before making a decision. */
export const PERF_WINDOW_SECONDS = 3;

/** Storage keys — prefixed to avoid collisions. */
const STORAGE_FORCE_2D = 'portfolio:force-2d';
const STORAGE_FORCE_3D = 'portfolio:force-3d';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ExperienceMode = '3D' | '2D';

export interface Capabilities {
  /** Usable WebGL context exists (1 or 2). */
  webgl: boolean;
  /** Primary pointer is coarse (touch). */
  isTouch: boolean;
  /** Viewport is narrow enough for mobile layout. */
  isSmall: boolean;
  /** Viewport is small in both dimensions (mobile phone). */
  isSmallViewport: boolean;
  /** Hardware is low-end by heuristic (cores + memory). */
  lowEnd: boolean;
  /** OS prefers reduced motion. */
  reducedMotion: boolean;
  /** OS / UA prefers reduced data (saveData). */
  reducedData: boolean;
  /** The mode the system recommends for this session. */
  mode: ExperienceMode;
  /** Quality level the device should start at if running 3D. */
  recommendedQuality: QualityLevel;
  /** Detailed device profile for debugging. */
  device: DeviceProfile;
}

/* -------------------------------------------------------------------------- */
/* Storage helpers (never throw)                                              */
/* -------------------------------------------------------------------------- */

function getStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Ignore — storage may be full or disabled. */
  }
}

function clearStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* Ignore. */
  }
}

/** User has explicitly forced 2D. */
export function force2D(): boolean {
  return getStorage(STORAGE_FORCE_2D) === '1';
}

/** User has explicitly forced 3D. */
export function force3D(): boolean {
  return getStorage(STORAGE_FORCE_3D) === '1';
}

/** Save the user's mode preference. */
export function setForceMode(mode: ExperienceMode | null): void {
  if (mode === '2D') {
    setStorage(STORAGE_FORCE_2D, '1');
    clearStorage(STORAGE_FORCE_3D);
  } else if (mode === '3D') {
    setStorage(STORAGE_FORCE_3D, '1');
    clearStorage(STORAGE_FORCE_2D);
  } else {
    clearStorage(STORAGE_FORCE_2D);
    clearStorage(STORAGE_FORCE_3D);
  }
}

/* -------------------------------------------------------------------------- */
/* WebGL probe (no side effects, pure)                                        */
/* -------------------------------------------------------------------------- */

interface WebGLProbeResult {
  webgl: boolean;
  renderer: string;
}

/** Cached probe: creating a context per detection recompute is pure overhead —
 *  the answer cannot change within a page load (a lost context surfaces through
 *  the canvas events, not through re-probing). Seeded lazily so module import
 *  stays side-effect free for tests. */
let cachedProbe: WebGLProbeResult | undefined;

function probeWebGLOnce(): WebGLProbeResult {
  cachedProbe ??= probeWebGL();
  return cachedProbe;
}

function probeWebGL(): WebGLProbeResult {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (!gl) return { webgl: false, renderer: '' };

    // Narrow to WebGLRenderingContext for the extension/parameter calls
    const webgl = gl as WebGLRenderingContext;

    let renderer = '';
    try {
      const ext = webgl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        renderer = String(webgl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
      }
    } catch {
      // Some browsers expose the extension but throw on the parameter.
    }

    // Release immediately.
    const lose = webgl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return { webgl: true, renderer };
  } catch {
    return { webgl: false, renderer: '' };
  }
}

/* -------------------------------------------------------------------------- */
/* Software renderer detection (re-exported from useIsLowEnd)                 */
/* -------------------------------------------------------------------------- */

const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render|generic renderer|virgl|paravirtual/i;

export function isSoftwareRenderer(renderer: string): boolean {
  return renderer !== '' && SOFTWARE_RENDERER.test(renderer);
}

/* -------------------------------------------------------------------------- */
/* Tier heuristic                                                             */
/* -------------------------------------------------------------------------- */

export function detectTier(
  hardwareConcurrency: number,
  deviceMemory: number,
  isMobile: boolean,
): 'low' | 'mid' | 'high' {
  const score = hardwareConcurrency + deviceMemory + (isMobile ? -2 : 2);
  if (score <= 4) return 'low';
  if (score >= 9) return 'high';
  return 'mid';
}

/* -------------------------------------------------------------------------- */
/* Recommended quality for a 3D session                                       */
/* -------------------------------------------------------------------------- */

export function recommendQuality(
  device: DeviceProfile,
  _reducedMotion: boolean,
  reducedData: boolean,
): QualityLevel {
  // No WebGL at all -> will be 2D, but quality is still used for 2D sizing.
  if (device.webglFailed) return 'LOW';

  // Software rasteriser -> LOW, because the CPU is the bottleneck.
  if (isSoftwareRenderer(device.renderer)) return 'LOW';

  // Explicit reduced-data preference -> cap at MEDIUM.
  if (reducedData) return 'MEDIUM';

  // Reduced motion doesn't drop the tier, but LOW is often the right choice.
  // The tier heuristic decides.
  if (device.tier === 'low') return 'LOW';
  if (device.tier === 'mid') return 'MEDIUM';
  return 'HIGH';
}

/* -------------------------------------------------------------------------- */
/* Mode decision                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Decides the default experience mode for a fresh session.
 *
 * Priority:
 * 1. Explicit user preference (force 2D / force 3D).
 * 2. No WebGL -> 2D.
 * 3. Reduced motion -> 2D (vestibular safety).
 * 4. Low-end device + reduced data -> 2D (performance safety).
 * 5. Otherwise -> 3D.
 */
export function decideMode(
  webgl: boolean,
  reducedMotion: boolean,
  reducedData: boolean,
  lowEnd: boolean,
): ExperienceMode {
  if (force2D()) return '2D';
  if (force3D()) return '3D';
  if (!webgl) return '2D';
  if (reducedMotion) return '2D';
  if (lowEnd && reducedData) return '2D';
  return '3D';
}

/* -------------------------------------------------------------------------- */
/* Main detection function                                                    */
/* -------------------------------------------------------------------------- */

export function detectCapabilities(
  device: DeviceProfile,
  reducedMotion: boolean,
): Capabilities {
  const { webgl, renderer } = probeWebGLOnce();
  const isSmall = typeof window !== 'undefined' && window.innerWidth < MOBILE_WIDTH;
  const isSmallViewport = typeof window !== 'undefined' &&
    window.innerWidth < SMALL_VIEWPORT_WIDTH &&
    window.innerHeight < SMALL_VIEWPORT_HEIGHT;
  const isTouch = typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches ||
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints ?? 0) > 0);
  const reducedData =
    typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

  const lowEnd = device.tier === 'low' || isSoftwareRenderer(renderer);
  const mode = decideMode(webgl, reducedMotion, reducedData, lowEnd);
  const recommendedQuality = recommendQuality(device, reducedMotion, reducedData);

  return {
    webgl,
    isTouch,
    isSmall,
    isSmallViewport,
    lowEnd,
    reducedMotion,
    reducedData,
    mode,
    recommendedQuality,
    device: { ...device, renderer, webglFailed: !webgl },
  };
}

/* -------------------------------------------------------------------------- */
/* Query-param overrides (for testing)                                        */
/* -------------------------------------------------------------------------- */

export function parseModeOverride(): ExperienceMode | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === '2d' || mode === '2D') return '2D';
    if (mode === '3d' || mode === '3D') return '3D';
    return null;
  } catch {
    return null;
  }
}

export function parseQualityOverride(): QualityLevel | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('quality');
    if (q === 'low' || q === 'LOW') return 'LOW';
    if (q === 'medium' || q === 'MEDIUM') return 'MEDIUM';
    if (q === 'high' || q === 'HIGH') return 'HIGH';
    return null;
  } catch {
    return null;
  }
}