import { useEffect, useState } from 'react';
import { getOffer2D, resetOffer2D } from '../canvas/PerfGovernor';
import type { ExperienceMode } from '../../hooks/useCapabilities';

/**
 * The "this is not working, try the lightweight view" prompt.
 *
 * Props come from `Experience3D` for a reason: mode is owned by `App`, and
 * `useCapabilities` keeps its override in per-instance React state. A prompt
 * that called the hook's `setMode` itself would set a preference only its own
 * subtree could see — the router in `App` would never hear about it and the
 * button would do nothing. This component therefore reports, and `App` decides.
 */
interface PerfPromptProps {
  /** Active mode. The prompt only ever shows in 3D. */
  mode: ExperienceMode;
  /** Whether a WebGL context exists at all. No context, no prompt. */
  webgl: boolean;
  /** Switch to 2D at the reader's request. */
  onSwitchTo2D: () => void;
}

export function PerfPrompt({ mode, webgl, onSwitchTo2D }: PerfPromptProps) {
  const [show, setShow] = useState(false);

  /*
   * Polls rather than subscribes because the flag lives in module scope, not in
   * React state. Wiring every frame of the governor into a re-render would put
   * React on the hot path of the one component whose job is to report that the
   * hot path is struggling. Once a second is plenty for a prompt a reader will
   * act on in seconds.
   */
  useEffect(() => {
    if (mode !== '3D' || !webgl) return;

    const check = () => {
      setShow((was) => {
        const now = getOffer2D();
        return was === now ? was : now;
      });
    };

    const interval = window.setInterval(check, 1000);
    check();
    return () => window.clearInterval(interval);
  }, [mode, webgl]);

  const handleSwitch = () => {
    resetOffer2D();
    setShow(false);
    onSwitchTo2D();
  };

  const handleDismiss = () => {
    resetOffer2D();
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="perf-prompt" role="alert">
      {/*
        `role="alert"` implies `aria-live="assertive"` — stating both is redundant
        and some screen readers announce the region twice. The label on the first
        button repeats the question because "Switch" without context is
        meaningless in a list of buttons read out of order.
      */}
      <div className="perf-prompt-inner">
        <p>Having trouble with the 3D experience?</p>
        <div className="perf-prompt-actions">
          <button
            type="button"
            onClick={handleSwitch}
            className="btn btn-primary"
          >
            Switch to the lightweight 2D view
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-ghost"
          >
            Keep the 3D view
          </button>
        </div>
      </div>
    </div>
  );
}
