import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Landmark, useGeometry, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

interface Orbiter {
  radius: number;
  speed: number;
  phase: number;
  height: number;
  warm: boolean;
}

/**
 * A floating skill constellation: a central core with small geometric shapes
 * orbiting it at different radii and heights. The whole cluster bobs and the
 * orbiters spin, reading as a living diagram of skills.
 */
export function SkillConstellation({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const core = useGeometry(() => new THREE.IcosahedronGeometry(1.7, 0));
  const orbiters = useMemo<Orbiter[]>(
    () =>
      [0, 1, 2, 3, 4, 5].map((i) => ({
        radius: 3.6 + i * 1.15,
        speed: 0.45 + i * 0.12,
        phase: i * 1.25,
        height: 1.6 + (i % 3) * 1.5,
        warm: i % 2 === 1,
      })),
    [],
  );

  const cluster = useRef<THREE.Group>(null);
  const orbiterRefs = useRef<(THREE.Mesh | null)[]>([]);

  useLandmark(anchor.t, (time) => {
    // Phase 5 retune: see ResearchDome. This landmark has more emissive orbs
    // than any other, so its pulse dipped furthest through the threshold.
    materials.accent.emissiveIntensity = 2.6 + Math.sin(time * 1.5) * 0.5;
    materials.warm.emissiveIntensity = 1.05 + Math.sin(time * 1.5 + 1) * 0.3;

    for (let i = 0; i < orbiters.length; i++) {
      const o = orbiters[i]!;
      const mesh = orbiterRefs.current[i];
      if (!mesh) continue;
      const angle = time * o.speed + o.phase;
      mesh.position.set(
        Math.cos(angle) * o.radius,
        o.height + Math.sin(time * 0.9 + o.phase) * 0.5,
        Math.sin(angle) * o.radius,
      );
      mesh.rotation.y = time * 0.8;
      mesh.rotation.x = time * 0.5;
    }

    if (cluster.current) cluster.current.position.y = 9 + Math.sin(time * 0.7) * 0.45;
  });

  return (
    <Landmark anchor={anchor}>
      <group ref={cluster} position={[0, 9, 0]}>
        <mesh geometry={core} material={materials.accent} />
        {orbiters.map((o, i) => (
          <mesh
            key={i}
            ref={(el) => {
              orbiterRefs.current[i] = el;
            }}
            material={o.warm ? materials.warm : materials.accent}
          >
            <octahedronGeometry args={[0.72, 0]} />
          </mesh>
        ))}
      </group>
    </Landmark>
  );
}
