import { useRef } from 'react';
import * as THREE from 'three';
import { Landmark, useGeometry, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

/**
 * A research dome: a hemisphere with a rotating ring and a radar dish on top.
 * The ring precesses slowly and the dish pulses, giving the dome a quiet
 * instrument-like life.
 */
export function ResearchDome({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const dome = useGeometry(
    () => new THREE.SphereGeometry(6, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  );
  const ring = useGeometry(() => new THREE.TorusGeometry(2.3, 0.2, 6, 28));
  const dish = useGeometry(() => new THREE.ConeGeometry(1.7, 2.4, 8));
  const base = useGeometry(() => new THREE.CylinderGeometry(6.4, 6.8, 0.8, 14));

  const ringRef = useRef<THREE.Mesh>(null);

  useLandmark(anchor.t, (time) => {
    // Phase 5: accent raised to the landmark range, warm dropped to the
    // "lit surface" range, and both amplitudes cut. Previously the accent swung
    // 1.0..2.6, spending half its cycle below the bloom threshold, so the dome
    // blinked.
    materials.accent.emissiveIntensity = 2.6 + Math.sin(time * 1.8) * 0.5;
    materials.warm.emissiveIntensity = 1.05 + Math.sin(time * 1.8 + 0.8) * 0.3;
    if (ringRef.current) {
      ringRef.current.rotation.y = time * 0.55;
      ringRef.current.rotation.x = Math.sin(time * 0.45) * 0.35;
    }
  });

  return (
    <Landmark anchor={anchor}>
      <mesh geometry={base} material={materials.structure} position={[0, 0.4, 0]} />
      <mesh geometry={dome} material={materials.structure} position={[0, 0.8, 0]} />
      <mesh ref={ringRef} geometry={ring} material={materials.accent} position={[0, 7.6, 0]} />
      <mesh geometry={dish} material={materials.warm} position={[0, 9.6, 0]} />
    </Landmark>
  );
}
