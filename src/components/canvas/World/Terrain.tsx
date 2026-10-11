import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { COLORS, TERRAIN } from '../../../config/scene';
import { terrainHeightAt } from '../../../lib/world';

/**
 * Low-poly terrain.
 *
 * A single plane is displaced by seeded fBm noise, then pinned to the road
 * inside the corridor so the ribbon never clips into a hill. Vertex colours
 * ramp from dark valleys to lighter peaks and `flatShading` gives the faceted
 * low-poly read. One draw call, no textures.
 */
export function Terrain({ segments, octaves }: { segments: number; octaves: number }) {
  const geometry = useMemo(() => {
    const width = TERRAIN.maxX - TERRAIN.minX;
    const depth = TERRAIN.farZ * 2;
    const segX = Math.round(segments * TERRAIN.aspect);
    const segZ = segments;

    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate((TERRAIN.minX + TERRAIN.maxX) / 2, 0, 0);

    const pos = geo.getAttribute('position');
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeightAt(x, z, octaves);
      pos.setY(i, h);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }

    // Second pass for colours: normalising by the actual height range keeps the
    // ramp stable regardless of how the noise happened to land this seed.
    const span = maxH - minH || 1;
    const colors = new Float32Array(pos.count * 3);
    const low = new THREE.Color(COLORS.terrainLow);
    const mid = new THREE.Color(COLORS.terrainMid);
    const high = new THREE.Color(COLORS.terrainHigh);
    const peak = new THREE.Color(COLORS.terrainPeak);
    const scratch = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - minH) / span;
      if (t < 0.4) {
        scratch.copy(low).lerp(mid, t / 0.4);
      } else if (t < 0.75) {
        scratch.copy(mid).lerp(high, (t - 0.4) / 0.35);
      } else {
        scratch.copy(high).lerp(peak, (t - 0.75) / 0.25);
      }
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, [segments, octaves]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        flatShading
        roughness={1}
        metalness={0}
        onBeforeCompile={applyGridShader}
      />
    </mesh>
  );
}

/**
 * Faint world-space grid, drawn in the fragment shader from position rather
 * than a texture so it stays crisp at any distance and costs no memory. It
 * fades with distance so it never aliases into noise near the horizon.
 */
function applyGridShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uGridColor = { value: new THREE.Color(COLORS.groundGrid) };
  shader.uniforms.uNear = { value: 14 };
  shader.uniforms.uFar = { value: 240 };

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
    .replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n\tvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorld;
      uniform vec3 uGridColor;
      uniform float uNear;
      uniform float uFar;`,
    )
    .replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float dist = length(vWorld.xz - cameraPosition.xz);
      float fade = 1.0 - smoothstep(uNear, uFar, dist);
      if (fade > 0.001) {
        vec2 grid = vWorld.xz / 16.0;
        vec2 g = abs(fract(grid) - 0.5) / max(fwidth(grid), 1e-5);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        gl_FragColor.rgb += uGridColor * line * 0.4 * fade;
      }`,
    );
}
