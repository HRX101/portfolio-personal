import * as THREE from 'three';
import { Landmark, useGeometry, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

/**
 * A glowing arch spanning the road at the start of the ride. The bike passes
 * straight through it, so it is centred on the road and yawed to the tangent.
 * Emissive strips pulse gently; a start-line strip marks the asphalt.
 */
export function HeroGate({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const pillar = useGeometry(() => new THREE.BoxGeometry(1.3, 16, 1.3));
  const beam = useGeometry(() => new THREE.BoxGeometry(18, 1.5, 1.8));
  const vStrip = useGeometry(() => new THREE.BoxGeometry(0.28, 15.2, 0.28));
  const hStrip = useGeometry(() => new THREE.BoxGeometry(16.6, 0.28, 0.28));
  const startLine = useGeometry(() => new THREE.BoxGeometry(6.6, 0.08, 1.4));

  useLandmark(anchor.t, (time) => {
    // Amplitude halved in Phase 5. At +-0.9 the pulse dipped the strips toward the
    // bloom threshold, so the arch visibly flickered between glowing and not on
    // every cycle. +-0.5 keeps it always lit while still reading as a pulse.
    materials.accent.emissiveIntensity = 2.6 + Math.sin(time * 2) * 0.5;
  });

  return (
    <Landmark anchor={anchor}>
      <mesh geometry={pillar} material={materials.structure} position={[-8, 8, 0]} />
      <mesh geometry={pillar} material={materials.structure} position={[8, 8, 0]} />
      <mesh geometry={beam} material={materials.structure} position={[0, 15.6, 0]} />
      <mesh geometry={vStrip} material={materials.accent} position={[-7.2, 8, 0.96]} />
      <mesh geometry={vStrip} material={materials.accent} position={[7.2, 8, 0.96]} />
      <mesh geometry={hStrip} material={materials.accent} position={[0, 15.6, 0.96]} />
      <mesh geometry={startLine} material={materials.accent} position={[0, 0.05, 0]} />
    </Landmark>
  );
}
