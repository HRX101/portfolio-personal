import { useEffect, useState } from 'react';
import Lenis from 'lenis';
import { STATIONS, type StationId } from '../data/content';
import { SCROLL } from '../config/effects';
import { clamp } from '../lib/easing';
import { STATION_SCROLL } from '../lib/rideMath';
import { useCapabilities } from './useCapabilities';

/*
 * NOTE ON THREE.JS: this module must never import `three`, `@react-three/fiber`
 * or anything that imports them. `App` calls `useScrollProgress` and
 * `useAnchorScroll` unconditionally, so whatever this file touches ends up in
 * the entry chunk — and the entry chunk is what a 2D-mode visitor downloads.
 * The frame-loop half of the ride (`useRideDriver`) lives in
 * `components/canvas/useRideDriver.ts` for exactly this reason. If the built
 * `index.html` ever regains a three `modulepreload`, this import list is the
 * first suspect.
 */

export { STATION_SCROLL };

type ScrollListener = (progress: number) => void;

/** Mutable per-frame ride state. Read inside frame loops; never render from it. */
export interface RideState {
  /** Raw scroll progress 0..1 straight from Lenis. */
  progress: number;
  /** Damped position along the track, 0..1. */
  t: number;
  /** Damped world speed in units/second, signed. Negative when reversing. */
  speed: number;
  /**
   * `|speed|` normalised against `MAX_SPEED`, 0..1. Written once per frame by
   * the ride driver so every velocity-driven effect (trail, dust, FOV kick,
   * wind volume) scales off one agreed definition of "fast" instead of each
   * re-deriving it and drifting slightly out of step.
   */
  speedFactor: number;
  /** Index of the nearest docked station. */
  station: number;
}

const ride: RideState = { progress: 0, t: 0, speed: 0, speedFactor: 0, station: 0 };

/** Read-only handle to the live ride state. */
export const getRide = (): RideState => ride;

/**
 * True while the canvas render loop is damping `ride.t`.
 *
 * The station store needs a `t` even when there is no canvas to produce one, so
 * it checks this and falls back to the raw scroll-to-track mapping. Set by the
 * ride driver on mount and cleared on unmount — `App` never touches it directly.
 */
let rideDriverActive = false;
export const isRideDriverActive = (): boolean => rideDriverActive;

/** Called by the ride driver when it mounts inside the Canvas. */
export const markRideDriverActive = (): void => {
  rideDriverActive = true;
};

/** Called by the ride driver when it unmounts. */
export const markRideDriverInactive = (): void => {
  rideDriverActive = false;
};

/** How quickly the bike chases its target. Higher = snappier, less weighty. */
export const RIDE_LAMBDA = SCROLL.rideLambda;

interface ScrollBus {
  raw: number;
  listeners: Set<ScrollListener>;
}

const bus: ScrollBus = { raw: 0, listeners: new Set() };

let lenis: Lenis | null = null;

/* -------------------------------------------------------------------------- */
/* Scroll plumbing                                                             */
/* -------------------------------------------------------------------------- */

function updateFromScroll(scroll: number, limit: number): void {
  bus.raw = limit > 0 ? clamp(scroll / limit) : 0;
  ride.progress = bus.raw;
  for (const fn of bus.listeners) fn(bus.raw);
}

/**
 * Smooth-scroll to an absolute progress value.
 *
 * `instant` exists for reduced motion: a reader who asked for less animation
 * gets an instant jump instead of a 1.5-second eased glide past content they
 * did not ask to travel through.
 */
export function scrollToProgress(p: number, instant = false): void {
  const target = clamp(p);
  const limit = document.documentElement.scrollHeight - window.innerHeight;
  if (lenis) {
    // Lenis.scrollTo takes a pixel position, not a progress fraction.
    lenis.scrollTo(target * limit, {
      duration: instant ? 0 : 1.5,
      easing: (t) => 1 - (1 - t) ** 3,
    });
    return;
  }
  window.scrollTo({ top: target * limit, behavior: instant ? 'auto' : 'smooth' });
}

/** Smooth-scroll to a station by index. */
export function scrollToStation(index: number, instant = false): void {
  scrollToProgress(STATION_SCROLL[index] ?? 0, instant);
}

/**
 * Scrolls to a station by id. Anchor links must route through here rather than
 * relying on native `href="#id"` jumps: Lenis drives scroll position from its
 * own rAF loop, so a native jump gets overwritten on the very next frame and
 * the link silently does nothing.
 */
export function scrollToStationById(id: string, instant = false): void {
  const index = STATIONS.findIndex((s) => s.id === id);
  if (index >= 0) scrollToStation(index, instant);
}

/** Typed variant for call sites that already hold a `StationId`. */
export function scrollToStationId(id: StationId, instant = false): void {
  scrollToStationById(id, instant);
}

/** Ride back to the start of the track. */
export function scrollToTop(instant = false): void {
  scrollToProgress(0, instant);
}

/* -------------------------------------------------------------------------- */
/* Key drive (W/S game-style ride control)                                     */
/* -------------------------------------------------------------------------- */

/*
 * An additive alternate input for readers whose hands expect game keys: hold
 * W to ride forward, S to ride back. It deliberately does NOT replace or
 * remap the wheel — scroll down stays forward everywhere (page, 2D fallback,
 * anchors, minimap), and both inputs funnel into the same progress value, so
 * the two can never disagree about where the ride is.
 *
 * a11y notes, because keyboard input is load-bearing for some readers:
 * - W/S have no native page-scroll meaning, so nothing is hijacked. Arrow
 *   keys are left alone on purpose: keyboard users scroll documents with
 *   them, and stealing that for the ride would strand the page.
 * - Typing in inputs/textareas/selects (and any contentEditable) is ignored.
 * - Modifier combos (Ctrl/Alt/Meta) are ignored so browser shortcuts survive.
 * - Physical `code` (KeyW/KeyS), not `key`: layout-independent, so AZERTY
 *   and friends get the same keys under their fingers.
 */

type DriveDir = -1 | 0 | 1;

/** Seconds to cross the whole ride with a drive key held. */
export const KEY_DRIVE_SECONDS = 14;
/** Lenis smoothing for key driving: short enough to feel direct. */
const KEY_DRIVE_DURATION = 0.3;

const keyState = { forward: false, back: false };
let keyRaf = 0;
let keyLast = 0;

/** One eased step of key driving. Pure — pinned by unit tests. */
export function keyDriveStep(raw: number, dir: DriveDir, dt: number): number {
  return clamp(raw + dir * (dt / KEY_DRIVE_SECONDS));
}

function keyLoop(now: number): void {
  keyRaf = 0;
  const rawDir = (keyState.forward ? 1 : 0) - (keyState.back ? 1 : 0);
  const dir: DriveDir = rawDir === 0 ? 0 : rawDir > 0 ? 1 : -1;
  if (dir === 0) return;
  const dt = Math.min(Math.max((now - keyLast) / 1000, 0), 0.25);
  keyLast = now;
  const target = keyDriveStep(bus.raw, dir, dt);
  if (lenis) {
    // Retargeted every frame: Lenis chases the moving target, which reads as
    // steady driving rather than repeated 1.5s glides.
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    lenis.scrollTo(target * limit, {
      duration: KEY_DRIVE_DURATION,
      easing: (t) => 1 - (1 - t) ** 3,
    });
  } else {
    // Lenis not up yet (or torn down): same mapping, native jump. Reaching
    // this branch mid-hold flips to Lenis on the next tick automatically.
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, target * limit);
  }
  if (typeof requestAnimationFrame === 'function') {
    keyRaf = requestAnimationFrame(keyLoop);
  }
}

function kickKeyLoop(): void {
  if (keyRaf !== 0 || (!keyState.forward && !keyState.back)) return;
  keyLast = typeof performance !== 'undefined' ? performance.now() : 0;
  if (typeof requestAnimationFrame === 'function') {
    keyRaf = requestAnimationFrame(keyLoop);
  }
}

/** Press or release one side of the key drive. Idempotent (auto-repeat safe). */
export function setKeyDrive(which: 'forward' | 'back', on: boolean): void {
  if (keyState[which] === on) return;
  keyState[which] = on;
  if (on) kickKeyLoop();
}

/** For tests: which drive keys are currently held. */
export function getKeyDriveState(): { forward: boolean; back: boolean } {
  return { ...keyState };
}

/** Game-style ride keys. Mount once, high in the tree (see `App`). */
export function useKeyDrive(): void {
  useEffect(() => {
    const typing = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.tagName !== 'string') return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;
      if (event.code === 'KeyW') setKeyDrive('forward', true);
      else if (event.code === 'KeyS') setKeyDrive('back', true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'KeyW') setKeyDrive('forward', false);
      else if (event.code === 'KeyS') setKeyDrive('back', false);
    };
    const onBlur = (): void => {
      // Window losing focus swallows keyup: release both or W sticks forever.
      setKeyDrive('forward', false);
      setKeyDrive('back', false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, []);
}

/**
 * Locks or releases scrolling by stopping Lenis.
 *
 * Lenis is the only thing that needs telling: it drives scroll position from its
 * own rAF loop, so `overflow: hidden` on the body would be overwritten on the
 * next frame. Its `lenis-stopped` class handles the visual side (and the CSS for
 * it already exists), and `stop()` stops the actual wheel and touch handling.
 *
 * The request is remembered rather than applied directly, because the caller is
 * usually a child component: child effects run before the parent's, so the intro
 * asks for the lock before `useScrollProgress` has constructed Lenis and there is
 * nothing yet to stop. `useScrollProgress` replays the stored value the moment it
 * has an instance, which is what makes the very first load lock correctly.
 */
let scrollLocked = false;

export function setScrollLocked(locked: boolean): void {
  if (scrollLocked === locked) return;
  scrollLocked = locked;
  lenis?.[locked ? 'stop' : 'start']();
}

/** Prefix every station section carries on its `id`, e.g. `#station-about`. */
const SECTION_PREFIX = 'station-';

/** How long after a jump the section is given focus, once the ride has settled. */
const FOCUS_DELAY = 900;

/**
 * Intercepts clicks on in-page `href="#station-x"` links so they animate via
 * Lenis instead of jumping. Delegated on the document, so it keeps working for
 * links rendered by any component — the nav, the hero's contact button, the
 * skip-to-content link.
 */
export function useAnchorScroll(): void {
  const { reducedMotion } = useCapabilities();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest('a[href^="#"]');
      const href = anchor?.getAttribute('href');
      if (!href || href === '#') return;

      /*
       * `#main` is the skip link, and it must keep native behaviour: the skip
       * link's entire contract is "move focus past the navigation", and routing
       * it through Lenis turns an accessibility feature into an animation.
       */
      if (href === '#main') return;

      const sectionId = href.slice(1);
      if (!sectionId.startsWith(SECTION_PREFIX)) return;

      const id = sectionId.slice(SECTION_PREFIX.length);
      const index = STATIONS.findIndex((station) => station.id === id);
      if (index < 0) return;

      event.preventDefault();
      scrollToStation(index, reducedMotion);

      /*
       * Hand focus to the destination so the next Tab press continues from the
       * section rather than restarting at the top of the nav. `preventScroll`
       * keeps it from fighting Lenis for the scroll position. Skipped under
       * reduced motion because the jump is instant there and the timeout would
       * just move focus long after the reader has already started reading.
       */
      if (reducedMotion) {
        document.getElementById(sectionId)?.focus({ preventScroll: true });
        return;
      }
      window.setTimeout(() => {
        document.getElementById(sectionId)?.focus({ preventScroll: true });
      }, FOCUS_DELAY);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [reducedMotion]);
}

/** Index of the station whose docked position is closest to `progress`. */
export function nearestStation(progress: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < STATION_SCROLL.length; i++) {
    const distance = Math.abs((STATION_SCROLL[i] ?? 0) - progress);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** Subscribe to scroll progress without re-rendering React. */
export function subscribeScroll(fn: ScrollListener): () => void {
  bus.listeners.add(fn);
  fn(bus.raw);
  return () => {
    bus.listeners.delete(fn);
  };
}

/**
 * Sets up Lenis and returns a ~20fps snapshot for UI that must re-render
 * (nav highlighting, minimap dot, debug overlay). The 3D layer reads the
 * mutable `ride` object directly and never goes through this state.
 */
export function useScrollProgress(): RideState {
  const [snapshot, setSnapshot] = useState<RideState>({ ...ride });
  const { isTouch, isSmall, reducedMotion } = useCapabilities();

  useEffect(() => {
    const instance = new Lenis({
      duration: reducedMotion ? 0 : 1.05,
      easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
      smoothWheel: !reducedMotion,
      syncTouch: !isTouch,
      touchMultiplier: isTouch ? 1.0 : 1.6,
    });
    lenis = instance;

    // Replay a lock requested before this instance existed. The loader is a
    // child of this component, so its effect runs first and asks for the lock
    // while `lenis` is still null; without this the very first page load would
    // accept wheel input during the intro.
    if (scrollLocked) instance.stop();

    const onScroll = (e: { scroll: number }) => {
      // Deliberately ignoring Lenis's `limit`: it is measured from the wrapper
      // and can lag the real document height while sections are still settling,
      // which leaves the last stretch of the page unreachable (progress caps
      // around 0.93 and the closing station never fully arrives). Measuring the
      // ceiling ourselves costs one layout read per scroll event and is always
      // correct.
      updateFromScroll(e.scroll, document.documentElement.scrollHeight - window.innerHeight);
    };
    instance.on('scroll', onScroll);

    /*
     * Two loops, two handles. These used to share one `frame` variable, which
     * meant the UI sampler overwrote the Lenis driver's handle on its first
     * tick: cleanup cancelled only the sampler and the Lenis loop ran forever,
     * driving scroll position on an unmounted tree. Separate handles, separate
     * cancellations.
     */
    let lenisFrame = 0;
    const loop = (time: number) => {
      instance.raf(time);
      lenisFrame = requestAnimationFrame(loop);
    };
    lenisFrame = requestAnimationFrame(loop);

    // Lenis caches the scrollable extent on init and only recomputes it on
    // window resize. Content that settles after mount (fonts, the canvas, the
    // loader fading out) would otherwise leave its cached limit short, so the
    // last stretch of the page becomes unreachable and the final station never
    // fully arrives. Watching the document height keeps the two in sync.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(document.documentElement);

    // Initial sync: the page can load at a restored scroll offset.
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    updateFromScroll(window.scrollY, limit);

    // UI only needs ~20fps; the 3D layer is independent.
    // Change-detected: publishing a fresh object on every tick re-rendered every
    // `useScrollProgress` consumer (including `App` itself) twenty times a second
    // even while parked. The snapshot only moves when the ride does. Floats use
    // an epsilon because the ride damping converges asymptotically and would
    // otherwise keep "changing" by sub-pixel amounts for seconds after stopping.
    const SETTLED_EPSILON = 1e-4;
    const moved = (a: number, b: number): boolean => Math.abs(a - b) > SETTLED_EPSILON;
    let uiFrame = 0;
    let last = performance.now();
    let lastPublished = { ...ride };
    const uiTick = () => {
      const now = performance.now();
      if (now - last > 50) {
        last = now;
        if (
          moved(ride.progress, lastPublished.progress) ||
          moved(ride.t, lastPublished.t) ||
          moved(ride.speed, lastPublished.speed) ||
          moved(ride.speedFactor, lastPublished.speedFactor) ||
          ride.station !== lastPublished.station
        ) {
          lastPublished = { ...ride };
          setSnapshot(lastPublished);
        }
      }
      uiFrame = requestAnimationFrame(uiTick);
    };
    uiFrame = requestAnimationFrame(uiTick);

    return () => {
      cancelAnimationFrame(lenisFrame);
      cancelAnimationFrame(uiFrame);
      observer.disconnect();
      instance.off('scroll', onScroll);
      instance.destroy();
      lenis = null;
    };
  }, [isTouch, isSmall, reducedMotion]);

  return snapshot;
}
