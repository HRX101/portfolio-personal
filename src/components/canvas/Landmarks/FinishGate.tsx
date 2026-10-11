import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Landmark, useGeometry, useLandmark, useLandmarkMaterials } from './Landmark';
import type { LandmarkAnchor } from '../../../lib/world';

/**
 * The finish: a lit gate with a checkered finish strip, plus a beacon tower
 * whose light cone sweeps slowly around. The cone is additive and transparent,
 * so it reads as a beam of light without casting anything.
 */
export function FinishGate({ anchor }: { anchor: LandmarkAnchor }) {
  const materials = useLandmarkMaterials();

  const pillar = useGeometry(() => new THREE.BoxGeometry(1.3, 15, 1.3));
  const beam = useGeometry(() => new THREE.BoxGeometry(17, 1.5, 1.8));
  const vStrip = useGeometry(() => new THREE.BoxGeometry(0.28, 14.2, 0.28));
  const hStrip = useGeometry(() => new THREE.BoxGeometry(15.6, 0.28, 0.28));
  const tower = useGeometry(() => new THREE.CylinderGeometry(0.8, 1.3, 17, 8));
  const lamp = useGeometry(() => new THREE.SphereGeometry(0.7, 10, 8));

  // Checkered finish strip: alternating emissive and dark tiles.
  const checker = useGeometry(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const tile = new THREE.BoxGeometry(0.85, 0.1, 1.5);
      tile.translate(-3.5 + i * 1.0, 0.06, 0);
      parts.push(tile);
    }
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    return merged ?? parts[0]!;
  });

  // Beam cone: apex at the origin, opening toward +X, so a Y rotation sweeps it.
  const cone = useGeometry(() => {
    const geo = new THREE.ConeGeometry(6.5, 20, 14, 1, true);
    geo.translate(0, -10, 0);
    geo.rotateZ(-Math.PI / 2);
    return geo;
  });

  const beamMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#7df3ff'),
        transparent: true,
        opacity: 0.13,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const coneRef = useRef<THREE.Mesh>(null);

  useEffect(
    () => () => {
      beamMaterial.dispose();
    },
    [beamMaterial],
  );

  useLandmark(anchor.t, (time) => {
    // See HeroGate: amplitude reduced so the pulse never dips through the bloom
    // threshold and makes the gate flicker.
    materials.accent.emissiveIntensity = 2.6 + Math.sin(time * 2.4) * 0.5;
    if (coneRef.current) coneRef.current.rotation.y = time * 0.65;
  });

  return (
    <Landmark anchor={anchor}>
      <mesh geometry={pillar} material={materials.structure} position={[-7.5, 7.5, 0]} />
      <mesh geometry={pillar} material={materials.structure} position={[7.5, 7.5, 0]} />
      <mesh geometry={beam} material={materials.structure} position={[0, 14.6, 0]} />
      <mesh geometry={vStrip} material={materials.accent} position={[-6.7, 7.5, 0.96]} />
      <mesh geometry={vStrip} material={materials.accent} position={[6.7, 7.5, 0.96]} />
      <mesh geometry={hStrip} material={materials.accent} position={[0, 14.6, 0.96]} />
      <mesh geometry={checker} material={materials.accent} />
      {/* Beacon tower off to the side, its beam sweeping the finish area. */}
      <mesh geometry={tower} material={materials.structure} position={[13, 8.5, -2]} />
      <mesh geometry={lamp} material={materials.accent} position={[13, 17.4, -2]} />
      <mesh
        ref={coneRef}
        geometry={cone}
        material={beamMaterial}
        position={[13, 17.4, -2]}
      />
    </Landmark>
  );
}
