import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidate } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import { IDENTITY } from '../../data/content';
import { INTRO } from '../../config/effects';
import type { QualitySettings } from '../../config/quality';
import { finishIntro, intro, startIntro } from '../../lib/intro';
import { setScrollLocked } from '../../hooks/useScrollProgress';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * ============================================================================
 * LOADER AND INTRO
 * ============================================================================
 *
 * Four phases, driven by two independent gates:
 *
 *   loading  shown until the assets resolve AND `INTRO.minLoaderMs` has passed
 *   leaving  the 520ms fade-out, which starts when both gates are satisfied
 *   intro    the camera glide, held with scroll locked, skippable
 *   done     unmounted
 *
 * The minimum-time gate exists because a warm cache resolves the loader in about
 * forty milliseconds. Without it the overlay appears and vanishes inside a single
 * frame, which reads as a glitch rather than a designed sequence.
 *
 * The loader itself shows on every load — assets genuinely do load on every load,
 * and pretending otherwise would mean faking progress. The *intro* is what is
 * once-per-session, tracked in `sessionStorage` behind a try/catch because
 * storage access throws outright in a sandboxed iframe and in Safari's private
 * mode, and a portfolio that white-screens there has failed for a cosmetic
 * reason.
 */

type Phase = 'loading' | 'leaving' | 'intro' | 'done';

/**
 * Hard cap on how long the loader will wait for assets.
 *
 * `useProgress` reports what the loaders tell it, and a request that fails rather
 * than completes never advances it. Without a ceiling, a failed or stalled
 * request means the loader never dismisses, which is a far worse failure than
 * showing the page slightly early.
 */
const LOAD_TIMEOUT_MS = 6000;

const SESSION_KEY = 'portfolio:intro-played';

function introAlreadyPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    // Storage unavailable: play the intro. Being unable to remember is a better
    // failure than silently never playing it.
    return false;
  }
}

function markIntroPlayed(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* Nothing to do; the intro will simply play again next visit. */
  }
}

export function Loader({ quality }: { quality: QualitySettings }) {
  const { progress, active } = useProgress();
  const reducedMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('loading');

  /*
   * Decided once, on the first render, rather than derived from an effect. Reading
   * storage during render is the point: it has to be settled before any effect
   * can observe `loading` and decide whether to start the intro, or the sequence
   * briefly locks the scroll for a visitor who has already seen it.
   */
  const shouldIntro = useRef<boolean | null>(null);
  if (shouldIntro.current === null) {
    shouldIntro.current = quality.intro && !introAlreadyPlayed() && !reducedMotion;
  }

  /*
   * Read during render, not mirrored into state. It is already a whole-number
   * value that drei updates at most a hundred times across the whole load, so
   * there is nothing to deduplicate — and copying it into an effect would add a
   * second render pass for every one of those updates to end up in the same place.
   */
  const percent = Math.round(progress);

  /* --- loading -> leaving ------------------------------------------- */
  useEffect(() => {
    if (phase !== 'loading') return;

    const startedAt = performance.now();
    // Assets are ready when the loaders have stopped reporting work. `active`
    // false with nothing loaded is also "ready" — that is a page with no external
    // assets, and the minimum-time gate is what covers it.
    const assetsReady = !active;

    let timer = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const timedOut = elapsed > LOAD_TIMEOUT_MS;
      if ((assetsReady && elapsed >= INTRO.minLoaderMs) || timedOut) {
        setPhase('leaving');
        return;
      }
      timer = window.setTimeout(tick, 60);
    };
    timer = window.setTimeout(tick, 60);

    return () => window.clearTimeout(timer);
  }, [phase, active]);

  /* --- leaving -> intro or done -------------------------------------- */
  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => {
      if (shouldIntro.current) {
        startIntro();
        setPhase('intro');
      } else {
        setPhase('done');
      }
    }, INTRO.fadeMs);
    return () => window.clearTimeout(timer);
  }, [phase]);

  /* --- scroll lock, released the moment the intro is over ----------- */
  useEffect(() => {
    if (phase === 'done') return;
    setScrollLocked(true);
    return () => setScrollLocked(false);
  }, [phase]);

  /*
   * Frame pump for the intro glide. The Canvas runs on demand: with scroll
   * locked there is no scroll activity for `RideInvalidator` to pump from,
   * and the ride driver is settled (progress never moves), so without this
   * the camera glide would never advance a frame. A plain rAF loop for the
   * ~2.5s life of the intro only — cancelled on skip, finish or unmount.
   *
   * Importing `invalidate` here is safe for the 2D budget: this component is
   * only ever mounted by the lazily-loaded 3D tree, so it lives in the 3D
   * chunk next to the drei import it already carries.
   */
  useEffect(() => {
    if (phase !== 'intro') return;
    let raf = 0;
    const pump = () => {
      invalidate();
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  /* --- the intro's own end, and the skip affordance ----------------- */
  const endSequence = useCallback(() => {
    finishIntro();
    markIntroPlayed();
    setPhase('done');
  }, []);

  useEffect(() => {
    if (phase !== 'intro') return;

    // Polling `intro.done` rather than timing it here: the camera rig owns the
    // clock, so this is just waiting to be told. 150ms is well under a frame at
    // any rate that matters and costs nothing when the intro is already over.
    const poll = window.setInterval(() => {
      if (intro.done) {
        window.clearInterval(poll);
        markIntroPlayed();
        setPhase('done');
      }
    }, 150);

    const skip = (event: Event) => {
      // Never swallow a keystroke the reader meant for the page.
      if (event instanceof KeyboardEvent && event.metaKey) return;
      endSequence();
    };

    // A click anywhere, or any key, skips. The brief asks for both.
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [phase, endSequence]);

  /*
   * Hero reveal, on every exit path.
   *
   * The hero letters are held by CSS until `data-revealed` appears on the root
   * element (see `.hero-letter` in index.css), so the name arrives with the glide
   * rather than animating behind an opaque overlay. It is set here rather than in
   * a per-path branch because there are three ways out of this component — assets
   * ready, skip, glide completing — and a fourth exit that sets the flag would be
   * a page with a permanently invisible h1.
   */
  useEffect(() => {
    if (phase === 'done') document.documentElement.dataset['revealed'] = '';
  }, [phase]);

  // Past the intro the component has nothing left to say or show.
  if (phase === 'done') return null;

  const leaving = phase === 'leaving' || phase === 'intro';

  return (
    <div
      /*
       * `fixed inset-0` with the highest z-index in the app, and *not*
       * `pointer-events-none`: the intro is skippable by clicking, and a click that
       * falls through to the page underneath would scroll the ride while the camera
       * is still gliding.
       */
      data-loader=""
      aria-hidden={phase === 'intro'}
      className="fixed inset-0 z-90 flex flex-col items-center justify-center gap-6 bg-ink-950"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${INTRO.fadeMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <p className="font-mono text-[0.62rem] tracking-[0.42em] text-neon-teal/80 uppercase">
        {IDENTITY.location}
      </p>

      <h1 className="font-display text-3xl font-bold tracking-tight text-mist-100 sm:text-4xl">
        {IDENTITY.name}
      </h1>

      {/* `role="progressbar"` rather than a bare div: this is the one moment the
          page states how much is left to wait for, and it is worth exposing to
          assistive technology rather than leaving as decoration. */}
      <div
        role="progressbar"
        aria-label="Loading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-px w-56 overflow-hidden bg-white/12 sm:w-72"
      >
        <div
          className="h-full bg-neon-teal"
          style={{
            width: `${percent}%`,
            // No transition: the value is already stepped by the loader's own
            // progress events, and easing between them would misreport the wait.
            transform: `translateZ(0)`,
          }}
        />
      </div>

      <p className="font-mono text-[0.68rem] tracking-[0.2em] text-mist-400 tabular-nums">
        {percent}%
      </p>

      {phase === 'intro' && (
        <p className="font-mono text-[0.58rem] tracking-[0.24em] text-mist-400/70 uppercase">
          click or press any key to skip
        </p>
      )}
    </div>
  );
}
