import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, EMISSIVE, PROPS, WORLD_SEED } from '../../../config/scene';
import type { WorldComplexity } from '../../../config/quality';
import { liveWorldTint } from '../../../lib/atmosphere';
import {
  generateLampPlacements,
  generatePlacements,
  type PropPlacement,
} from '../../../lib/world';

/* ========================================================================== */
/* Shared geometry                                                            */
/* ========================================================================== */

/** Two stacked cones read as a low-poly pine at a fraction of the tris. */
function buildTreeGeometry(): THREE.BufferGeometry {
  const lower = new THREE.ConeGeometry(2.1, 4.2, 6, 1);
  lower.translate(0, 2.1, 0);
  const upper = new THREE.ConeGeometry(1.45, 3.4, 6, 1);
  upper.translate(0, 4.6, 0);
  const merged = mergeGeometries([lower, upper], false);
  lower.dispose();
  upper.dispose();
  return merged ?? lower;
}

function buildLampPoleGeometry(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.1, 0.15, 5.4, 6, 1);
  pole.translate(0, 2.7, 0);
  const arm = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5, 1);
  arm.rotateZ(Math.PI / 2);
  arm.translate(0.5, 5.3, 0);
  const merged = mergeGeometries([pole, arm], false);
  pole.dispose();
  arm.dispose();
  return merged ?? pole;
}

function buildLampHeadGeometry(): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(0.34, 8, 6);
  head.translate(0.95, 5.22, 0);
  return head;
}

function buildRockGeometry(): THREE.BufferGeometry {
  const rock = new THREE.DodecahedronGeometry(1, 0);
  rock.scale(1, 0.72, 1);
  return rock;
}

function buildCrystalGeometry(): THREE.BufferGeometry {
  const crystal = new THREE.OctahedronGeometry(0.7, 0);
  crystal.scale(0.6, 1.5, 0.6);
  return crystal;
}

/* ========================================================================== */
/* Instanced group                                                            */
/* ========================================================================== */

/** Scratch objects for per-frame matrix writes. Never allocated in useFrame. */
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();

interface InstanceGroupProps {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  placements: PropPlacement[];
  /** Crystals bob; everything else is static. */
  animate?: 'crystal';
}

/**
 * One InstancedMesh for a whole prop type. Matrices are written once on mount
 * (and when the tier changes), so the per-frame cost is a single draw call.
 */
function InstanceGroup({ geometry, material, placements, animate }: InstanceGroupProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;

    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    placements.forEach((p, i) => {
      euler.set(0, p.rotY, 0);
      quat.setFromEuler(euler);
      pos.set(p.x, p.y, p.z);
      scl.set(p.scale, p.scale * p.yScale, p.scale);
      matrix.compose(pos, quat, scl);
      m.setMatrixAt(i, matrix);
    });

    m.count = placements.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [placements]);

  useFrame((state) => {
    material.color.copy(liveWorldTint);
    if (animate !== 'crystal') return;

    // Crystals bob and spin. Only the matrices of visible instances are
    // rewritten, and only when the group is on screen.
    const m = mesh.current;
    if (!m || m.count === 0) return;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      const bob = Math.sin(time * 0.8 + p.x * 0.15) * 0.35;
      _euler.set(0, p.rotY + time * 0.4, 0);
      _quat.setFromEuler(_euler);
      _pos.set(p.x, p.y + 0.6 + bob, p.z);
      _scl.set(p.scale, p.scale * p.yScale, p.scale);
      _matrix.compose(_pos, _quat, _scl);
      m.setMatrixAt(i, _matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, Math.max(placements.length, 1)]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled
    />
  );
}

/* ========================================================================== */
/* Props                                                                       */
/* ========================================================================== */

/**
 * Every repeated object in the world: trees, lamp posts, rocks and crystals.
 *
 * Each type is a single InstancedMesh, so the whole set costs four draw calls
 * regardless of instance count. Placement is seeded and rejects anything that
 * would land on the road or inside a landmark.
 */
export function Props({ complexity }: { complexity: WorldComplexity }) {
  const trees = useMemo(
    () =>
      generatePlacements({
        count: complexity.trees,
        minTrackDistance: PROPS.minSideOffset,
        maxOffset: 46,
        landmarkClearance: PROPS.landmarkClearance,
        seed: WORLD_SEED + 301,
        scaleMin: 0.7,
        scaleMax: 1.9,
        yScaleMin: 0.85,
        yScaleMax: 1.5,
      }),
    [complexity],
  );

  const rocks = useMemo(
    () =>
      generatePlacements({
        count: complexity.rocks,
        minTrackDistance: PROPS.minSideOffset,
        maxOffset: 34,
        landmarkClearance: PROPS.landmarkClearance,
        seed: WORLD_SEED + 401,
        scaleMin: 0.5,
        scaleMax: 2.4,
        yScaleMin: 0.5,
        yScaleMax: 1,
      }),
    [complexity],
  );

  const crystals = useMemo(
    () =>
      generatePlacements({
        count: complexity.crystals,
        minTrackDistance: PROPS.minSideOffset,
        maxOffset: 30,
        landmarkClearance: PROPS.landmarkClearance,
        seed: WORLD_SEED + 501,
        scaleMin: 0.5,
        scaleMax: 1.3,
        yScaleMin: 0.8,
        yScaleMax: 1.4,
      }),
    [complexity],
  );

  const lamps = useMemo(
    () => generateLampPlacements(PROPS.lampSpacing, PROPS.lampSideOffset, WORLD_SEED + 601),
    [],
  );

  const geometries = useMemo(
    () => ({
      tree: buildTreeGeometry(),
      lampPole: buildLampPoleGeometry(),
      lampHead: buildLampHeadGeometry(),
      rock: buildRockGeometry(),
      crystal: buildCrystalGeometry(),
    }),
    [],
  );

  const materials = useMemo(
    () => ({
      tree: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#16204a'),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
      lampPole: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#0d1024'),
        roughness: 0.9,
        metalness: 0.2,
      }),
      /*
       * Phase 5 bloom retune. Lamp heads are the *intended* bloom source — they
       * are the only things in the world that should glow — so they sit well
       * above the threshold. Crystals were pulled down from 1.6 to just under
       * it: at 1.6 every crystal along the road bloomed, and forty-four of them
       * read as fog rather than as scattered points of light.
       */
      lampHead: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#1a1408'),
        emissive: new THREE.Color(COLORS.lampHead),
        emissiveIntensity: EMISSIVE.lampHead,
        roughness: 0.4,
      }),
      rock: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#131a3d'),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
      crystal: new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.accent),
        emissive: new THREE.Color(COLORS.accent),
        emissiveIntensity: 0.68,
        roughness: 0.3,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      for (const geo of Object.values(geometries)) geo.dispose();
      for (const mat of Object.values(materials)) mat.dispose();
    },
    [geometries, materials],
  );

  return (
    <group>
      <InstanceGroup geometry={geometries.tree} material={materials.tree} placements={trees} />
      <InstanceGroup
        geometry={geometries.lampPole}
        material={materials.lampPole}
        placements={lamps}
      />
      <InstanceGroup
        geometry={geometries.lampHead}
        material={materials.lampHead}
        placements={lamps}
      />
      <InstanceGroup geometry={geometries.rock} material={materials.rock} placements={rocks} />
      <InstanceGroup
        geometry={geometries.crystal}
        material={materials.crystal}
        placements={crystals}
        animate="crystal"
      />
    </group>
  );
}
