/**
 * ============================================================================
 * CAMERA KICK CHANNEL
 * ============================================================================
 *
 * The shared hand-off between the kick's producer and the camera.
 *
 * Only one thing in this codebase is allowed to write to `camera`: the chase rig
 * in `CameraRig.tsx`. If the velocity kick in `BikeEffects.tsx` mutated
 * `camera.fov` itself, the two would fight — the rig damps FOV back toward its
 * authored value every frame, so the kick would be cancelled before it was ever
 * seen, and at best the two would alternate into a visible stutter.
 *
 * So the kick writes its contributions here and the rig applies them, after the
 * rig has done its own work. The write happens one frame after the speed that
 * produced it was measured, which at any plausible frame rate is 8ms of latency
 * on a 4-degree FOV change: not something anyone can perceive, and vastly
 * cheaper than two owners of one transform.
 *
 * Plain mutable numbers rather than a ref or a store: this is frame-rate
 * continuous data, so it has no business triggering a React render.
 */
export const cameraKick = {
  /** Degrees to add to the rig's resolved FOV. Positive widens the shot. */
  fovOffset: 0,
  /** World-space displacement added to the camera after the rig positions it. */
  shakeX: 0,
  shakeY: 0,
  /** Radians of roll added after the rig aims the camera. */
  shakeRoll: 0,
};

/** Clears every channel. Called by the debug overlay and on unmount. */
export function resetCameraKick(): void {
  cameraKick.fovOffset = 0;
  cameraKick.shakeX = 0;
  cameraKick.shakeY = 0;
  cameraKick.shakeRoll = 0;
}
