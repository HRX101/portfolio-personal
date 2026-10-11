import { useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Landmark, useGeometry, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

/** A trophy: base, stem and cup merged into one low-poly geometry. */
function buildTrophy(): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.55, 0.68, 0.5, 8);
  base.translate(0, 0.25, 0);
  const stem = new THREE.CylinderGeometry(0.16, 0.24, 1.2, 6);
  stem.translate(0, 1.05, 0);
  const cup = new THREE.ConeGeometry(0.78, 1.2, 8);
  cup.translate(0, 2.2, 0);
  const merged = mergeGeometries([base, stem, cup], false);
  base.dispose();
  stem.dispose();
  cup.dispose();
  return merged ?? base;
}

/**
 * A winners' podium: three steps with a trophy on each. The gold trophies
 * rotate slowly and their emissive glow breathes.
 */
export function Podium({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const steps = useGeometry(() => {
    const s1 = new THREE.BoxGeometry(11, 2.2, 7);
    s1.translate(0, 1.1, 0);
    const s2 = new THREE.BoxGeometry(7.6, 2.2, 5.2);
    s2.translate(0, 3.3, 0);
    const s3 = new THREE.BoxGeometry(4.4, 2.2, 3.4);
    s3.translate(0, 5.5, 0);
    const merged = mergeGeometries([s1, s2, s3], false);
    s1.dispose();
    s2.dispose();
    s3.dispose();
    return merged ?? s1;
  });
  const trophy = useGeometry(buildTrophy);

  const trophyRefs = useRef<(THREE.Mesh | null)[]>([]);

  useLandmark(anchor.t, (time) => {
    // Gold stays in the "lit metal" range rather than the "light source" range:
    // it is polished metal catching the moon, and a pulsing glow around every
    // trophy made the achievements station look like it was on fire.
    materials.gold.emissiveIntensity = 0.9 + Math.sin(time * 1.2) * 0.28;
    for (let i = 0; i < trophyRefs.current.length; i++) {
      const mesh = trophyRefs.current[i];
      if (mesh) mesh.rotation.y = time * (0.5 + i * 0.16);
    }
  });

  return (
    <Landmark anchor={anchor}>
      <mesh geometry={steps} material={materials.structure} />
      {[
        { x: -3.6, y: 2.2, z: 0 },
        { x: 0, y: 4.4, z: 0 },
        { x: 3.6, y: 2.2, z: 0 },
      ].map((p, i) => (
        <mesh
          key={i}
          ref={(el) => {
            trophyRefs.current[i] = el;
          }}
          geometry={trophy}
          material={materials.gold}
          position={[p.x, p.y, p.z]}
          scale={i === 1 ? 1.25 : 1}
        />
      ))}
    </Landmark>
  );
}
