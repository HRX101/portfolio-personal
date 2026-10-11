import { useEffect, useRef } from 'react';
import { SITE_CHROME } from '../../data/content';
import { onStationFrame } from '../../hooks/useActiveStationStore';
import { getRide } from '../../hooks/useScrollProgress';

/** Fraction of the first segment after which the hero's scroll cue is gone. */
const HERO_CUE_FADE = 0.03;

/**
 * Journey progress, drawn as a hairline on the left edge.
 *
 * This component also publishes the two values the rest of the page reads as CSS
 * custom properties, because they are continuous and every consumer wants them
 * per frame: the bar's own scale, and the hero scroll cue's opacity, which the
 * spec retires within the first three percent of scroll. Writing one property on
 * the document root is cheaper than several listeners each polling the same
 * store, and it keeps the cue and the bar in step by construction.
 *
 * `aria-valuenow` is only rewritten when the integer percentage changes, so the
 * progress bar is honest to assistive technology without announcing a new value
 * sixty times a second.
 */
export function ProgressBar() {
  const fillRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const reported = useRef(-1);

  useEffect(
    () =>
      onStationFrame(() => {
        const progress = getRide().progress;
        const root = document.documentElement;

        // Raw scroll drives the bar and the cue; the damped `t` would make the
        // bar lag the page and stop short of its own end.
        root.style.setProperty('--ride-progress', progress.toFixed(4));
        root.style.setProperty('--hero-cue', clamp01(1 - progress / HERO_CUE_FADE).toFixed(4));

        const fill = fillRef.current;
        if (fill) fill.style.transform = `scaleY(${Math.max(0.004, progress).toFixed(4)})`;

        const percent = Math.round(progress * 100);
        if (percent !== reported.current) {
          reported.current = percent;
          barRef.current?.setAttribute('aria-valuenow', String(percent));
        }
      }),
    [],
  );

  return (
    <div
      ref={barRef}
      className="pointer-events-none fixed top-1/2 left-0 z-30 hidden h-32 -translate-y-1/2 md:block"
      role="progressbar"
      aria-label={SITE_CHROME.progress.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <div className="absolute inset-0 left-0 w-[2px] bg-white/10" />
      <div
        ref={fillRef}
        className="absolute inset-0 left-0 w-[2px] origin-top bg-neon-teal"
        style={{ transform: 'scaleY(0.004)' }}
      />
    </div>
  );
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
