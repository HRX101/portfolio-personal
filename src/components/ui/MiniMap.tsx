import { useEffect, useRef } from 'react';
import { STATIONS as STATION_MARKERS } from '../../config/scene';
import { SITE_CHROME, getStationContent } from '../../data/content';
import { onStationFrame, readActiveStation } from '../../hooks/useActiveStationStore';
import { useActiveStation } from '../../hooks/useActiveStation';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { scrollToStation } from '../../hooks/useScrollProgress';
import {
  MINIMAP_HEIGHT,
  MINIMAP_PROJECTION,
  MINIMAP_WIDTH,
  minimapPointAtT,
  minimapStationPoint,
  type MapPoint,
} from '../../lib/minimap';

/**
 * Top-down track map, bottom right.
 *
 * The rider's dot and the completed portion of the track are written straight to
 * SVG attributes from the shared station ticker. Routing them through React state
 * would re-render the map sixty times a second for a circle that moves eight
 * pixels; a ref write costs nothing and never touches the component tree.
 *
 * The completed portion uses `stroke-dasharray` on a `pathLength="1"` duplicate
 * of the track. `getPointAt` is arc-length parameterised, so the dashed fraction
 * is the fraction of the real 3D ride the rider has covered, not the fraction of
 * the index.
 */
export function MiniMap() {
  const { activeId } = useActiveStation();
  const reducedMotion = useReducedMotion();
  const riderRef = useRef<SVGCircleElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const point = useRef<MapPoint>({ x: 0, y: 0 });
  // Last strings written by the frame loop. `setAttribute` with an identical
  // value still dirties the SVG subtree, so while parked every frame is skipped.
  const written = useRef<{ cx: string; cy: string; dash: string } | undefined>(undefined);

  useEffect(
    () =>
      onStationFrame(() => {
        const ride = readActiveStation();
        minimapPointAtT(ride.t, point.current);

        const cx = point.current.x.toFixed(2);
        const cy = point.current.y.toFixed(2);
        const done = Math.max(0, Math.min(1, ride.t));
        // 1 - done: the dash starts hidden and is revealed from the start.
        const dash = (1 - done).toFixed(4);
        const prev = written.current;
        if (prev && prev.cx === cx && prev.cy === cy && prev.dash === dash) return;
        written.current = { cx, cy, dash };

        const rider = riderRef.current;
        if (rider) {
          rider.setAttribute('cx', cx);
          rider.setAttribute('cy', cy);
        }
        const trail = trailRef.current;
        if (trail) {
          trail.setAttribute('stroke-dashoffset', dash);
        }
      }),
    [],
  );

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-30 hidden lg:block">
      <div
        className="panel pointer-events-auto relative rounded-xl px-2 pt-2 pb-1.5"
        style={{ width: MINIMAP_WIDTH + 16, height: MINIMAP_HEIGHT + 34 }}
        role="group"
        aria-label={SITE_CHROME.minimap.label}
      >
        <p className="font-mono text-[0.55rem] tracking-[0.24em] text-mist-400 uppercase">
          {SITE_CHROME.minimap.hint}
        </p>

        <div
          className="relative mt-1"
          style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
        >
          <svg
            viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
            width={MINIMAP_WIDTH}
            height={MINIMAP_HEIGHT}
            aria-hidden="true"
            className="block"
          >
            {/* Unridden track. */}
            <path
              d={MINIMAP_PROJECTION.path}
              fill="none"
              stroke="rgb(125 133 173 / 0.28)"
              strokeWidth={1.4}
              strokeLinecap="round"
            />
            {/* Ridden track, revealed by dash offset. */}
            <path
              ref={trailRef}
              d={MINIMAP_PROJECTION.path}
              fill="none"
              stroke="rgb(69 240 224 / 0.9)"
              strokeWidth={1.6}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset="1"
            />
            {/* Station dots. */}
            {STATION_MARKERS.map((station) => {
              const dot = minimapStationPoint(station.t);
              return (
                <circle
                  key={station.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={2}
                  fill={station.id === activeId ? 'rgb(69 240 224)' : 'rgb(213 218 242)'}
                  stroke="rgb(4 5 13)"
                  strokeWidth={0.6}
                />
              );
            })}
            <circle
              ref={riderRef}
              cx={MINIMAP_WIDTH / 2}
              cy={MINIMAP_HEIGHT / 2}
              r={2.8}
              fill="rgb(255 79 154)"
              stroke="rgb(4 5 13)"
              strokeWidth={0.8}
            />
          </svg>

          {/* Station targets are real buttons layered over the SVG: free keyboard
              support, a real hit area, and a hover label, none of which an SVG
              circle with a tabindex gives you. Percentages match the SVG because
              the container's aspect ratio is pinned to the viewBox. */}
          {STATION_MARKERS.map((station, index) => {
            const dot = minimapStationPoint(station.t);
            const left = `${(dot.x / MINIMAP_WIDTH) * 100}%`;
            const top = `${(dot.y / MINIMAP_HEIGHT) * 100}%`;
            return (
              <button
                key={station.id}
                type="button"
                onClick={() => {
                  scrollToStation(index, reducedMotion);
                  document
                    .getElementById(`station-${station.id}`)
                    ?.focus({ preventScroll: true });
                }}
                aria-label={`${getStationContent(station.id).navLabel} — ${SITE_CHROME.minimap.hint}`}
                data-active={station.id === activeId}
                /*
                 * 24px hit area. The visible dot is the SVG circle underneath;
                 * this button is transparent chrome, so only the hit area grows
                 * and the map keeps its proportions.
                 */
                className="minimap-dot pointer-events-auto group absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left, top }}
              >
                <span className="minimap-label pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-md border border-white/15 bg-ink-950/95 px-1.5 py-0.5 font-mono text-[0.55rem] tracking-[0.14em] whitespace-nowrap text-mist-100 uppercase opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  {getStationContent(station.id).navLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
