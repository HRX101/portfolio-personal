import { useEffect } from 'react';
import * as THREE from 'three';
import { MICRO } from '../../config/effects';
import { getRide } from '../../hooks/useScrollProgress';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { clamp } from '../../lib/easing';

/**
 * ============================================================================
 * POINTER MICRO-INTERACTIONS
 * ============================================================================
 *
 * One component drives the continuous half of the pointer work: a cursor glow,
 * magnetic buttons, and station-card tilt. Discrete hover states — skill-tile
 * ripples, nav and tile colour — stay in CSS, where they are cheaper and where
 * `:has()` already expresses "when any tile in this row is hovered".
 *
 * The point of having them share a component is the listener budget. These are
 * four effects' worth of behaviour, and four separate components would mean four
 * pointermove handlers each doing its own layout read per event. Here there is one
 * handler and one loop.
 *
 * The other half of the reason is ownership. Every result below is written to
 * `translate` or `rotate`, never to `transform`. Station cards and hero buttons
 * already have per-frame transforms and Tailwind hover transitions writing to
 * `transform`, and a third writer on the same property loses to whichever wrote
 * last — silently, and only sometimes. Separate properties compose instead:
 * `translate` then `rotate` then `transform` are three distinct stages of one
 * matrix, so a magnet pull, a tilt and a Tailwind scale can share an element
 * without any of them knowing the others exist.
 *
 * Nothing here re-renders React and nothing allocates inside the loop.
 */

/** A button that leans toward the pointer inside `MICRO.magnetRadius`. */
interface Magnet {
  el: HTMLElement;
  /** Cached centre, refreshed on scroll/resize rather than per event. */
  cx: number;
  cy: number;
  /** Smoothed displacement in pixels. */
  x: number;
  y: number;
}

/** A card that tips toward the pointer. */
interface Tilt {
  el: HTMLElement;
  cx: number;
  cy: number;
  /** Smoothed rotation in degrees. */
  rx: number;
  ry: number;
}

const magnets: Magnet[] = [];
const tilts: Tilt[] = [];
let glow: HTMLElement | null = null;
let glowRing: HTMLElement | null = null;

/** Written by the event handlers, read by the loop. */
const pointer = { x: 0, y: 0, active: false };
/** Smoothed glow position, so the light trails the hand slightly. */
const glowPos = { x: 0, y: 0 };
let glowSeeded = false;

/**
 * `getBoundingClientRect` forces layout, so it cannot run on `pointermove`: a
 * 1000Hz mouse fires that ten times a frame and each read would flush style. The
 * boxes only move on scroll, resize and DOM changes, so reads are batched — the
 * pointer handler raises a flag and the loop does at most one pass per frame.
 */
let geometryDirty = true;

function measure(): void {
  for (const m of magnets) {
    const r = m.el.getBoundingClientRect();
    m.cx = r.left + r.width / 2;
    m.cy = r.top + r.height / 2;
  }
  for (const t of tilts) {
    const r = t.el.getBoundingClientRect();
    t.cx = r.left + r.width / 2;
    t.cy = r.top + r.height / 2;
  }
  geometryDirty = false;
}

/**
 * The shared loop.
 *
 * A second animation loop alongside Lenis's and R3F's is normally worth avoiding,
 * but this one cannot live in R3F's loop: it has to keep working on the
 * DOM-only fallback, where there is no canvas at all. Nor can it ride on Lenis's,
 * because it must run whether or not the reader is scrolling.
 *
 * `enabled` is read every frame rather than captured, so pausing is a flag write
 * rather than an effect teardown. The loop idles to a handful of damp calls when
 * the pointer is out of range, which is most of the time.
 */
let loopEnabled = false;

let loopCancel: (() => void) | null = null;

function startLoop(): void {
  if (loopEnabled) return;
  loopEnabled = true;
  let raf = 0;
  let last = performance.now();

  const tick = (now: number) => {
    if (!loopEnabled) return;
    raf = requestAnimationFrame(tick);

    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (geometryDirty) measure();

    const speed = getRide().speedFactor;

    if (glow && glowRing && pointer.active) {
      if (!glowSeeded) {
        glowPos.x = pointer.x;
        glowPos.y = pointer.y;
        glowSeeded = true;
      }
      const lambda = MICRO.cursorLambda;
      glowPos.x = THREE.MathUtils.damp(glowPos.x, pointer.x, lambda, dt);
      glowPos.y = THREE.MathUtils.damp(glowPos.y, pointer.y, lambda, dt);

      // Rounded to a whole pixel: subpixel values here buy nothing visible and
      // cost the compositor a re-rasterise it would otherwise skip.
      glow.style.transform = `translate3d(${Math.round(glowPos.x - MICRO.cursorRadius)}px, ${
        Math.round(glowPos.y - MICRO.cursorRadius)
      }px, 0)`;

      // The light brightens with the ride's speed, so it reads as part of the
      // scene rather than a sticker following the mouse.
      glowRing.style.opacity = (0.4 + speed * 0.6).toFixed(3);
    }

    const radius = MICRO.magnetRadius;
    for (const m of magnets) {
      const dx = pointer.x - m.cx;
      const dy = pointer.y - m.cy;
      // Circular region, so a button's pull is uniform all the way around it.
      // A square region makes the top and bottom edges noticeably stronger than
      // the sides, because the corner of the box is closer than its middle.
      const inside = pointer.active && dx * dx + dy * dy < radius * radius;

      // Pull toward the pointer's offset from centre, damped on the way out as
      // well as in, so a release always returns rather than snapping.
      const lambda = MICRO.magnetReturn;
      m.x = THREE.MathUtils.damp(m.x, inside ? dx * MICRO.magnetStrength : 0, lambda, dt);
      m.y = THREE.MathUtils.damp(m.y, inside ? dy * MICRO.magnetStrength : 0, lambda, dt);

      m.el.style.translate = `${m.x.toFixed(1)}px ${m.y.toFixed(1)}px`;
    }

    for (const t of tilts) {
      const dx = pointer.x - t.cx;
      const dy = pointer.y - t.cy;
      const halfW = Math.max(t.el.offsetWidth / 2, 1);
      const halfH = Math.max(t.el.offsetHeight / 2, 1);

      // -1..1 across the face. The divisor adds the magnet radius so the card is
      // still fully tilted while the pointer is just outside its edge — that is
      // what makes the tilt feel attached to the cursor instead of switching on.
      const nx = clamp(dx / (halfW + radius), -1, 1);
      const ny = clamp(dy / (halfH + radius), -1, 1);
      const inside = pointer.active && Math.abs(nx) < 1 && Math.abs(ny) < 1;

      // Rotation about X is negated relative to the pointer's vertical offset:
      // the top of the card should tip away from the pointer, and a negative X
      // rotation is what does that on the pointer's side.
      const lambda = MICRO.tiltLambda;
      t.rx = THREE.MathUtils.damp(t.rx, inside ? -ny * MICRO.tiltMax : 0, lambda, dt);
      t.ry = THREE.MathUtils.damp(t.ry, inside ? nx * MICRO.tiltMax : 0, lambda, dt);

      t.el.style.rotate = `x ${t.rx.toFixed(2)}deg y ${t.ry.toFixed(2)}deg`;
    }
  };

  raf = requestAnimationFrame(tick);
  // Held on the module rather than in a local so the pointer effect can stop the
  // loop on its own without owning the teardown, and so a preference change and
  // an unmount can both call `stopLoop` without the second call failing.
  loopCancel = () => {
    loopEnabled = false;
    cancelAnimationFrame(raf);
  };
}

function stopLoop(): void {
  loopCancel?.();
  loopCancel = null;
}

export function MicroInteractions() {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    startLoop();
    return stopLoop;
  }, []);

  /* --- pointer + media queries ------------------------------------------ */
  useEffect(() => {
    if (reducedMotion) {
      // Every effect here is a response to the pointer moving, and none of them
      // are information: with the preference set, the page simply does not
      // decorate itself around the cursor.
      stopLoop();
      resetOffsets();
      return;
    }

    /*
     * Fine pointers only. A coarse pointer has no cursor to lead and no hover to
     * respond to, so on a phone this is four listeners and a loop that never
     * writes anything. Skipping them entirely is what keeps touch from paying
     * for desktop's flourishes.
     */
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) {
      stopLoop();
      resetOffsets();
      return;
    }

    startLoop();

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      geometryDirty = true;
    };

    // `pointerleave` on `document` fires when the pointer leaves the window;
    // `blur` covers the alt-tab case, which otherwise leaves the last position
    // frozen on screen.
    const onLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      resetOffsets();
    };
  }, [reducedMotion]);

  /* --- targets ------------------------------------------------------------ */
  useEffect(() => {
    const root = document.getElementById('main');
    if (!root) return;

    /*
     * Observed rather than queried once. Station cards mount and unmount as the
     * reader moves between sections, so a one-shot query would hold references to
     * elements that are no longer in the document within a single station.
     *
     * The callback coalesces to a rAF because a mutation burst — one station
     * swapping out and the next swapping in — would otherwise rebuild the list
     * several times in one frame.
     */
    let pending = 0;

    const collect = () => {
      pending = 0;
      for (const m of magnets) m.el.style.translate = '';
      for (const t of tilts) t.el.style.rotate = '';
      magnets.length = 0;
      tilts.length = 0;

      for (const el of root.querySelectorAll<HTMLElement>('[data-magnetic]')) {
        magnets.push({ el, cx: 0, cy: 0, x: 0, y: 0 });
      }
      for (const el of root.querySelectorAll<HTMLElement>('[data-tilt]')) {
        tilts.push({ el, cx: 0, cy: 0, rx: 0, ry: 0 });
      }
      geometryDirty = true;
    };

    const schedule = () => {
      if (pending) return;
      pending = requestAnimationFrame(collect);
    };

    collect();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });

    window.addEventListener('scroll', markGeometryDirty, { passive: true });
    window.addEventListener('resize', markGeometryDirty);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
      window.removeEventListener('scroll', markGeometryDirty);
      window.removeEventListener('resize', markGeometryDirty);
      resetOffsets();
    };
  }, []);

  return (
    /*
     * The glow is a sibling of the overlay rather than a child: it has to sit above
     * the panels and below the nav, and it must never take a pointer event or it
     * would swallow the hovers under it.
     *
     * `pointer-events-none` is load-bearing, and so is `will-change: transform`:
     * without it the compositor promotes the glow late, on the first pointer
     * event, and that first frame is the only one in this component that shows.
     */
    <div
      aria-hidden="true"
      ref={(el) => {
        glow = el;
      }}
      className="pointer-events-none fixed top-0 left-0 z-20"
      style={{
        width: MICRO.cursorRadius * 2,
        height: MICRO.cursorRadius * 2,
        // Centring via margins keeps the transform a single translate3d with no
        // percentage in it, which is cheaper and avoids a second matrix.
        marginLeft: -MICRO.cursorRadius,
        marginTop: -MICRO.cursorRadius,
        opacity: reducedMotion ? 0 : 1,
        transition: 'opacity 400ms ease-out',
        willChange: 'transform',
      }}
    >
      <div
        ref={(el) => {
          glowRing = el;
        }}
        className="size-full rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--color-neon-teal) 14%, transparent) 0%, transparent 70%)',
          opacity: 0.4,
          transition: 'opacity 300ms ease-out',
        }}
      />
    </div>
  );
}

function markGeometryDirty(): void {
  geometryDirty = true;
}

/** Clears every written custom value, so nothing is left translated or tilted. */
function resetOffsets(): void {
  for (const m of magnets) {
    m.x = 0;
    m.y = 0;
    m.el.style.translate = '';
  }
  for (const t of tilts) {
    t.rx = 0;
    t.ry = 0;
    t.el.style.rotate = '';
  }
  pointer.active = false;
  glowSeeded = false;
}
