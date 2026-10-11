import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS, LANDMARK } from '../../../config/scene';
import { getRide } from '../../../hooks/useScrollProgress';
import type { LandmarkAnchor } from '../../../lib/world';

/**
 * Advances a landmark's own animation clock, but only while the bike is near.
 *
 * Landmarks are scattered along a 500u track, so animating all seven every
 * frame would be wasted work for the six that are off screen. Gating on `t`
 * keeps the per-frame cost to whichever landmark the rider is actually passing.
 * The clock is accumulated rather than read from the global time, so a
 * landmark that was paused mid-rotation resumes exactly where it left off
 * instead of jumping.
 */
export function useLandmark(t: number, update: (time: number, delta: number) => void): void {
  const clock = useRef(0);

  useFrame((_, delta) => {
    if (Math.abs(getRide().t - t) > LANDMARK.animationRange) return;
    const dt = Math.min(delta, 1 / 20);
    clock.current += dt;
    update(clock.current, dt);
  });
}

/** Positions and orients a landmark at its anchor. */
export function Landmark({ anchor, children }: { anchor: LandmarkAnchor; children: ReactNode }) {
  return (
    <group position={anchor.position} rotation={[0, anchor.rotationY, 0]}>
      {children}
    </group>
  );
}

export interface LandmarkMaterials {
  structure: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  warm: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
}

/**
 * The shared material set for every landmark. Created per landmark and
 * disposed on unmount; keeping them separate means a material edit in one
 * landmark never leaks into another.
 */
export function useLandmarkMaterials(): LandmarkMaterials {
  const materials = useMemo<LandmarkMaterials>(
    () => ({
      structure: new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.landmark),
        roughness: 0.65,
        metalness: 0.25,
        flatShading: true,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: new THREE.Color('#0a0c1c'),
        roughness: 0.9,
        metalness: 0.1,
      }),
      /*
       * Phase 5 bloom retune.
       *
       * Landmark accents are the primary bloom source — they are what the eye is
       * meant to be drawn to as the bike approaches a station — so they sit well
       * above the threshold and their breathing animations are scaled to stay
       * above it too. Warm and gold sit closer to the line: they read as lit
       * surfaces rather than light sources, so a little bloom on their highlights
       * is right and a glow around their whole silhouette is not.
       *
       * All three were between 1.4 and 2.2 in Phase 3, which meant every
       * landmark bloomed at once and the stations stopped being distinguishable
       * from each other.
       */
      accent: new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.accent),
        emissive: new THREE.Color(COLORS.accent),
        emissiveIntensity: 2.6,
        roughness: 0.35,
        metalness: 0.1,
      }),
      warm: new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.landmarkWarm),
        emissive: new THREE.Color(COLORS.landmarkWarm),
        emissiveIntensity: 1.05,
        roughness: 0.4,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: new THREE.Color(COLORS.landmarkGold),
        emissive: new THREE.Color(COLORS.landmarkGold),
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.7,
      }),
    }),
    [],
  );

  useEffect(
    () => () => {
      const all: THREE.Material[] = [
        materials.structure,
        materials.dark,
        materials.accent,
        materials.warm,
        materials.gold,
      ];
      for (const material of all) material.dispose();
    },
    [materials],
  );

  return materials;
}

/** Disposes a geometry on unmount. */
export function useGeometry<T extends THREE.BufferGeometry>(factory: () => T): T {
  // Lazy useState initialiser: creates the geometry exactly once without a
  // useMemo, whose non-inline factory the use-memo rule would flag.
  const [geometry] = useState(factory);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}
