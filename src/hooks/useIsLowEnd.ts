import { useState } from 'react';
import { MOBILE_WIDTH } from '../lib/capabilities';

export type DeviceTier = 'low' | 'mid' | 'high';

export interface DeviceProfile {
  tier: DeviceTier;
  /** No usable WebGL — render the plain 2D fallback instead. */
  webglFailed: boolean;
  /**
   * Best-effort unmasked renderer string, or `''` when the browser masks it.
   * Purely diagnostic — the tier decision it feeds is made in `detectTier`.
   */
  renderer: string;
  isMobile: boolean;
  isTouch: boolean;
}

const BASE: DeviceProfile = {
  tier: 'mid',
  webglFailed: false,
  renderer: '',
  isMobile: false,
  isTouch: false,
};

/**
 * Renderer strings that mean "there is no GPU here".
 *
 * This exists because the cores-and-memory heuristic in `detectTier` is blind to
 * the one thing that actually determines frame cost, and it gets software
 * rasterisers exactly backwards. A CI container or a GPU-blocklisted laptop
 * reports a desktop-class core count and several GB of memory, scores `high`, and
 * is then handed the HIGH tier's mip-mapped bloom — which on a CPU rasteriser is
 * the single most expensive thing in the frame. SwiftShader rendered the full
 * post-processing chain at 2.6 fps at 1440x900, where the LOW tier managed ~8.
 *
 * Exported as a pure function so the classification is unit-testable without a
 * browser or a WebGL context.
 */
const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render|generic renderer|virgl|paravirtual/i;

export function isSoftwareRenderer(renderer: string): boolean {
  return renderer !== '' && SOFTWARE_RENDERER.test(renderer);
}

/**
 * Cheap heuristic: cores, memory and screen size stand in for a GPU benchmark.
 *
 * Deliberately says nothing about the renderer. This function answers "what do
 * this machine's specifications suggest", and a CPU rasteriser on a fast CPU is
 * genuinely a capable machine — the veto on software rendering is a policy
 * decision about which tier to hand it, so it lives in `detectQualityLevel`
 * where the rest of the tier policy is and where it can be tested.
 */
function detectTier(): DeviceTier {
  if (typeof navigator === 'undefined') return 'mid';
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = window.matchMedia(`(max-width: ${MOBILE_WIDTH}px)`).matches;
  const score = cores + memory + (mobile ? -2 : 2);
  if (score <= 4) return 'low';
  if (score >= 9) return 'high';
  return 'mid';
}

interface WebGLProbe {
  ok: boolean;
  renderer: string;
}

/**
 * Probes for a WebGL context so a failure can fall back to 2D instead of
 * white-screening, and reads the renderer string while the context is still live.
 *
 * `WEBGL_debug_renderer_info` is the only way to see past Chrome's default
 * masking; when it is unavailable `gl.RENDERER` returns a useless generic string,
 * so the caller has to treat that as "unknown" and fall back to the heuristic.
 */
function probeWebGL(): WebGLProbe {
  try {
    const canvas = document.createElement('canvas');
    const context: RenderingContext | null =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    if (!context) return { ok: false, renderer: '' };

    // `experimental-webgl` is typed as the broader `RenderingContext`, which does
    // not carry the WebGL members used below. `WebGL2RenderingContext` extends
    // `WebGLRenderingContext`, so this narrowing is safe for every branch above.
    const gl = context as WebGLRenderingContext;

    let renderer = '';
    try {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) {
        renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? '');
      }
    } catch {
      // Some browsers expose the extension but throw on the parameter. Unknown.
    }

    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
    return { ok: true, renderer };
  } catch {
    return { ok: false, renderer: '' };
  }
}

/** Probes once per page load; the result never changes within a session. */
let probe: WebGLProbe | undefined;
function probeWebGLOnce(): WebGLProbe {
  probe ??= probeWebGL();
  return probe;
}

export function useDeviceProfile(): DeviceProfile {
  return useState<DeviceProfile>(() => {
    const client = typeof window !== 'undefined';
    const { ok, renderer } = client ? probeWebGLOnce() : { ok: false, renderer: '' };
    return {
      ...BASE,
      tier: client ? detectTier() : 'mid',
      webglFailed: client && !ok,
      renderer,
      isMobile: client && window.matchMedia(`(max-width: ${MOBILE_WIDTH}px)`).matches,
      isTouch: client && ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0),
    };
  })[0];
}
