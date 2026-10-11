import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { ActiveStationProvider } from '../hooks/useActiveStation';
import { useAnchorScroll, useKeyDrive, useScrollProgress } from '../hooks/useScrollProgress';
import { ErrorBoundary } from './ErrorBoundary';
import { useDeviceProfile } from '../hooks/useIsLowEnd';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useQuality } from '../hooks/useQuality';
import { useCapabilities, type ExperienceMode } from '../hooks/useCapabilities';
import { disposeSound } from '../lib/audio';
import { trackModeChoice, trackPageView } from '../lib/analytics';

/**
 * ============================================================================
 * MODE ROUTER
 * ============================================================================
 *
 * The only thing this component owns is *which* experience is mounted. Both
 * experiences are dynamically imported, and that is the whole point: a 2D-mode
 * visitor must not download three.js, R3F or the postprocessing chain, because
 * they will never render a frame of it.
 *
 * `App` itself therefore imports no renderer, no scene and no canvas component.
 * Anything that reaches `three` has to live behind one of the two `lazy()`
 * boundaries below, or the bundler will hoist it into the entry chunk and the
 * `modulepreload` hints in `index.html` will fetch it anyway — which is exactly
 * the bug this structure exists to prevent. If you add a 3D import here, 2D mode
 * silently starts paying for it.
 *
 * Detection state (`useCapabilities`, `useQuality`) stays in `App` rather than
 * in either experience, because mode switching has to be seamless: the renderer
 * tears down and rebuilds, the DOM chrome around it does not. The same quality
 * settings that drove the last 3D frame drive the first one after a switch back.
 */

/*
 * The two chunks exist for different reasons.
 *
 * `Site2D` is eager: 2D is the fallback, and a fallback that has to win a race
 * against a dynamic import is not a fallback. On the failure path — no WebGL,
 * reduced motion, a saved preference, a lost context — this has to be ready to
 * render immediately.
 *
 * `Experience3D` is the expensive one (three, R3F, postprocessing, the scene
 * graph, roughly 290 kB gzipped, none of which a 2D visitor uses) and is created
 * on demand through `getExperience3D()` below.
 *
 * Neither the entry chunk nor anything it statically imports may reach `three`.
 * That is the invariant this file exists to defend: anything that reaches it
 * has to live behind one of these `lazy()` boundaries, or the bundler hoists it
 * into the entry chunk, emits a `modulepreload` for it in `index.html`, and 2D
 * mode silently downloads the renderer it will never use. If the 2D trace ever
 * shows a three chunk again, the first place to look is the import list at the
 * top of this file.
 */
const Site2D = lazy(() => import('./fallback/Site2D').then((mod) => ({ default: mod.Site2D })));

/*
 * The 3D chunk. `lazy()` at module scope does not fetch anything: it only
 * builds a component whose *render* triggers the dynamic import. The fetch
 * happens if and when the 3D branch below mounts, and never otherwise. (The
 * thing that *would* fetch unconditionally is a static import — that is what
 * puts a `modulepreload` in `index.html`. The ground truth for this invariant
 * is the built `index.html`: it must contain no three, R3F or postprocessing
 * `modulepreload`.)
 */
const Experience3D = lazy(() => import('./Experience3D'));

/** Shown while either chunk is in flight. Announced, not silent. */
function ModeLoading({ mode }: { mode: ExperienceMode }) {
  return (
    <div
      className="mode-switcher-loading"
      role="status"
      aria-live="polite"
    >
      {mode === '2D' ? 'Loading lightweight view…' : 'Loading 3D experience…'}
    </div>
  );
}

export function App() {
  useScrollProgress();
  useAnchorScroll();
  // Game-style alternate input (W/S). Lives here so it works in both modes;
  // it funnels into the same progress value as the wheel.
  useKeyDrive();

  const device = useDeviceProfile();
  const reducedMotion = useReducedMotion();
  const capabilities = useCapabilities();

  // Quality is resolved here, above the mode boundary, so a 2D -> 3D switch
  // starts on the level the device was detected at rather than re-detecting.
  const quality = useQuality(device, reducedMotion);

  const { mode, setMode, webgl, isSmall } = capabilities;

  /*
   * Derived, not synced. An earlier version kept `currentMode` in state and
   * copied `mode` into it from an effect, which is a render cascade by another
   * name — and it had a real bug: the effect ran after every `mode` change, so
   * a context loss followed by a storage event in the same commit could un-force
   * the 2D fallback before the reader ever saw it.
   *
   * `lossOverride` is the only state here, and it means exactly one thing: the
   * context went away and has not come back. Everything else is `mode`.
   */
  const [lossOverride, setLossOverride] = useState(false);
  const currentMode: ExperienceMode = lossOverride ? '2D' : mode;

  // The user took the wheel: drop the loss override and record the preference.
  const handleSwitch = useCallback(
    (next: ExperienceMode) => {
      setLossOverride(false);
      setMode(next);
      trackModeChoice(next);
    },
    [setMode],
  );

  // Losing the context is not a choice, so it bypasses persistence entirely.
  const handleContextLost = useCallback(() => {
    setLossOverride(true);
  }, []);

  // Returning to 3D is only possible when there is a context to draw into.
  const switchTo3D = useCallback(() => {
    if (webgl) handleSwitch('3D');
  }, [webgl, handleSwitch]);

  const switchTo2D = useCallback(() => handleSwitch('2D'), [handleSwitch]);

  // The renderer is being torn down; stop the audio engine with it rather than
  // leaving it running behind a DOM document that has no 3D to synchronise to.
  useEffect(() => {
    if (currentMode === '2D') disposeSound();
  }, [currentMode]);

  // One page view per page load. The mode recorded is the resolved one, so the
  // split in the dashboard reads as "what readers actually saw", not "what was
  // asked for".
  useEffect(() => {
    trackPageView(currentMode);
    // Deliberately once: a mode *switch* is a `mode-choice`, not a page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show2D = currentMode === '2D' || !webgl;

  return (
    <ActiveStationProvider>
      {show2D ? (
        <Suspense fallback={<ModeLoading mode="2D" />}>
          <Site2D canSwitchTo3D={webgl} onSwitchTo3D={switchTo3D} />
        </Suspense>
      ) : (
        /*
         * A renderer crash must never white-screen the site: the boundary swaps
         * the whole 3D tree for a way out rather than a stack trace. Retry
         * remounts the tree (a transient GPU hiccup recovers); the lightweight
         * view is the guaranteed exit (a real driver failure does not).
         */
        <ErrorBoundary
          label="Experience3D"
          fallback={(retry) => (
            <div className="mode-crash" role="alert">
              <p className="mode-crash-title">The 3D experience hit a bump</p>
              <p className="mode-crash-body">
                The full portfolio is still here in the lightweight view —
                same content, no 3D required.
              </p>
              <div className="mode-crash-actions">
                <button type="button" className="btn btn-primary" onClick={switchTo2D}>
                  Open the lightweight view
                </button>
                <button type="button" className="btn btn-ghost" onClick={retry}>
                  Try 3D again
                </button>
              </div>
            </div>
          )}
        >
          <Suspense fallback={<ModeLoading mode="3D" />}>
            <Experience3D
              quality={quality}
              mode={currentMode}
              webgl={webgl}
              isSmall={isSmall}
              onContextLost={handleContextLost}
              onSwitchTo2D={switchTo2D}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </ActiveStationProvider>
  );
}