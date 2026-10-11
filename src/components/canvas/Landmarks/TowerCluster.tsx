import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Landmark, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

interface Tower {
  w: number;
  d: number;
  h: number;
  x: number;
  z: number;
}

const TOWERS: readonly Tower[] = [
  { w: 4.6, d: 4.6, h: 22, x: -5.5, z: -3 },
  { w: 5.6, d: 5, h: 29, x: 1.5, z: 2 },
  { w: 4, d: 4, h: 17, x: 8.5, z: -4 },
];

/** Merges the lit window bands of one tower into a single geometry. */
function buildWindowBands(tower: Tower): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let y = 2.4; y < tower.h - 1; y += 3.1) {
    const band = new THREE.BoxGeometry(tower.w + 0.18, 0.4, tower.d + 0.18);
    band.translate(tower.x, y, tower.z);
    parts.push(band);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged ?? parts[0]!;
}

/**
 * A cluster of three towers of differing heights, their window bands glowing.
 * The varied silhouettes read as a small skyline from the chase camera.
 */
export function TowerCluster({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const towerGeometries = useMemo(() => TOWERS.map((t) => new THREE.BoxGeometry(t.w, t.h, t.d)), []);
  const bandGeometries = useMemo(() => TOWERS.map(buildWindowBands), []);

  useEffect(
    () => () => {
      for (const geo of towerGeometries) geo.dispose();
      for (const geo of bandGeometries) geo.dispose();
    },
    [towerGeometries, bandGeometries],
  );

  useLandmark(anchor.t, (time) => {
    // Bands shimmer out of phase so the skyline never pulses in unison. Phase 5
    // retune: see ResearchDome.
    materials.accent.emissiveIntensity = 2.6 + Math.sin(time * 1.7) * 0.5;
    materials.warm.emissiveIntensity = 1.05 + Math.sin(time * 1.7 + 2.1) * 0.3;
  });

  return (
    <Landmark anchor={anchor}>
      {TOWERS.map((tower, i) => (
        <group key={i}>
          <mesh
            geometry={towerGeometries[i]}
            material={materials.structure}
            position={[tower.x, tower.h / 2, tower.z]}
          />
          <mesh
            geometry={bandGeometries[i]}
            material={i === 1 ? materials.warm : materials.accent}
          />
        </group>
      ))}
    </Landmark>
  );
}
