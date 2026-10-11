import * as THREE from 'three';
import { COLORS, EMISSIVE, TRACK_RIBBON_SAMPLES, TRACK_WIDTH } from '../../config/scene';
import { curve } from '../../lib/track';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Builds the road ribbon.
 *
 * For each sample along the curve we take the tangent and derive a side vector
 * as `tangent x up`, which keeps the road level regardless of how the terrain
 * rolls under it. Two vertices per sample (left/right edge) are stitched into
 * a triangle strip via indices, with a `v` coordinate running across the width
 * so the fragment shader can draw the edge glow and centre stripe without
 * needing extra geometry.
 *
 * Kept at module scope as a lazily-built singleton because it never changes.
 */
function buildRibbon(): THREE.BufferGeometry {
  const count = TRACK_RIBBON_SAMPLES;
  const half = TRACK_WIDTH / 2;

  const positions = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices = new Uint32Array((count - 1) * 6);

  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Samples avoid the exact endpoints: getPointAt extrapolates there and the
    // tangent goes degenerate.
    const t = 0.002 + (i / (count - 1)) * 0.996;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent);

    side.crossVectors(tangent, UP).normalize().multiplyScalar(half);

    const left = i * 6;
    const right = left + 3;
    positions[left] = point.x - side.x;
    positions[left + 1] = point.y - side.y;
    positions[left + 2] = point.z - side.z;
    positions[right] = point.x + side.x;
    positions[right + 1] = point.y + side.y;
    positions[right + 2] = point.z + side.z;

    const v = i / (count - 1);
    uvs[i * 4] = v;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = v;
    uvs[i * 4 + 3] = 1;

    if (i < count - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const o = i * 6;
      indices[o] = a;
      indices[o + 1] = c;
      indices[o + 2] = b;
      indices[o + 3] = b;
      indices[o + 4] = c;
      indices[o + 5] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

let ribbonGeometry: THREE.BufferGeometry | undefined;

/**
 * The road surface: dark asphalt with a dashed centre stripe and glowing edges,
 * all in one draw call.
 */
export function Track() {
  ribbonGeometry ??= buildRibbon();

  return (
    <mesh geometry={ribbonGeometry} receiveShadow frustumCulled={false}>
      <meshStandardMaterial
        color={COLORS.road}
        roughness={0.85}
        metalness={0.1}
        side={THREE.DoubleSide}
        onBeforeCompile={applyRoadShader}
      />
    </mesh>
  );
}

/**
 * Injects edge glow + centre stripe into the standard material. Doing this in
 * `onBeforeCompile` keeps MeshStandardMaterial's lighting and shadows intact,
 * which a raw ShaderMaterial would throw away.
 */
function applyRoadShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uEdgeColor = { value: new THREE.Color(COLORS.roadEdge) };
  shader.uniforms.uStripeColor = { value: new THREE.Color(COLORS.roadStripe) };
  shader.uniforms.uEdgeIntensity = { value: EMISSIVE.roadEdge };

  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoadUv = uv;');

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      varying vec2 vRoadUv;
      uniform vec3 uEdgeColor;
      uniform vec3 uStripeColor;
      uniform float uEdgeIntensity;`,
    )
    .replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      // v runs 0..1 across the road width: 0 = left edge, 1 = right edge.
      float across = vRoadUv.y;
      float edgeDist = min(across, 1.0 - across);

      // Phase 5 bloom retune. The edge band was 0.045 of the road width at a
      // gain of 1.6 — roughly four metres of glowing surface running the whole
      // length of the track, all of it above the bright-pass threshold. Bloom
      // then blurred that into a continuous tube and the road lost its edges to
      // haze. Narrower and dimmer: a thin line that reads as a painted edge line,
      // which picks up just enough bloom at grazing angles to feel lit.
      float edge = 1.0 - smoothstep(0.0, 0.028, edgeDist);

      // Dashed centre stripe, scrolling slowly along the road.
      float dash = step(0.5, fract(vRoadUv.x * 220.0));
      float stripe = (1.0 - smoothstep(0.0, 0.018, abs(across - 0.5))) * dash * 0.55;

      gl_FragColor.rgb += uEdgeColor * edge * uEdgeIntensity;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uStripeColor, stripe);
      `,
    );
}
