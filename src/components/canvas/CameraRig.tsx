import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_BLEND, CAMERA_RIGS, type CameraRig as CameraRigConfig } from '../../config/scene';
import { INTRO } from '../../config/effects';
import { cameraKick } from '../../lib/cameraKick';
import { clamp } from '../../lib/easing';
import { createTrackPose, sampleTrack } from '../../lib/track';
import { finishIntro, intro, introEase, isIntroActive, tickIntro } from '../../lib/intro';
import { getRide } from '../../hooks/useScrollProgress';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useCapabilities } from '../../hooks/useCapabilities';

const pose = createTrackPose();

/** The opening wide shot, as a vector so the frame loop never builds one. */
const INTRO_START_OFFSET = new THREE.Vector3(
  INTRO.startOffset.x,
  INTRO.startOffset.y,
  INTRO.startOffset.z,
);

/** Scratch objects — the rig resolves every frame and must not allocate. */
const UP = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _heading = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _aimOffset = new THREE.Vector3();
const _aim = new THREE.Vector3();

/** Persistent aim point, damped between frames. */
const lookTarget = new THREE.Vector3();

const FALLBACK_RIG: CameraRigConfig = {
  from: 0,
  to: 1,
  offset: [0, 5, -15],
  lookAhead: [0, 1.5, 4],
  fov: 48,
  positionLambda: 4,
  targetLambda: 4,
};

/** Blended rig parameters for the current frame. */
const blended = {
  offset: new THREE.Vector3(),
  lookAhead: new THREE.Vector3(),
  fov: 48,
  positionLambda: 4,
  targetLambda: 4,
};

function lerpTuple(
  a: readonly [number, number, number],
  b: readonly [number, number, number] | undefined,
  k: number,
  target: THREE.Vector3,
): void {
  target.set(
    THREE.MathUtils.lerp(a[0], b ? b[0] : a[0], k),
    THREE.MathUtils.lerp(a[1], b ? b[1] : a[1], k),
    THREE.MathUtils.lerp(a[2], b ? b[2] : a[2], k),
  );
}

/**
 * Resolves the active camera rig for a track position, cross-fading into the
 * next rig over the last `CAMERA_BLEND` fraction of the current range.
 *
 * Blending the rig *parameters* rather than two finished camera transforms is
 * what keeps the motion continuous: there is no frame in which the camera jumps,
 * because the offset, aim, fov and damping rates are all interpolated together.
 */
function resolveRig(t: number): void {
  let index = CAMERA_RIGS.findIndex((rig) => t >= rig.from && t < rig.to);
  if (index === -1) index = t < 0 ? 0 : CAMERA_RIGS.length - 1;

  const current = CAMERA_RIGS[index] ?? FALLBACK_RIG;
  const next = CAMERA_RIGS[index + 1];
  const span = Math.max(current.to - current.from, 1e-5);
  const local = clamp((t - current.from) / span);

  let k = 0;
  if (next && index < CAMERA_RIGS.length - 1) {
    k = clamp((local - (1 - CAMERA_BLEND)) / CAMERA_BLEND);
    k = k * k * (3 - 2 * k); // smoothstep so the handover eases in and out
  }

  lerpTuple(current.offset, next?.offset, k, blended.offset);
  lerpTuple(current.lookAhead, next?.lookAhead, k, blended.lookAhead);
  blended.fov = THREE.MathUtils.lerp(current.fov, next?.fov ?? current.fov, k);
  blended.positionLambda = THREE.MathUtils.lerp(
    current.positionLambda,
    next?.positionLambda ?? current.positionLambda,
    k,
  );
  blended.targetLambda = THREE.MathUtils.lerp(
    current.targetLambda,
    next?.targetLambda ?? current.targetLambda,
    k,
  );
}

/**
 * Portrait framing, written into scratch — never allocated.
 *
 * In portrait the frame is narrow but tall, so the chase offset is pulled up
 * and back and the FOV widened, keeping the bike in shot without changing what
 * the rig resolved. When the adjustment does not apply, the scratch vectors
 * are simply copies of the blended rig: every downstream read goes through the
 * same two objects either way, so there is no branch in the frame loop and no
 * allocation on any path.
 *
 * `isPortrait` comes from the canvas size in the frame state, not from a resize
 * listener in React state. The canvas already knows its own dimensions every
 * frame; duplicating that knowledge in a `useState` would re-render the rig's
 * owner on every orientation change for a value only the frame loop reads.
 */
const _portraitOffset = new THREE.Vector3();
/** Widening applied to the FOV in small portrait viewports, in degrees. */
const PORTRAIT_FOV_WIDEN = 8;
const _portraitAim = new THREE.Vector3();
let portraitFovDelta = 0;

function applyPortraitFrame(isPortrait: boolean, isSmall: boolean): void {
  _portraitOffset.copy(blended.offset);
  _portraitAim.copy(blended.lookAhead);
  portraitFovDelta = 0;
  if (!isSmall || !isPortrait) return;

  _portraitOffset.y *= 1.15;
  _portraitOffset.z *= 1.2;
  _portraitAim.y *= 1.1;
  portraitFovDelta = PORTRAIT_FOV_WIDEN;
}

/**
 * Third-person chase camera.
 *
 * Each frame: sample the road, resolve the rig, convert the rig's local offset
 * to world space through the bike's heading, then damp position and aim
 * independently. Damping the aim slightly slower than the position gives the
 * shot a touch of lag that reads as a camera operator following rather than a
 * rigid mount.
 */
export function CameraRig() {
  const initialised = useRef(false);
  const reducedMotion = useReducedMotion();
  const { isSmall } = useCapabilities();

  useFrame((state, rawDelta) => {
    // Taking the camera from the frame state is the idiomatic R3F pattern and
    // keeps the mutation inside the loop rather than in render.
    const camera = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(rawDelta, 1 / 20);
    const ride = getRide();
    sampleTrack(ride.t, pose);
    resolveRig(ride.t);

    // Portrait framing from the canvas's own size — see `applyPortraitFrame`.
    applyPortraitFrame(state.size.height > state.size.width, isSmall);
    const adjustedFov = blended.fov + portraitFovDelta;

    // Advances the glide from inside the render loop rather than a timer, so the
    // camera's blend and the loader's "N seconds left" label cannot disagree, and
    // so a backgrounded tab does not fast-forward the intro on return.
    tickIntro(dt);
    const introBlend = isIntroActive() ? 1 - introEase(intro.progress) : 0;

    // A 2.5-second flight around the scene is exactly the kind of large, sustained
    // camera motion the preference exists to suppress, so it is dropped rather than
    // shortened. The loader applies the same rule to the DOM half, which keeps the
    // sequence intact for everyone else and removes it for everyone who asked.
    if (reducedMotion && isIntroActive()) finishIntro();

    // Heading-only rotation from the tangent. The road's bank is deliberately
    // excluded: including it would compound with the bike's own lean and tilt
    // the horizon twice as far.
    _right.crossVectors(UP, pose.tangent);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(pose.tangent, _right).normalize();
    _basis.makeBasis(_right, _up, pose.tangent);
    _heading.setFromRotationMatrix(_basis);

    _offset.copy(_portraitOffset).applyQuaternion(_heading);

    /*
     * The intro's wide opening shot, mixed into the rig's own offset.
     *
     * `INTRO.startOffset` is applied in world space rather than through the
     * heading quaternion, which is deliberate: the opening shot should read as
     * "somewhere above and behind the whole ride", not as "the chase rig, but
     * bigger". Rotating it with the bike would also make the start position swing
     * as the bike settles into its opening heading.
     *
     * At `introBlend` 1 the camera is fully at the wide shot and contributes
     * nothing to the rig's damping, so the glide below is an explicit lerp rather
     * than a third writer racing the rig for the camera's position.
     */
    if (introBlend > 0) {
      _offset.lerp(INTRO_START_OFFSET, introBlend);
    }

    _desired.copy(pose.position).add(_offset);

    _aimOffset.copy(_portraitAim).applyQuaternion(_heading);
    _aim.copy(pose.position).add(_aimOffset);

    if (reducedMotion) {
      // Static framing: no sweeps, no lag, just the resolved shot.
      camera.position.copy(_desired);
      lookTarget.copy(_aim);
    } else if (introBlend > 0) {
      /*
       * The glide bypasses the rig's damping on purpose.
       *
       * `_desired` is already a smootherstep path over `INTRO.glideMs`, so
       * damping it again would mean the camera chasing a moving target: the
       * arrival would overshoot into the rig and then settle back, which reads
       * as the camera catching itself rather than arriving. Copying puts the
       * timing exactly where the config says it is, and hands the rig back its
       * own damping on the final frame with the camera already at rest.
       */
      camera.position.copy(_desired);
      lookTarget.copy(_aim);
    } else if (!initialised.current) {
      // First frame snaps into place, otherwise the camera flies in from origin.
      camera.position.copy(_desired);
      lookTarget.copy(_aim);
      initialised.current = true;
    } else {
      camera.position.set(
        THREE.MathUtils.damp(camera.position.x, _desired.x, blended.positionLambda, dt),
        THREE.MathUtils.damp(camera.position.y, _desired.y, blended.positionLambda, dt),
        THREE.MathUtils.damp(camera.position.z, _desired.z, blended.positionLambda, dt),
      );
      lookTarget.set(
        THREE.MathUtils.damp(lookTarget.x, _aim.x, blended.targetLambda, dt),
        THREE.MathUtils.damp(lookTarget.y, _aim.y, blended.targetLambda, dt),
        THREE.MathUtils.damp(lookTarget.z, _aim.z, blended.targetLambda, dt),
      );
    }

    camera.lookAt(lookTarget);

    /* --- Phase 5 velocity kick ------------------------------------ */
    /*
     * The kick component in BikeEffects.tsx contributes to `cameraKick` rather
     * than touching the camera, so the rig stays its only writer. Order matters:
     * the rig must aim the camera first, then the shake displaces it and the roll
     * is applied on top. Anything else and the shake gets aimed away.
     *
     * Gated on `reducedMotion` here, at the point of use, rather than relying on
     * the writer staying quiet. That is a deliberate belt-and-braces: the channel
     * holds whatever the last moving frame wrote, so a reader who enables the
     * preference mid-session would otherwise keep being shaken until the writer
     * happened to stop. An accessibility guarantee belongs to the thing that
     * actually moves the camera, not only to the thing that told it to.
     */
    if (reducedMotion) {
      // Snap the FOV back to the rig's own value so a kick applied before the
      // preference was enabled eases out instead of sticking at the wider framing.
      if (Math.abs(camera.fov - adjustedFov) > 0.01) {
        camera.fov = adjustedFov;
        camera.updateProjectionMatrix();
      }
      return;
    }

    if (cameraKick.shakeX !== 0 || cameraKick.shakeY !== 0) {
      camera.position.x += cameraKick.shakeX;
      camera.position.y += cameraKick.shakeY;
    }
    if (cameraKick.shakeRoll !== 0) camera.rotateZ(cameraKick.shakeRoll);

    // The kick widens the shot on top of the rig's blended FOV. Damped toward the
    // sum so an abrupt change in speed eases in, and clamped against the original
    // pass so the two writes cannot compound.
    const targetFov = adjustedFov + cameraKick.fovOffset;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
