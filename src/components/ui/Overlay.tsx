import { useEffect, useRef } from 'react';
import { STATIONS } from '../../data/content';
import { SEGMENT_COUNT } from '../../lib/track';
import { StationSection } from './StationSection';

/**
 * The scroll-driven content layer.
 *
 * The wrapper is fixed, full-viewport and `pointer-events-none`, so the overlay
 * can never intercept a scroll gesture: the page below it stays the only thing
 * that moves. The stations themselves are positioned against the wrapper, which
 * is why they are `absolute` rather than in normal flow.
 *
 * Scroll length is set explicitly in pixels rather than with `100vh`. The ride
 * maps scroll progress onto track position through `STATION_SCROLL`, which
 * divides the range into `SEGMENT_COUNT` equal spans, so the ceiling has to be
 * exactly `SEGMENT_COUNT` viewports tall for the last station to sit at progress
 * 1. `svh` and `vh` both drift from `window.innerHeight` on mobile, which is what
 * made the closing station unreachable in the previous phase.
 */
export function Overlay() {
  const runway = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = runway.current;
    if (!element) return;

    const resize = () => {
      element.style.height = `${(SEGMENT_COUNT + 1) * window.innerHeight}px`;
    };
    resize();

    // A rotating phone or a desktop window drag changes the ceiling; the ride
    // mapping depends on it, so it has to be recomputed rather than cached.
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  return (
    <>
      {/* Scroll runway: gives the page its length. Empty, and not exposed to
          assistive technology, because the content lives in the overlay. */}
      <div ref={runway} aria-hidden="true" />

      <div id="overlay" className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
        {STATIONS.map((station, index) => (
          <StationSection key={station.id} station={station} index={index} />
        ))}
      </div>
    </>
  );
}
