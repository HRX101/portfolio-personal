import { useEffect, useState } from 'react';
import { STATION_SCROLL } from '../../lib/rideMath';

/**
 * ============================================================================
 * SCROLL PROGRESS BAR
 * ============================================================================
 *
 * Lightweight horizontal progress bar at the top of the viewport.
 * Shows journey progress and station markers.
 * Used by both 3D and 2D modes.
 */

export function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  /*
   * rAF-coalesced and compared before writing: a scroll handler that set state
   * on every event would re-render this component — and everything it shares a
   * tree with — at input-event frequency, on the same thread as the scroll.
   * The bar is 3px tall; nobody can see an update faster than a frame anyway.
   */
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      const next = limit > 0 ? window.scrollY / limit : 0;
      setProgress((was) => (was === next ? was : next));
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className="scroll-progress"
      role="progressbar"
      aria-label="Journey progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      style={{ '--progress': `${progress * 100}%` } as React.CSSProperties}
    >
      <div className="scroll-progress-fill" />
      {STATION_SCROLL.map((p, i) => (
        <span
          key={i}
          className="scroll-progress-station"
          style={{ left: `${p * 100}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}