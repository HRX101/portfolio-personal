import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './canvas/Scene';
import { DebugOverlay } from './ui/DebugOverlay';
import { Loader } from './ui/Loader';
import { MicroInteractions } from './ui/MicroInteractions';
import { MiniMap } from './ui/MiniMap';
import { Nav } from './ui/Nav';
import { Overlay } from './ui/Overlay';
import { PerfPrompt } from './ui/PerfPrompt';
import { ProgressBar } from './ui/ProgressBar';
import { PerfGovernor } from './canvas/PerfGovernor';
import type { QualitySettings } from '../config/quality';
import type { ExperienceMode } from '../hooks/useCapabilities';
import { MOBILE_DPR_CAP } from '../lib/capabilities';

/**
 * ============================================================================
 * THE 3D TREE
 * ============================================================================
 *
 * Everything that reaches three.js lives here and nowhere else, which is what
 * lets `App` gate it behind a dynamic import. The previous layout kept
 * `<Canvas>`, `<Scene>` and `three` as static imports of `App`, so the bundler
 * hoisted them into the entry chunk and emitted `modulepreload` hints for them in
 * `index.html` — meaning a 2D-mode visitor, who by definition never renders a
 * frame, still paid ~290 kB gzipped for the renderer and the scene graph.
 *
 * Being a separate module is not the same as being lazily loaded, so this file
 * carries no side effects and imports nothing eagerly at the app level: `App`
 * pulls it in through `lazy(() => import('./Experience3D'))`, and the import is
 * only reached when the resolved mode is '3D'.
 *
 * The 2D fallback has the identical information architecture — same station
 * order, same content source, same nav — so a mode switch is a swap of the
 * document body rather than a different site.
 */
interface Experience3DProps {
  /** Resolved quality settings; `App` owns detection so both modes agree. */
  quality: QualitySettings;
  /** Rendered mode, so the governor can idle itself while 2D is showing. */
  mode: ExperienceMode;
  /** True when a real WebGL context exists to render into. */
  webgl: boolean;
  /** Narrow viewport: caps the canvas DPR (a phone panel needs fewer pixels). */
  isSmall: boolean;
  /**
   * Switch to the 2D fallback because the context went away and did not come
   * back. Distinct from `onSwitchTo2D` because it must not become a stored
   * preference: a lost GPU driver is not a statement about what someone wants.
   */
  onContextLost: () => void;
  /** Switch to the 2D fallback at the reader's request. */
  onSwitchTo2D: () => void;
}

export default function Experience3D({
  quality,
  mode,
  webgl,
  isSmall,
  onContextLost,
  onSwitchTo2D,
}: Experience3DProps) {
  /*
   * DPR is capped on narrow viewports even when the tier allows more. A phone
   * held at arm's length cannot resolve the difference between 1.25 and 1.75,
   * but the GPU pays for every one of those pixels — on a 3x panel that is the
   * difference between rendering ~2M and ~5M pixels per frame. The floor is
   * untouched: blurriness is worse than cost.
   */
  const dprMax = isSmall ? Math.min(quality.render.dpr[1], MOBILE_DPR_CAP) : quality.render.dpr[1];

  return (
    <>
      {/*
        Decorative layer: `pointer-events-none` so the scroll driver beneath it
        keeps every wheel and touch event, and `aria-hidden` so the canvas is
        never announced as an image or a region by a screen reader.
      */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <Canvas
          dpr={[quality.render.dpr[0], dprMax]}
          shadows={quality.render.shadows ? 'basic' : false}
          gl={{
            antialias: quality.render.antialias,
            toneMapping: THREE.ACESFilmicToneMapping,
            powerPreference: 'high-performance',
          }}
          camera={{ fov: 48, near: 0.1, far: 1200, position: [-7, 10, 36] }}
          /*
           * On-demand rendering: R3F draws a frame only when something calls
           * `invalidate()`, and its loop cancels itself when idle. This is a
           * contract, not a default — every motion source must pump:
           * `RideInvalidator` (scroll), the ride driver (settling tail),
           * `Loader` (intro glide). A `useFrame` that never gets invalidated
           * never runs, so a new continuous effect needs a pump, not just a
           * subscription. Parked means silence: zero GPU while the reader reads.
           */
          frameloop="demand"
        >
          <Suspense fallback={null}>
            <Scene quality={quality} />
          </Suspense>
          <PerfGovernor mode={mode} webgl={webgl} onContextLost={onContextLost} />
        </Canvas>
      </div>

      <Nav canSwitchTo2D={true} onSwitchTo2D={onSwitchTo2D} mode={mode} />

      <main id="main">
        <Overlay />
      </main>

      <ProgressBar />
      <MiniMap />

      {quality.cursorEffects && <MicroInteractions />}

      <Loader quality={quality} />

      <PerfPrompt mode={mode} webgl={webgl} onSwitchTo2D={onSwitchTo2D} />

      {import.meta.env.DEV && <DebugOverlay />}
    </>
  );
}