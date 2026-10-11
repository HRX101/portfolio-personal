import * as THREE from 'three';
import { TRACK_POINTS } from '../config/scene';
import { curve } from './track';

/**
 * Top-down projection of the ride for the mini-map.
 *
 * The map is built from the shared spline rather than from `TRACK_POINTS`
 * directly. The control points are only 15 anchors; the road the rider
 * actually follows is the Catmull-Rom through them, and a straight polyline
 * through the anchors cuts the corners visibly at mini-map scale. Sampling the
 * spline keeps the drawn path and the station dots on exactly the same
 * geometry the bike rides, which is the whole point of a progress map.
 *
 * The projection is a uniform scale (never stretched) with the x range mapped
 * across the full width, so the squiggle's shape is honest and the completed
 * portion can be revealed with a stroke-dash fraction of the total length.
 */

export const MINIMAP_WIDTH = 160;
export const MINIMAP_HEIGHT = 100;

export interface MapPoint {
  x: number;
  y: number;
}

export interface MinimapProjection {
  /** SVG path data for the full track, in map units. */
  readonly path: string;
  /** Uniform scale from world units to map units. */
  readonly scale: number;
  /** Offset applied after scaling, to centre the track in the map box. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Project a world x/z pair into map space. */
  project(x: number, z: number): MapPoint;
}

const SAMPLES = 190;

const bounds = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, , z] of TRACK_POINTS) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
})();

/**
 * World z maps to screen y. The rider travels toward +x, so +x is drawn to the
 * right and +z is drawn downward — the same handedness as the xz plane seen
 * from above with the camera's up vector along -z, which keeps the map's left
 * and right agreeing with the on-screen left and right while riding.
 */
const SCALE =
  Math.min(
    MINIMAP_WIDTH / Math.max(bounds.maxX - bounds.minX, 1e-6),
    MINIMAP_HEIGHT / Math.max(bounds.maxZ - bounds.minZ, 1e-6),
  ) || 1;

const OFFSET_X = (MINIMAP_WIDTH - (bounds.maxX - bounds.minX) * SCALE) / 2 - bounds.minX * SCALE;
const OFFSET_Y = (MINIMAP_HEIGHT - (bounds.maxZ - bounds.minZ) * SCALE) / 2 + bounds.minZ * SCALE;

/** World x/z -> map x/y, in map units. */
function toMap(x: number, z: number): MapPoint {
  return { x: x * SCALE + OFFSET_X, y: -z * SCALE + OFFSET_Y };
}

const PATH = (() => {
  const p = new THREE.Vector3();
  let d = '';
  for (let i = 0; i < SAMPLES; i++) {
    curve.getPointAt(i / (SAMPLES - 1), p);
    const { x, y } = toMap(p.x, p.z);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
})();

export const MINIMAP_PROJECTION: MinimapProjection = {
  path: PATH,
  scale: SCALE,
  offsetX: OFFSET_X,
  offsetY: OFFSET_Y,
  project: toMap,
};

const _scratch = new THREE.Vector3();

/** Map-space position of the bike at track position `t`. */
export function minimapPointAtT(t: number, out: MapPoint = { x: 0, y: 0 }): MapPoint {
  const p = curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), _scratch);
  out.x = p.x * SCALE + OFFSET_X;
  out.y = -p.z * SCALE + OFFSET_Y;
  return out;
}

/** Station marker in map space, ready to be turned into an SVG circle. */
export function minimapStationPoint(t: number): MapPoint {
  return minimapPointAtT(t);
}
