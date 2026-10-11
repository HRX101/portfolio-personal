import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp } from '../../lib/easing';
import { createTrackPose, sampleTrack } from '../../lib/track';
import { getRide } from '../../hooks/useScrollProgress';
import { createMotorcycle, disposeMotorcycle, updateMotorcycle } from '../../lib/motorcycle';
import { BikeEffects } from './BikeEffects';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Lean is capped here — the spec asks for ~20 degrees. */
const MAX_LEAN = THREE.MathUtils.degToRad(20);
/**
 * Handlebar response to road curvature. The root lean already banks the bike
 * (same curvature signal, damped); the bars only need a hint of counter-turn
 * on top, so the gain stays small and the clamp keeps full lock plausible.
 */
const STEER_GAIN = 0.04;
const MAX_STEER = THREE.MathUtils.degToRad(17);

/* ========================================================================== */
/* Frame state (module scope: one bike, no re-renders)                        */
/* ========================================================================== */

const pose = createTrackPose();
const lean = { current: 0 };
const bob = { phase: 0 };

/* Scratch objects — the frame loop below must not allocate. */
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _roll = new THREE.Quaternion();

/* ========================================================================== */
/* Root                                                                       */
/* ========================================================================== */

/**
 * Positions and orients the bike from scroll progress.
 *
 * Orientation: the track tangent gives forward. A `lookAt`-style basis is built
 * from forward and world up, then a roll is applied around the forward axis for
 * lean. Building the quaternion from an explicit basis (rather than
 * `Object3D.lookAt`) avoids three's default -Z forward convention fighting the
 * model's +Z convention.
 *
 * The model is the procedural Speed T4 (`lib/motorcycle`), built once per
 * mount. Wheel spin, steering and lean advance inside `updateMotorcycle` from
 * the same ride state that drives the camera, so rubber, bars and effects stay
 * in phase.
 */
export function Bike() {
  const group = useRef<THREE.Group>(null);
  const moto = useMemo(() => createMotorcycle(), []);

  /*
   * Frees GPU resources when the 3D tree unmounts (2D switch). StrictMode's
   * dev-time remount reuses this memo and transparently re-uploads, so the
   * cleanup is safe there too. `dispose={null}` on the primitive keeps R3F's
   * own auto-disposal from racing this explicit teardown.
   */
  useEffect(() => () => disposeMotorcycle(moto), [moto]);

  useFrame((_, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const ride = getRide();
    const dt = Math.min(rawDelta, 1 / 20);

    // `t` is clamped inside sampleTrack: at the exact endpoints the spline
    // tangent is degenerate and the frame goes NaN.
    sampleTrack(ride.t, pose);

    g.position.copy(pose.position);

    // Suspension bob: small vertical oscillation whose amplitude scales with
    // speed, and which stops dead when parked. `speedFactor` is the shared
    // normalised speed, so this bob and the Phase 5 effects stay in phase.
    bob.phase += dt * (6 + ride.speedFactor * 10);
    g.position.y += Math.sin(bob.phase) * 0.045 * ride.speedFactor;

    // Lean into the corner, smoothed so it eases in rather than snapping.
    const targetLean = clamp(-pose.curvature * 0.09, -MAX_LEAN, MAX_LEAN);
    lean.current = THREE.MathUtils.damp(lean.current, targetLean, 5, dt);

    // Basis: forward = tangent, up = world up projected perpendicular to it.
    // This keeps the bike upright relative to world gravity, not the road bank.
    // Building an explicit basis (rather than Object3D.lookAt) avoids three's
    // -Z forward convention fighting the model's +Z convention.
    _forward.copy(pose.tangent).normalize();
    _right.crossVectors(UP, _forward);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_forward, _right).normalize();
    _basis.makeBasis(_right, _up, _forward);
    g.quaternion.setFromRotationMatrix(_basis);

    // Roll around the bike's own forward axis.
    _roll.setFromAxisAngle(FORWARD, lean.current);
    g.quaternion.multiply(_roll);

    // Wheels, bars and steering lean, driven by the same ride state.
    // `updateMotorcycle` integrates spin, so reversing the scroll unwinds the
    // wheels instead of spinning them back.
    const steerAngle = clamp(-pose.curvature * STEER_GAIN, -MAX_STEER, MAX_STEER);
    updateMotorcycle(moto, ride.speed, steerAngle, dt);
  });

  return (
    <group ref={group} name="bike-root">
      <primitive object={moto} dispose={null} />
      {/*
        Phase 5 effects ride along with the bike, so they inherit its transform
        rather than re-deriving the road frame every frame.
      */}
      <BikeEffects />
    </group>
  );
}

/* ========================================================================== */
/* Model                                                                     */
/* ========================================================================== */

/*
 * The bike is the procedural Speed T4 from `lib/motorcycle` — built once per
 * mount in `Bike` above via `createMotorcycle`, animated via
 * `updateMotorcycle`, and torn down via `disposeMotorcycle`. There is no
 * remote model to probe, suspend on, or fall back from: the previous GLB path
 * (HEAD probe, error boundary, `__BIKE_MODEL_OVERRIDE__` harness) was removed
 * with the bicycle it served, along with the rider silhouette and torus
 * wheels. The e2e fallback script now asserts the motorcycle directly.
 */
