import { useEffect, useRef, useState } from 'react';
import { readActiveStation } from '../../hooks/useActiveStationStore';
import { getRide, scrollToStation } from '../../hooks/useScrollProgress';
import {
  cycleQuality,
  getQuality,
  setQualityOverride,
  useQualityLevel,
} from '../../hooks/useQuality';
import { QUALITY_LEVELS } from '../../config/quality';
import { STATION_IDS } from '../../data/content';
import { renderStats } from '../../lib/renderStats';
import { cameraKick } from '../../lib/cameraKick';
import { useCapabilities } from '../../hooks/useCapabilities';
import { devGetAvgFps, devGetPerfFactor } from '../canvas/PerfGovernor';

/**
 * Dev-only HUD (press "d"). Stripped from production builds — `App` renders it
 * behind `import.meta.env.DEV`, so nothing here reaches a shipped bundle.
 *
 * Reads the mutable ride, station and quality stores on a rAF loop rather than
 * subscribing to React state, and writes the result straight into the DOM
 * through refs. React state is involved exactly twice in the whole component: the
 * `open` flag, and nothing else. An earlier version pushed a `lines` array into
 * state every frame, which meant a re-render per frame — and because `level` is a
 * fresh object each render, that also churned the effect's dependency array and
 * tore down and restarted the rAF loop on every single frame.
 *
 * Keys:
 *   1-7   jump to station
 *   L/M/H set the quality level explicitly
 *   0     hand control back to the device profile
 *   C     cycle L -> M -> H -> L
 *   D     close
 *
 * The per-level FPS table is the reason the level switcher exists at all: it is
 * the only honest way to answer "does LOW actually buy frames here?", because it
 * accumulates samples per level rather than comparing two numbers taken at
 * different moments with different scene contents.
 */

/** Live rows, then one row per quality level. Fixed so the refs can be indexed. */
const LIVE_ROWS = 16;
const LEVEL_ROWS = 3;
const TOTAL_ROWS = LIVE_ROWS + LEVEL_ROWS;

/** How often the accumulated FPS table is re-formatted. */
const FPS_FLUSH_MS = 500;

export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const level = useQualityLevel();
  /*
   * Read-only capability facts for the readout below. This is a second hook
   * instance, which is fine precisely because nothing here writes: `mode` on
   * this instance is the *auto-detected* mode (no override of its own), while
   * the mode actually on screen is owned by `App`. The overlay labels it as
   * detected, not active, so the two can never be confused.
   */
  const caps = useCapabilities();

  // Row elements, indexed. `liveRows.current[i]` is the i-th readout line.
  const rowEls = useRef<(HTMLDivElement | null)[]>([]);
  // Accumulated FPS per level, in a ref so the frame loop never touches state.
  const samples = useRef<Record<string, { sum: number; frames: number }>>({});

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Ignore when typing in a form field.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const key = event.key.toLowerCase();

      if (key === 'd') {
        setOpen((value) => !value);
        return;
      }

      if (key === 'l') {
        setQualityOverride('LOW');
        return;
      }
      if (key === 'm') {
        setQualityOverride('MEDIUM');
        return;
      }
      if (key === 'h') {
        setQualityOverride('HIGH');
        return;
      }
      if (key === '0') {
        setQualityOverride(null);
        return;
      }
      if (key === 'c') {
        cycleQuality();
        return;
      }

      // 1..7 jump to the matching station.
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < STATION_IDS.length) {
        scrollToStation(index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let lastFlush = 0;

    /*
     * Assigned only when the text actually changed. `textContent` writes are
     * cheap but they invalidate layout for the whole overlay, and the progress and
     * speed rows hold four significant figures — so most frames, parked or moving,
     * genuinely have nothing new to say for half the rows.
     */
    const write = (index: number, text: string): void => {
      const el = rowEls.current[index];
      if (el && el.textContent !== text) el.textContent = text;
    };

    const tick = (now: number) => {
      const ride = getRide();
      const station = readActiveStation();
      const quality = getQuality();

      write(0, `quality  ${level.level}${level.auto ? ` auto(${level.detected})` : ''}`);
      write(1, `progress ${ride.progress.toFixed(4)}`);
      write(2, `t        ${ride.t.toFixed(4)}`);
      write(3, `speed    ${ride.speed.toFixed(2)} u/s  (${(ride.speedFactor * 100).toFixed(0)}%)`);
      write(4, `station  ${station.activeIndex} (${STATION_IDS[station.activeIndex] ?? '-'})`);
      write(5, `vis      ${station.visibility.toFixed(3)}  local ${station.localProgress.toFixed(3)}`);
      // One interpolated string rather than a list built and joined per frame.
      const on = (flag: boolean): string => (flag ? '+' : '-');
      write(
        6,
        `effects  blm${on(quality.bloom)} trl${on(quality.trail)} dst${on(quality.dust)} ` +
          `hdl${on(quality.headlight)} kck${on(quality.cameraKick)} cur${on(quality.cursorEffects)}`,
      );
      write(
        7,
        `kick     fov ${cameraKick.fovOffset.toFixed(2)}°  shake ${Math.abs(cameraKick.shakeX).toFixed(3)}`,
      );
      write(8, `draws    ${renderStats.calls}`);
      write(9, `tris     ${renderStats.triangles.toLocaleString()}`);
      write(10, `fps      ${renderStats.fps.toFixed(0)}`);
      /*
       * Live GPU allocations. The leak script samples these across mode
       * switches: a teardown that forgets a geometry shows up here as a
       * count that climbs once per remount instead of returning to baseline.
       */
      write(11, `gpu      geo ${renderStats.geometries}  tex ${renderStats.textures}`);
      /*
       * Detection facts, read from the hook above. `caps.mode` is labelled
       * `detected` deliberately — see the note at the hook call site.
       */
      write(
        12,
        `detect   mode=${caps.mode} webgl${on(caps.webgl)} touch${on(caps.isTouch)} small${on(caps.isSmall)}`,
      );
      write(
        13,
        `detect   lowend${on(caps.lowEnd)} rMotion${on(caps.reducedMotion)} rData${on(caps.reducedData)}`,
      );
      write(
        14,
        `governor avg ${devGetAvgFps().toFixed(0)}  factor ${devGetPerfFactor().toFixed(2)}`,
      );
      write(
        15,
        `params   ${window.location.search || '(none)'}`.slice(0, 64),
      );

      /* --- accumulate FPS per level -------------------------------- */
      // Sampled every frame, but only *formatted* twice a second: the average is
      // the number a human reads, and re-rendering it 60 times a second would cost
      // more than the scene it is measuring.
      const current = renderStats.fps;
      if (current > 0) {
        const key = level.level;
        const entry = (samples.current[key] ??= { sum: 0, frames: 0 });
        entry.sum += current;
        entry.frames += 1;
      }

      if (now - lastFlush >= FPS_FLUSH_MS) {
        lastFlush = now;
        QUALITY_LEVELS.forEach((name, i) => {
          const entry = samples.current[name];
          write(
            LIVE_ROWS + i,
            !entry || entry.frames === 0
              ? `avg ${name.padEnd(6)} —`
              : `avg ${name.padEnd(6)} ${(entry.sum / entry.frames).toFixed(0)} fps (${entry.frames})`,
          );
        });
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    /*
     * Primitive deps only: `level` is a fresh object every render, so depending on
     * it would restart this loop on every state change anywhere above. The `caps`
     * fields are listed individually for the same reason — the object identity
     * changes whenever any of them does, but the loop only needs restarting when
     * a *displayed* value changes.
     */
  }, [
    open,
    level.level,
    level.auto,
    level.detected,
    caps.mode,
    caps.webgl,
    caps.isTouch,
    caps.isSmall,
    caps.lowEnd,
    caps.reducedMotion,
    caps.reducedData,
  ]);

  if (!open) return null;

  return (
    <div
      /*
       * `data-debug-overlay` is the stable handle the smoke script attaches to.
       * The script used to find the HUD by searching for a div whose text began
       * with "progress ", which made the overlay's line order load-bearing: adding
       * the quality line at the top silently broke every ride assertion while the
       * app itself worked perfectly. A test id removes that coupling.
       */
      data-debug-overlay=""
      className="pointer-events-none fixed bottom-4 left-4 z-100 rounded-lg border border-neon-teal/30 bg-ink-950/85 px-3 py-2 font-mono text-[0.65rem] leading-relaxed text-neon-teal backdrop-blur"
    >
      {Array.from({ length: TOTAL_ROWS }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            rowEls.current[i] = el;
          }}
        />
      ))}
      <div className="mt-1 text-mist-400">
        D close · 1-7 station · L/M/H level · 0 auto · C cycle
      </div>
    </div>
  );
}
