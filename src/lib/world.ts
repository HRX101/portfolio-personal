import * as THREE from 'three';
import {
  CORRIDOR_SAMPLES,
  LANDMARK,
  STATIONS,
  TERRAIN,
  TRACK_WIDTH,
} from '../config/scene';
import { fbm2, makeRandom } from './noise';
import { curve, roadCenterZAtX } from './track';

/* ========================================================================== */
/* Corridor distance field                                                    */
/* ========================================================================== */
/*
 * Terrain must sit just under the road everywhere, so the ribbon never clips
 * into a hill. The road is a 3D curve, so "distance to the road" is a real
 * nearest-point query, not a lateral offset.
 *
 * We bake `CORRIDOR_SAMPLES` points along the spline into a uniform grid. A
 * query then only inspects the 3x3 cells around the point, which is exact for
 * anything inside the corridor (the blend ends at 34u and a cell is 20u) and
 * cheap enough that 84k terrain vertices cost a few milliseconds.
 */

interface TrackSample {
  x: number;
  y: number;
  z: number;
}

const SAMPLES: TrackSample[] = (() => {
  const p = new THREE.Vector3();
  const out: TrackSample[] = [];
  for (let i = 0; i < CORRIDOR_SAMPLES; i++) {
    // Endpoints are included: the field only reads positions, which are exact
    // at u=0 and u=1 (the first/last control points). Skipping them left a
    // ~0.5u blind spot at each end of the track.
    const u = i / (CORRIDOR_SAMPLES - 1);
    curve.getPointAt(u, p);
    out.push({ x: p.x, y: p.y, z: p.z });
  }
  return out;
})();

const CELL = 20;
const GRID_MIN_X = TERRAIN.minX - CELL * 2;
const GRID_MIN_Z = -TERRAIN.farZ - CELL * 2;
const GRID_COLS = Math.ceil((TERRAIN.maxX - TERRAIN.minX + CELL * 4) / CELL);
const GRID_ROWS = Math.ceil((TERRAIN.farZ * 2 + CELL * 4) / CELL);

/**
 * Inverted index: every cell holds the indices of all samples that fall in it.
 *
 * Storing one nearest sample per cell (keyed on the cell centre) was not enough:
 * a query near a cell corner could miss the true nearest sample, which lived in
 * the same cell but was not the one stored. Indexing every sample keeps the
 * 3x3 search exact within its radius while staying O(samples-in-neighbourhood).
 */
const CELL_SAMPLES: Int32Array[] = (() => {
  const buckets: number[][] = Array.from({ length: GRID_COLS * GRID_ROWS }, () => []);
  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i]!;
    const col = Math.floor((s.x - GRID_MIN_X) / CELL);
    const row = Math.floor((s.z - GRID_MIN_Z) / CELL);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) continue;
    buckets[row * GRID_COLS + col]!.push(i);
  }
  return buckets.map((bucket) => new Int32Array(bucket));
})();

function cellIndex(x: number, z: number): number {
  const col = Math.floor((x - GRID_MIN_X) / CELL);
  const row = Math.floor((z - GRID_MIN_Z) / CELL);
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return -1;
  return row * GRID_COLS + col;
}

/**
 * Nearest baked road sample to a world position, or null outside the grid.
 * Only the 3x3 cell neighbourhood is searched, which is exact inside the
 * corridor and a safe approximation far from the road.
 */
function nearestSample(x: number, z: number): TrackSample | null {
  const here = cellIndex(x, z);
  if (here < 0) return null;

  const col = here % GRID_COLS;
  const row = Math.floor(here / GRID_COLS);

  let best: TrackSample | null = null;
  let bestDist = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) continue;
      const bucket = CELL_SAMPLES[r * GRID_COLS + c]!;
      for (let k = 0; k < bucket.length; k++) {
        const s = SAMPLES[bucket[k]!]!;
        const dx = s.x - x;
        const dz = s.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
    }
  }
  return best;
}

/** Distance in world units from a point to the baked road centre-line. */
export function distanceToTrack(x: number, z: number): number {
  const s = nearestSample(x, z);
  if (!s) return Infinity;
  const dx = s.x - x;
  const dz = s.z - z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Road surface height at a world position, from the nearest baked sample. */
export function roadHeightAt(x: number, z: number): number {
  return nearestSample(x, z)?.y ?? 0;
}

/* ========================================================================== */
/* Terrain height                                                              */
/* ========================================================================== */

/**
 * Terrain height at a world position.
 *
 * Inside the corridor the surface is pinned to the road (minus a small offset
 * so the ribbon never z-fights). Outside it blends into fBm hills, which are
 * themselves flattened toward the patch edge so the ground never ends in a
 * visible cliff against the sky.
 */
export function terrainHeightAt(x: number, z: number, octaves = 5): number {
  const dist = distanceToTrack(x, z);
  const follow =
    1 - THREE.MathUtils.smoothstep(dist, TERRAIN.corridorFlat, TERRAIN.corridorBlend);

  const broad = fbm2(x * 0.006, z * 0.006, octaves, 101) * TERRAIN.swellHeight;
  const detail = fbm2(x * 0.028, z * 0.028, octaves, 707) * TERRAIN.hillHeight * 0.35;
  const hills = -TERRAIN.hillHeight * 0.55 + broad + detail;

  // Fade to a flat plain at the patch boundary so the edge is never visible.
  const edge =
    1 -
    THREE.MathUtils.smoothstep(
      Math.max(Math.abs(z) / TERRAIN.farZ, (x - TERRAIN.minX) / (TERRAIN.maxX - TERRAIN.minX)),
      TERRAIN.edgeFadeStart,
      1,
    );

  const roadY = roadHeightAt(x, z);
  const ground = THREE.MathUtils.lerp(hills * edge, roadY - 0.45, follow);
  return ground;
}

/* ========================================================================== */
/* Landmark anchors                                                            */
/* ========================================================================== */

export interface LandmarkAnchor {
  /** World position of the landmark's base. */
  position: [number, number, number];
  /** Yaw so the landmark faces the road. */
  rotationY: number;
  /** Track-space `t` the landmark is docked at. */
  t: number;
  /** Lateral side of the road the landmark stands on: -1 left, 1 right. 0 = spans the road. */
  side: -1 | 0 | 1;
}

/**
 * Stations whose landmark spans the road rather than standing beside it. Their
 * anchor sits on the road centre-line and is yawed to the road tangent, so the
 * bike rides straight through the gate.
 */
const SPANS_ROAD = new Set(['hero', 'contact']);

/**
 * One anchor per station, in section order.
 *
 * Side landmarks stand beside the road at their station's `t`, offset laterally
 * and yawed to face the road so the bike sees their front as it passes. Gate
 * landmarks (hero, contact) sit on the road centre-line and are yawed to the
 * tangent so the bike rides through them. Phase 4 attaches HTML or billboards
 * to these.
 */
export const LANDMARK_ANCHORS: readonly LandmarkAnchor[] = (() => {
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return STATIONS.map((station, i) => {
    const t = Math.min(Math.max(station.t, 0.004), 0.996);
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tangent).normalize();
    right.crossVectors(tangent, up).normalize();

    if (SPANS_ROAD.has(station.id)) {
      // Gate: centred on the road, spanning it. Local +Z runs along the road.
      return {
        position: [p.x, p.y, p.z],
        rotationY: Math.atan2(tangent.x, tangent.z),
        t: station.t,
        side: 0,
      };
    }

    const side = LANDMARK.sides[i] ?? 1;
    const offset =
      LANDMARK.minOffset +
      ((i * 37) % 100) / 100 * (LANDMARK.maxOffset - LANDMARK.minOffset);

    const x = p.x + right.x * offset * side;
    const z = p.z + right.z * offset * side;
    const y = terrainHeightAt(x, z);

    // Face the road: yaw so the landmark's local +Z points back at the track.
    const toRoadX = p.x - x;
    const toRoadZ = p.z - z;
    const rotationY = Math.atan2(toRoadX, toRoadZ);

    return {
      position: [x, y, z],
      rotationY,
      t: station.t,
      side,
    };
  });
})();

/** Anchor for a station id, or undefined for an unknown id. */
export function landmarkAnchorFor(id: string): LandmarkAnchor | undefined {
  const index = STATIONS.findIndex((s) => s.id === id);
  return index >= 0 ? LANDMARK_ANCHORS[index] : undefined;
}

/** Track-space `t` of the nearest landmark to a given `t`. */
export function nearestLandmarkT(t: number): number {
  let best = LANDMARK_ANCHORS[0]?.t ?? 0;
  let bestDist = Infinity;
  for (const anchor of LANDMARK_ANCHORS) {
    const d = Math.abs(anchor.t - t);
    if (d < bestDist) {
      bestDist = d;
      best = anchor.t;
    }
  }
  return best;
}

/** True when a world position is inside the road corridor. */
export function isOnRoad(x: number, z: number): boolean {
  return distanceToTrack(x, z) < TERRAIN.corridorFlat;
}

/** True when a world position is within `radius` of any landmark base. */
export function isNearLandmark(x: number, z: number, radius: number): boolean {
  for (const anchor of LANDMARK_ANCHORS) {
    const dx = anchor.position[0] - x;
    const dz = anchor.position[2] - z;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

/** Road half-width, used to keep props off the asphalt. */
export const ROAD_HALF_WIDTH = TRACK_WIDTH / 2;

/* ========================================================================== */
/* Prop placement                                                              */
/* ========================================================================== */

export interface PropPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  /** Vertical squash, so trees can be tall and rocks flat. */
  yScale: number;
}

const _p = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export interface PlacementOptions {
  count: number;
  /** Closest a prop may sit to the road centre. */
  minTrackDistance: number;
  /** Furthest a prop may sit from the road centre. */
  maxOffset: number;
  /** Reject placements within this distance of any landmark base. */
  landmarkClearance: number;
  seed: number;
  scaleMin: number;
  scaleMax: number;
  yScaleMin: number;
  yScaleMax: number;
  /** Skip the first/last sliver of the track so gate approaches stay clear. */
  avoidEnds?: boolean;
}

/**
 * Scatters props beside the road.
 *
 * The curve is sampled uniformly and each sample is offset laterally by a
 * seeded random amount, so the layout is identical on every load. A placement
 * is rejected if it lands on the road, inside a landmark's footprint, or (for
 * gate approaches) too close to the start/finish.
 */
export function generatePlacements(options: PlacementOptions): PropPlacement[] {
  const {
    count,
    minTrackDistance,
    maxOffset,
    landmarkClearance,
    seed,
    scaleMin,
    scaleMax,
    yScaleMin,
    yScaleMax,
    avoidEnds = false,
  } = options;

  const rand = makeRandom(seed);
  const placements: PropPlacement[] = [];
  // Oversample: roughly a third of candidates are rejected, so generate three
  // times as many tries as props and stop once the quota is filled.
  const tries = count * 4;

  for (let i = 0; i < tries && placements.length < count; i++) {
    const t = rand();
    if (avoidEnds && (t < 0.012 || t > 0.988)) continue;

    curve.getPointAt(t, _p);
    curve.getTangentAt(t, _tangent).normalize();
    _right.crossVectors(_tangent, _up).normalize();

    const side = rand() < 0.5 ? -1 : 1;
    const offset = minTrackDistance + rand() * (maxOffset - minTrackDistance);
    const x = _p.x + _right.x * offset * side;
    const z = _p.z + _right.z * offset * side;

    if (distanceToTrack(x, z) < minTrackDistance) continue;
    if (isNearLandmark(x, z, landmarkClearance)) continue;

    placements.push({
      x,
      y: terrainHeightAt(x, z),
      z,
      scale: scaleMin + rand() * (scaleMax - scaleMin),
      rotY: rand() * Math.PI * 2,
      yScale: yScaleMin + rand() * (yScaleMax - yScaleMin),
    });
  }

  return placements;
}

/**
 * Lamp posts line the road at a fixed spacing, alternating shoulders.
 *
 * Unlike scatter props these are deterministic in x so the spacing reads as
 * deliberate; only the seeded jitter varies.
 */
export function generateLampPlacements(
  spacing: number,
  sideOffset: number,
  seed: number,
): PropPlacement[] {
  const rand = makeRandom(seed);
  const placements: PropPlacement[] = [];

  for (let x = TERRAIN.minX + 8; x < TERRAIN.maxX - 8; x += spacing) {
    const side = placements.length % 2 === 0 ? 1 : -1;
    const z = roadCenterZAtX(x) + side * sideOffset;
    const jitterX = (rand() - 0.5) * 2.5;
    const px = x + jitterX;
    const pz = z + (rand() - 0.5) * 2.5;

    if (distanceToTrack(px, pz) < ROAD_HALF_WIDTH + 1.2) continue;
    if (isNearLandmark(px, pz, 12)) continue;

    placements.push({
      x: px,
      y: terrainHeightAt(px, pz),
      z: pz,
      scale: 0.9 + rand() * 0.25,
      rotY: rand() * Math.PI * 2,
      yScale: 1,
    });
  }

  return placements;
}
