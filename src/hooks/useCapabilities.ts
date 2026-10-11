import { useEffect, useState, useCallback, useMemo } from 'react';
import { useReducedMotion } from './useReducedMotion';
import { useDeviceProfile } from './useIsLowEnd';
import {
  detectCapabilities,
  force2D,
  force3D,
  setForceMode,
  parseModeOverride,
  parseQualityOverride,
  type Capabilities,
  type ExperienceMode,
  type QualityLevel,
  MOBILE_WIDTH,
  SMALL_VIEWPORT_WIDTH,
  SMALL_VIEWPORT_HEIGHT,
} from '../lib/capabilities';

export type { ExperienceMode, QualityLevel };

/**
 * ============================================================================
 * CAPABILITIES HOOK
 * ============================================================================
 *
 * Wraps the pure detection logic and keeps it live:
 * - Reduced motion changes via media query (`useReducedMotion`)
 * - Reduced data changes via media query (local `saveData` state below)
 * - Viewport size changes, mobile/desktop flip (local `viewport` state below)
 * - User can override mode/quality via query params or UI
 *
 * Detection runs during render, not in an effect. An earlier version stored the
 * capabilities in state and re-ran detection from an effect on every dependency
 * change, which is a render cascade: render, commit, detect, setState, render
 * again — for values that are pure functions of values React already holds.
 * `useMemo` computes the same object without the second pass.
 *
 * The live inputs that genuinely are external — viewport size, touch, saveData —
 * stay in state, updated from subscription callbacks (resize listener, media
 * query listener). Those callbacks fire from the platform, not from React, so
 * setting state there is synchronisation, not a cascade.
 */

interface UseCapabilitiesReturn extends Capabilities {
  /** Switch to 2D or 3D and persist the choice. */
  setMode: (mode: ExperienceMode) => void;
  /** Clear any stored mode preference (back to auto). */
  clearModePreference: () => void;
  /** Override quality level for this session (not persisted). */
  setQualityOverride: (level: QualityLevel | null) => void;
}

function readPointerCoarse(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0
  );
}

function readViewport() {
  if (typeof window === 'undefined') {
    return { isSmall: false, isSmallViewport: false, isTouch: false };
  }
  return {
    isSmall: window.innerWidth < MOBILE_WIDTH,
    isSmallViewport:
      window.innerWidth < SMALL_VIEWPORT_WIDTH &&
      window.innerHeight < SMALL_VIEWPORT_HEIGHT,
    isTouch: readPointerCoarse(),
  };
}

function readSaveData(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData === true
  );
}

export function useCapabilities(): UseCapabilitiesReturn {
  const device = useDeviceProfile();
  const reducedMotion = useReducedMotion();

  /*
   * Live platform inputs. Each is read once for the initial state and then kept
   * current by a subscription below. `device` never changes identity (probed
   * once per page load) and `reducedMotion` arrives as a boolean, so the memo
   * below recomputes only when something actually changed.
   */
  const [viewport, setViewport] = useState(readViewport);
  const [reducedData, setReducedData] = useState(readSaveData);

  // Quality override from query param or UI (not persisted).
  const [qualityOverride, setQualityOverride] = useState<QualityLevel | null>(
    () => parseQualityOverride(),
  );

  // Mode override from query param, storage, or UI.
  const [modeOverride, setModeOverride] = useState<ExperienceMode | null>(() => {
    const fromParam = parseModeOverride();
    if (fromParam) return fromParam;
    if (force2D()) return '2D';
    if (force3D()) return '3D';
    return null;
  });

  // Live viewport size, touch and orientation listener.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setViewport(readViewport());
    };
    window.addEventListener('resize', handler);
    // Orientation change fires before layout settles on some browsers; the
    // resize that follows corrects it, but listening directly shortens the
    // window where the layout and the flags disagree.
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, []);

  // Live reduced-data listener. The NetworkInformation API barely notifies, so
  // this also covers the media query form where supported.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-data: reduce)');
    const handler = () => {
      setReducedData(mq.matches || readSaveData());
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  /*
   * The full detection, derived during render.
   *
   * `detectCapabilities` probes WebGL on every call, which means constructing
   * throwaway canvas contexts whenever a dependency changes. That sounds
   * expensive and is, mildly — but the dependencies change only on media-query
   * flips, resizes and preference changes, i.e. a handful of times per session,
   * and each probe frees its context immediately. Correctness first: deriving
   * here means `mode` always agrees with `reducedMotion`, which the old
   * field-patching listeners could not guarantee (flipping the OS setting
   * mid-session updated the flag but left the mode on whatever it was).
   */
  const caps = useMemo<Capabilities>(() => {
    const base = detectCapabilities(device, reducedMotion);
    return {
      ...base,
      isSmall: viewport.isSmall,
      isSmallViewport: viewport.isSmallViewport,
      isTouch: viewport.isTouch,
      reducedData,
      mode: modeOverride ?? base.mode,
      recommendedQuality: qualityOverride ?? base.recommendedQuality,
    };
  }, [device, reducedMotion, viewport, reducedData, modeOverride, qualityOverride]);

  // Public setters
  const setMode = useCallback((mode: ExperienceMode) => {
    setModeOverride(mode);
    setForceMode(mode);
  }, []);

  const clearModePreference = useCallback(() => {
    setModeOverride(null);
    setForceMode(null);
  }, []);

  const setQualityOverrideFn = useCallback((level: QualityLevel | null) => {
    setQualityOverride(level);
  }, []);

  return {
    ...caps,
    setMode,
    clearModePreference,
    setQualityOverride: setQualityOverrideFn,
  };
}
