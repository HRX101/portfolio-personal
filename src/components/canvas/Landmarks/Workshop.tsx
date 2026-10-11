import { useRef } from 'react';
import * as THREE from 'three';
import { Landmark, useGeometry, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

/**
 * A small workshop: a container with an open front, a glowing signage panel
 * above it, and a few floating cubes drifting overhead. The open front faces
 * the road so the interior reads as a lit workspace.
 */
export function Workshop({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const body = useGeometry(() => new THREE.BoxGeometry(9, 6, 6.5));
  const opening = useGeometry(() => new THREE.BoxGeometry(7, 4.4, 0.12));
  const sign = useGeometry(() => new THREE.BoxGeometry(6.4, 1.6, 0.3));
  const mast = useGeometry(() => new THREE.CylinderGeometry(0.16, 0.2, 3.4, 6));
  const cube = useGeometry(() => new THREE.BoxGeometry(0.95, 0.95, 0.95));

  const cubeRefs = useRef<(THREE.Mesh | null)[]>([]);

  useLandmark(anchor.t, (time) => {
    // Phase 5 retune: see ResearchDome.
    materials.warm.emissiveIntensity = 1.05 + Math.sin(time * 2.2) * 0.3;
    materials.accent.emissiveIntensity = 2.6 + Math.sin(time * 2.2 + 1.4) * 0.5;

    for (let i = 0; i < 3; i++) {
      const mesh = cubeRefs.current[i];
      if (!mesh) continue;
      mesh.position.y = 8.6 + i * 1.5 + Math.sin(time * 1.2 + i * 2.1) * 0.55;
      mesh.rotation.y = time * (0.5 + i * 0.18);
      mesh.rotation.x = time * 0.3;
    }
  });

  return (
    <Landmark anchor={anchor}>
      <mesh geometry={body} material={materials.structure} position={[0, 3, 0]} />
      {/* Open front: a dark inset that reads as a lit interior. */}
      <mesh geometry={opening} material={materials.dark} position={[0, 2.8, 3.26]} />
      <mesh geometry={mast} material={materials.structure} position={[0, 7.4, 2.4]} />
      <mesh geometry={sign} material={materials.warm} position={[0, 9.2, 2.4]} />
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            cubeRefs.current[i] = el;
          }}
          geometry={cube}
          material={i === 1 ? materials.warm : materials.accent}
          position={[(i - 1) * 2.4, 8.6 + i * 1.5, 0.5]}
        />
      ))}
    </Landmark>
  );
}
