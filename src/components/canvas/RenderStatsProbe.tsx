import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getRide } from '../../hooks/useScrollProgress';
import { LANDMARK_ANCHORS } from '../../lib/world';
import { renderStats } from '../../lib/renderStats';

const _projected = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _toLandmark = new THREE.Vector3();

/**
 * Writes `renderer.info` into the shared stats object every frame and, in dev,
 * exposes the camera, scene, landmark anchors and a projection helper on
 * `window` so the Playwright verification script can measure draw calls and
 * check whether each landmark is actually in frame.
 *
 * Mounted once inside the Canvas. Dev-only: the whole probe is gated behind
 * `import.meta.env.DEV`, so it is stripped from production builds.
 */
export function RenderStatsProbe() {
  const camera = useRef<THREE.Camera | null>(null);
  const gl = useThree((s) => s.gl);

  /*
   * Take over `info.reset()` for the life of the probe.
   *
   * `renderer.info` clears itself at the start of every `renderer.render()` call,
   * which with no post-processing is once per frame and therefore fine. The HIGH
   * tier mounts an `EffectComposer`, and the composer calls `render()` once per
   * pass — scene, then each effect, each a fullscreen triangle. Under the default
   * `autoReset` the counter therefore read back *only the last pass*: the Phase 5
   * diagnostic reported `draws: 1` at HIGH versus ~50 at LOW, which looked exactly
   * like the post chain being free and the LOW tier being the expensive one.
   *
   * Resetting once per frame instead makes the totals cumulative across every
   * pass, so the number means what the overlay says it means at both tiers.
   */
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.reset();
      gl.info.autoReset = previous;
    };
  }, [gl]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__RENDER_STATS__ = renderStats;
    w.__LANDMARK_ANCHORS__ = LANDMARK_ANCHORS;
    w.__RIDE__ = getRide();
    w.__SCENE__ = null;
    // Projects a world position to normalised device coordinates. z in [-1, 1]
    // is in front of the near/far planes; x/y in [-1, 1] is inside the viewport.
    w.__PROJECT__ = (x: number, y: number, z: number): [number, number, number] => {
      const cam = camera.current;
      if (!cam) return [0, 0, 0];
      _projected.set(x, y, z).project(cam);
      return [_projected.x, _projected.y, _projected.z];
    };
    // Returns the camera position, forward vector, and the vector to a landmark,
    // so a test can tell whether the landmark is in front of the camera.
    w.__CAMERA_DEBUG__ = (lx: number, ly: number, lz: number) => {
      const cam = camera.current;
      if (!cam) return null;
      cam.getWorldDirection(_forward);
      _toLandmark.set(lx, ly, lz).sub(cam.position);
      const dist = _toLandmark.length();
      const inFront = _toLandmark.dot(_forward) > 0;
      return {
        pos: [cam.position.x, cam.position.y, cam.position.z],
        fwd: [_forward.x, _forward.y, _forward.z],
        toLandmark: [_toLandmark.x, _toLandmark.y, _toLandmark.z],
        dist,
        inFront,
      };
    };
  }, []);

  useFrame((state, delta) => {
    const info = state.gl.info;
    /*
     * Snapshot the totals accumulated since the previous reset, then clear for
     * this frame. Reading before resetting yields the *completed* previous frame
     * rather than a frame still in progress, which is what a HUD wants.
     */
    renderStats.calls = info.render.calls;
    renderStats.triangles = info.render.triangles;
    // Memory counters are cumulative, not per-frame: they answer "how much is
    // alive right now", which is what the leak check samples across remounts.
    renderStats.geometries = info.memory.geometries;
    renderStats.textures = info.memory.textures;
    info.reset();

    const fps = 1 / Math.max(delta, 1e-4);
    renderStats.fps = renderStats.fps * 0.92 + fps * 0.08;

    if (import.meta.env.DEV) {
      camera.current = state.camera;
      const w = window as unknown as Record<string, unknown>;
      w.__CAMERA__ = state.camera;
    }
  });

  return null;
}
