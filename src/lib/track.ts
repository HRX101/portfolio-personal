import * as THREE from 'three';
import { TRACK_POINTS } from '../config/scene';
import { clamp } from './easing';
import {
  SEGMENT_COUNT,
  STATION_SCROLL,
  STATION_TRACK_T,
  applyStationMagnet,
  trackTAtProgress,
  progressAtTrackT,
} from './rideMath';

/*
 * The pure progress math lives in `./rideMath` and is re-exported here so 3D
 * code keeps a single import. `lib/track` is the module that may touch `three`;
 * `lib/rideMath` is the module that must not. Anything that loads in 2D mode
 * imports from `./rideMath` directly — importing this file would drag the
 * spline, and with it the whole renderer, into the 2D bundle.
 */
export {
  SEGMENT_COUNT,
  STATION_SCROLL,
  STATION_TRACK_T,
  applyStationMagnet,
  trackTAtProgress,
  progressAtTrackT,
};

/**
 * The single shared ride spline.
 *
 * `centripetal` parameterisation avoids the cusps and overshoot you get from
 * uniform Catmull-Rom when control points are unevenly spaced, which matters
 * here because the hills are tightly spaced near x=150 and x=440.
 */
export const curve = new THREE.CatmullRomCurve3(
  TRACK_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  'centripetal',
  0.5,
);

export const TRACK_LENGTH = curve.getLength();

/* ========================================================================== */
/* Scroll progress  <->  track position `t`                                   */
/* ========================================================================== */
/*
 * The mapping itself lives in `./rideMath` (see the re-export at the top):
 * equal scroll spans per gap, eased dwell at each station, magnetic settle.
 * What follows is the 3D side — sampling the spline at the `t` values the
 * mapping produces.
 */

/* ========================================================================== */
/* Track sampling                                                              */
/* ========================================================================== */

const UP = new THREE.Vector3(0, 1, 0);

/** Scratch objects: sampling runs every frame, so it must not allocate. */
const _tangent = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _upright = new THREE.Quaternion();
const _bank = new THREE.Quaternion();

export interface TrackPose {
  /** World position of the road centre at `t`. */
  position: THREE.Vector3;
  /** Unit direction of travel. */
  tangent: THREE.Vector3;
  /** Upright frame, banked into the corner. */
  quaternion: THREE.Quaternion;
  /** Signed curvature, positive = turning left. */
  curvature: number;
  /** Unit right-hand vector of the road frame. */
  right: THREE.Vector3;
}

export function createTrackPose(): TrackPose {
  return {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    curvature: 0,
    right: new THREE.Vector3(),
  };
}

/**
 * Pose of the road at `t`, including an optional bank.
 *
 * `t` is clamped away from the exact ends: `getPointAt` extrapolates with a
 * near-zero tangent there, which yields a degenerate frame.
 */
export function sampleTrack(t: number, out: TrackPose, maxBank = 0.28): TrackPose {
  const tt = clamp(t, 0.001, 0.999);
  curve.getPointAt(tt, out.position);
  curve.getTangentAt(tt, out.tangent).normalize();

  // Signed horizontal curvature from two nearby tangents. Differencing the
  // headings (rather than the raw vectors) keeps this stable where the road
  // is steep and the tangent's horizontal component is small.
  const before = curve.getTangentAt(Math.max(0.001, tt - 0.002), _tangent);
  let dHeading = Math.atan2(out.tangent.z, out.tangent.x) - Math.atan2(before.z, before.x);
  while (dHeading > Math.PI) dHeading -= Math.PI * 2;
  while (dHeading < -Math.PI) dHeading += Math.PI * 2;
  out.curvature = dHeading / 0.002;

  out.right.crossVectors(out.tangent, UP);
  if (out.right.lengthSq() < 1e-8) out.right.set(1, 0, 0);
  out.right.normalize();
  _up.crossVectors(out.right, out.tangent).normalize();

  _upright.setFromUnitVectors(UP, _up);
  _bank.setFromAxisAngle(
    _forward.copy(out.tangent),
    clamp(out.curvature * 0.012, -maxBank, maxBank),
  );
  out.quaternion.copy(_bank).multiply(_upright);

  return out;
}

/** Convenience: sample into a fresh object. Use only outside the render loop. */
export function trackPoseAt(t: number, maxBank?: number): TrackPose {
  return sampleTrack(t, createTrackPose(), maxBank);
}

/* ========================================================================== */
/* Road elevation profile (1D lookup)                                          */
/* ========================================================================== */
/*
 * TRACK_POINTS is strictly increasing in x, so a single sample per x describes
 * the road's height everywhere. Terrain uses this to sit just under the road
 * instead of cutting through the hills.
 */

const PROFILE_SAMPLES = 512;
const profileX: number[] = [];
const profileY: number[] = [];
const profileZ: number[] = [];

{
  const p = new THREE.Vector3();
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const u = i / (PROFILE_SAMPLES - 1);
    curve.getPointAt(u, p);
    profileX.push(p.x);
    profileY.push(p.y);
    profileZ.push(p.z);
  }
}

const PROFILE_MIN_X = profileX[0] ?? 0;
const PROFILE_MAX_X = profileX[profileX.length - 1] ?? 1;

function sampleProfile(values: number[], x: number): number {
  const clampedX = clamp(x, PROFILE_MIN_X, PROFILE_MAX_X);
  const span = PROFILE_MAX_X - PROFILE_MIN_X || 1;
  const pos = ((clampedX - PROFILE_MIN_X) / span) * (values.length - 1);
  const i = Math.min(Math.floor(pos), values.length - 2);
  const a = values[i] ?? 0;
  const b = values[i + 1] ?? a;
  return a + (b - a) * (pos - i);
}

/** Road surface height at a world x. Clamps outside the track's x range. */
export const roadHeightAtX = (x: number): number => sampleProfile(profileY, x);

/** Road centre-line z at a world x. */
export const roadCenterZAtX = (x: number): number => sampleProfile(profileZ, x);
