import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, TERRAIN, WORLD_SEED } from '../../../config/scene';
import { fbm2, makeRandom } from '../../../lib/noise';
import { curve } from '../../../lib/track';
import { terrainHeightAt } from '../../../lib/world';
import { liveStarOpacity, liveWorldTint } from '../../../lib/atmosphere';

/* ========================================================================== */
/* Distant mountains                                                           */
/* ========================================================================== */

interface RingSpec {
  radius: number;
  segments: number;
  color: string;
  seed: number;
}

/**
 * Three concentric rings of low-poly peaks. Each ring is darker than the one
 * in front of it and sits further back, so the fog turns them into layered
 * silhouettes rather than a solid wall.
 */
const RINGS: readonly RingSpec[] = [
  { radius: 210, segments: 46, color: COLORS.mountainNear, seed: WORLD_SEED + 11 },
  { radius: 300, segments: 60, color: COLORS.mountainMid, seed: WORLD_SEED + 23 },
  { radius: 390, segments: 78, color: COLORS.mountainFar, seed: WORLD_SEED + 37 },
];

function buildRing(spec: RingSpec, center: THREE.Vector3): THREE.BufferGeometry | null {
  const rand = makeRandom(spec.seed);
  const base = new THREE.Color(spec.color);
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < spec.segments; i++) {
    const angle = (i / spec.segments) * Math.PI * 2 + rand() * 0.4;
    const radius = spec.radius * (0.82 + rand() * 0.36);
    const x = center.x + Math.cos(angle) * radius;
    const z = center.z + Math.sin(angle) * radius;

    const height =
      46 + rand() * 96 + fbm2(x * 0.008, z * 0.008, 3, spec.seed) * 34;
    const baseRadius = 26 + rand() * 44;

    const geo = new THREE.ConeGeometry(baseRadius, height, 5, 1);
    geo.translate(0, height / 2, 0);
    const groundY = terrainHeightAt(x, z);
    geo.translate(x, groundY - 3, z);

    // Slight per-peak shade variation gives the ring depth once fog flattens it.
    const shade = 0.82 + rand() * 0.36;
    const color = base.clone().multiplyScalar(shade);
    const count = geo.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      colors[v * 3] = color.r;
      colors[v * 3 + 1] = color.g;
      colors[v * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geo);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

function Mountains() {
  const center = useMemo(() => curve.getPointAt(0.5, new THREE.Vector3()), []);
  const rings = useMemo(
    () =>
      RINGS.map((spec) => {
        const geo = buildRing(spec, center);
        return { spec, geo };
      }),
    [center],
  );

  const materials = useMemo(
    () =>
      rings.map(
        () =>
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            roughness: 1,
            metalness: 0,
          }),
      ),
    [rings],
  );

  useFrame(() => {
    for (const material of materials) material.color.copy(liveWorldTint);
  });

  return (
    <group>
      {rings.map(({ spec, geo }, i) => {
        if (!geo) return null;
        return (
          <mesh
            key={spec.seed}
            geometry={geo}
            material={materials[i]}
            frustumCulled={false}
          />
        );
      })}
    </group>
  );
}

/* ========================================================================== */
/* Stars                                                                       */
/* ========================================================================== */

const STAR_VERTEX = /* glsl */ `
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.62 + 0.38 * sin(uTime * (1.0 + aScale * 0.22) + aPhase);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aScale * uPixelRatio * (320.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float alpha = smoothstep(1.0, 0.0, d);
    alpha *= alpha;
    alpha *= vTwinkle * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const STAR_RADIUS = 800;

/**
 * A seeded point cloud on a large sphere. A shader gives each star its own
 * twinkle phase, and the whole field's opacity is driven by the atmosphere so
 * the stars wash out as the ride reaches pre-dawn.
 *
 * `fog` is deliberately off: the sphere sits well beyond the fog far plane, so
 * fogging it would erase the stars entirely instead of fading them at the
 * horizon. The sky dome's own gradient handles the horizon.
 */
function Stars({ count }: { count: number }) {
  const pixelRatio = useThree((s) => s.gl.getPixelRatio());

  const geometry = useMemo(() => {
    const rand = makeRandom(WORLD_SEED + 101);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Uniform on the upper hemisphere only: stars below the horizon would
      // show through the terrain.
      const y = 0.03 + rand() * 0.97;
      const phi = rand() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - y * y));
      positions[i * 3] = s * Math.cos(phi) * STAR_RADIUS;
      positions[i * 3 + 1] = y * STAR_RADIUS;
      positions[i * 3 + 2] = s * Math.sin(phi) * STAR_RADIUS;
      phases[i] = rand() * Math.PI * 2;
      scales[i] = 1.6 + rand() * 4.6;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), STAR_RADIUS);
    return geo;
  }, [count]);

  /*
   * Disposed on every rebuild, not just on unmount.
   *
   * `count` comes from the active quality level, so switching levels with the
   * L/M/H keys replaces this geometry. Without the effect each switch orphans the
   * previous position/phase/scale buffers and its GL handles for the life of the
   * page, and quality probing is exactly the flow that repeats the switch.
   */
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(COLORS.star) },
      uOpacity: { value: 1 },
      uPixelRatio: { value: 1 },
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [uniforms],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uOpacity.value = liveStarOpacity.value;
    uniforms.uPixelRatio.value = pixelRatio;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

/* ========================================================================== */
/* Haze                                                                        */
/* ========================================================================== */

/** Soft radial gradient drawn to a canvas: one texture shared by every sprite. */
function makeHazeTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.32)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface HazeSpec {
  position: [number, number, number];
  scale: number;
  opacity: number;
  speed: number;
}

/**
 * Large additive sprites drifting slowly along the ride. Sprites always face
 * the camera, so a handful of them read as banks of haze without any geometry.
 */
function Haze({ count }: { count: number }) {
  const texture = useMemo(() => makeHazeTexture(), []);
  const sprites = useRef<THREE.Sprite[]>([]);

  const specs = useMemo<HazeSpec[]>(() => {
    const rand = makeRandom(WORLD_SEED + 211);
    const list: HazeSpec[] = [];
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      list.push({
        position: [
          TERRAIN.minX + rand() * (TERRAIN.maxX - TERRAIN.minX),
          24 + rand() * 70,
          side * (150 + rand() * 220),
        ],
        scale: 260 + rand() * 260,
        opacity: 0.05 + rand() * 0.07,
        speed: 1.2 + rand() * 2.4,
      });
    }
    return list;
  }, [count]);

  const materials = useMemo(
    () =>
      specs.map(
        (spec) =>
          new THREE.SpriteMaterial({
            map: texture,
            color: new THREE.Color(COLORS.haze),
            transparent: true,
            opacity: spec.opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
      ),
    [specs, texture],
  );

  /* Same reasoning as the star geometry: `specs` changes with the quality level. */
  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const limit = TERRAIN.maxX + 120;
    /*
     * Bounded by `specs.length`, never by the ref's own length.
     *
     * `sprites.current` is a ref array R3F fills via ref callbacks and *never*
     * shrinks: an unmounted sprite's callback fires with `null`, and the handler
     * below only assigns on a non-null element, so dropped indices keep their
     * stale `Sprite`. That was harmless while the world complexity was fixed for
     * the life of the page, and became a hard crash in Phase 5 the moment `count`
     * could change at runtime — dropping from HIGH's seven haze planes to LOW's
     * three left four stale entries past the end of `specs`, and `specs[i]!.speed`
     * threw "Cannot read properties of undefined" on every frame. One bad frame
     * aborted the rest of R3F's subscriber list, so the ride driver stopped
     * running and the whole scene froze while still reporting a plausible fps.
     *
     * Iterating the spec list makes that class of bug impossible: the loop cannot
     * run past the end of the data it reads.
     */
    for (let i = 0; i < specs.length; i++) {
      const sprite = sprites.current[i];
      const spec = specs[i];
      if (!sprite || !spec) continue;
      sprite.position.x += spec.speed * dt;
      if (sprite.position.x > limit) sprite.position.x = TERRAIN.minX - 120;
    }
  });

  return (
    <group>
      {specs.map((spec, i) => (
        <sprite
          key={i}
          ref={(el) => {
            if (el) sprites.current[i] = el;
          }}
          position={spec.position}
          scale={[spec.scale, spec.scale * 0.55, 1]}
          material={materials[i]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

/* ========================================================================== */
/* Environment                                                                 */
/* ========================================================================== */

/** Distant mountains, stars and drifting haze. */
export function Environment({ stars, haze }: { stars: number; haze: number }) {
  return (
    <group>
      <Mountains />
      {stars > 0 && <Stars count={stars} />}
      {haze > 0 && <Haze count={haze} />}
    </group>
  );
}
