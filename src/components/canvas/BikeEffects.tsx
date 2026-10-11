import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../../config/scene';
import { CAMERA_KICK, DUST, HEADLIGHT, MAX_SPEED, TRAIL } from '../../config/effects';
import { cameraKick, resetCameraKick } from '../../lib/cameraKick';
import { clamp, damp } from '../../lib/easing';
import { createTrackPose, sampleTrack } from '../../lib/track';
import { getRide } from '../../hooks/useScrollProgress';
import { getQuality } from '../../hooks/useQuality';

/**
 * ============================================================================
 * BIKE EFFECTS — PHASE 5
 * ============================================================================
 *
 * Four effects that all read from the same source of speed:
 *
 *   Trail        fading ribbon mesh, ring buffer of 48 world-space samples
 *   Dust         one `Points` object, pool of 220 particles, one draw call
 *   Headlight    additive cone + bulb sprite + one unshadowed point light
 *   CameraKick   FOV widening and micro-shake, handed to the camera rig
 *
 * Three rules hold across all four, because breaking any of them is the usual
 * way this kind of code starts dropping frames:
 *
 *   1. No allocation in a frame loop. Every vector, colour and array is created
 *      once when the effect mounts. Buffers are allocated at full size and
 *      rewritten in place; nothing is pushed, spliced or spread per frame. The
 *      `new THREE.Color` that used to sit inside the trail's loop is hoisted to
 *      a memo for exactly this reason.
 *   2. No React state per frame. These components render once when the quality
 *      level changes and never again. Everything after that is imperative writes
 *      to buffers, uniforms and the camera-kick channel.
 *   3. Nothing runs when it would contribute nothing. The trail, the dust and the
 *      shake each check speed before touching a buffer, so a parked bike costs a
 *      handful of comparisons rather than a full buffer rewrite.
 *
 * The quality gate is a plain `if (!flag) return null` in a component whose own
 * hooks live in a child. That split is deliberate: it satisfies the rules of hooks
 * (an effect can be absent without conditionally skipping hook calls in the
 * component that hosts it) while still meaning the effect's update loop genuinely
 * does not exist at that tier. Nothing here is "on but invisible" — Phase 6 gets
 * the frame budget back by not mounting the component at all.
 */

/* ========================================================================== */
/* Shared per-frame bike frame                                                 */
/* ========================================================================== */

const pose = createTrackPose();
const _origin = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Where the rear wheel meets the road, in world space, plus its road frame. */
function sampleBikeFrame(): void {
  const ride = getRide();
  sampleTrack(ride.t, pose);
  _forward.copy(pose.tangent);
  _right.copy(pose.right);
  _origin.copy(pose.position).addScaledVector(_forward, -0.7); // rear axle (1.4 wheelbase)
  _origin.y += 0.02; // contact patch, not hub height
}

/** 0..1 speed remapped from a pair of bounds. Shared so every effect agrees. */
function speedRatio(speedFactor: number, floor: number, ceiling: number): number {
  const normalized = speedFactor * MAX_SPEED;
  return clamp((normalized - floor) / (ceiling - floor));
}

/* ========================================================================== */
/* Trail                                                                       */
/* ========================================================================== */

/**
 * A fading ribbon behind the rear wheel.
 *
 * Two buffers, deliberately separate:
 *
 *   `ring`      world-space positions, a fixed circular buffer. One slot
 *               is overwritten per frame with the wheel's current position.
 *   positions   the geometry's vertex buffer, rewritten every frame in *age
 *               order*, oldest first, with each sample widened into a pair of
 *               vertices either side of the path.
 *
 * Keeping the ring separate is what makes the geometry continuous. Reading the
 * ring in age order each frame means the strip needs no index rewriting and no
 * wrapping special-casing: the newest sample is always at vertex pair 0, and the
 * geometry's fixed index buffer walks it in order. The alternative — writing in
 * place and rotating the vertex order — produces a visible tear at the wrap
 * point, because the strip's first and last vertices have to stay adjacent.
 *
 * Colour carries the age fade, so there is no alpha blending, no shader work and
 * no second pass: the fade is four float writes per vertex.
 */
function Trail() {
  const quality = getQuality();
  if (!quality.trail) return null;
  // Scaled by the tier's pooled-particle budget, because the ribbon's cost is the
  // buffer rewrite: every slot is a sample written, widened into two vertices and
  // re-uploaded, every frame. Halving the samples halves that work and roughly
  // halves the ribbon's length along the road, which is the honest trade.
  const points = Math.round(TRAIL.points * quality.particles);
  // A strip of one sample has no segments and would divide by zero in the age
  // calculation below, so a budget that rounds down to nothing opts out entirely.
  if (points < 2) return null;
  return <TrailRibbon points={points} />;
}

function TrailRibbon({ points }: { points: number }) {
  const mesh = useRef<THREE.Mesh>(null);

  const gpu = useMemo(() => {
    /* --- CPU-side ring buffer of world-space samples ---------------- */
    const ring = new Float32Array(points * 3);
    // `primed` starts false so the first write seeds every slot at the wheel's
    // position. Without that, the ribbon would streak in from the origin.
    const head = { slot: 0, primed: false, fade: 0 };

    /* --- geometry -------------------------------------------------- */
    const positions = new Float32Array(points * 2 * 3);
    const colors = new Float32Array(points * 2 * 3);
    const indices = new Uint16Array((points - 1) * 6);
    for (let i = 0; i < points - 1; i++) {
      const a = i * 2;
      const o = i * 6;
      indices[o] = a;
      indices[o + 1] = a + 1;
      indices[o + 2] = a + 2;
      indices[o + 3] = a + 1;
      indices[o + 4] = a + 3;
      indices[o + 5] = a + 2;
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    const colorAttr = new THREE.BufferAttribute(colors, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('color', colorAttr);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    // The strip is rewritten from world-space samples every frame, so three's
    // automatic bounds computation would cull it against stale data. Fixed and
    // generous instead, and `frustumCulled` is off on the mesh as well.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Hoisted out of the frame loop: allocating a colour per frame to read three
    // numbers from it is exactly the mistake this file is otherwise about.
    const tint = new THREE.Color(COLORS.accent);

    // The attribute objects are captured here rather than looked up through
    // `geometry.attributes` every frame. Both are true `Float32Array`s that live
    // for the component's lifetime, so holding them directly is both faster and
    // free of the optional-chaining that a dynamic index signature would need.
    return { ring, head, geometry, material, tint, positionAttr, colorAttr, positions, colors };
  }, [points]);

  useEffect(
    () => () => {
      gpu.geometry.dispose();
      gpu.material.dispose();
    },
    [gpu],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const { ring, head, material, tint, positionAttr, colorAttr, positions, colors } = gpu;
    const speedFactor = getRide().speedFactor;

    /* --- fade in and out ------------------------------------------ */
    // Fading rather than toggling: a trail that appears at full brightness the
    // instant the wheel turns reads as a rendering glitch, and one that vanishes
    // mid-motion reads as the same thing in reverse.
    const moving = speedFactor > TRAIL.speedFloor / MAX_SPEED;
    head.fade = damp(head.fade, moving ? 1 : 0, moving ? 14 : 6, dt);
    material.opacity = head.fade * TRAIL.maxOpacity;

    const meshRef = mesh.current;
    if (meshRef) meshRef.visible = head.fade > 0.01;
    if (head.fade <= 0.01) {
      // Nothing visible, so nothing to integrate. Parked bikes are the common
      // case here — a reader reads a station for a while — and this is where
      // that saves a full buffer rewrite.
      head.primed = false;
      return;
    }

    /* --- write one new sample into the ring ------------------------ */
    const slot = head.slot;
    const ringOffset = slot * 3;
    if (!head.primed) {
      for (let i = 0; i < points; i++) {
        ring[i * 3] = _origin.x;
        ring[i * 3 + 1] = _origin.y + TRAIL.height;
        ring[i * 3 + 2] = _origin.z;
      }
      head.primed = true;
    } else {
      ring[ringOffset] = _origin.x;
      ring[ringOffset + 1] = _origin.y + TRAIL.height;
      ring[ringOffset + 2] = _origin.z;
    }

    /* --- rebuild the strip in age order --------------------------- */
    const widthRatio = speedRatio(speedFactor, 0, MAX_SPEED * 0.5);

    for (let i = 0; i < points; i++) {
      // age 0 = newest (at the wheel), 1 = oldest (far behind).
      const age = i / (points - 1);
      const sample = (slot - i + points) % points;
      const sampleOffset = sample * 3;

      const x = ring[sampleOffset] ?? 0;
      const y = ring[sampleOffset + 1] ?? 0;
      const z = ring[sampleOffset + 2] ?? 0;

      // Direction of travel at this sample, taken from the *next older* one.
      // Crossing the wrap is handled by the same modulo, so no special case.
      const older = ((sample - 1 + points) % points) * 3;
      const dx = x - (ring[older] ?? x);
      const dz = z - (ring[older + 2] ?? z);
      const length = Math.hypot(dx, dz);
      // A zero-length segment means the wheel has not moved since the last
      // sample; fall back to a unit axis so the ribbon does not collapse.
      const nx = length > 1e-5 ? -dz / length : 0;
      const nz = length > 1e-5 ? dx / length : 1;

      // Teardrop: full width at the head, zero at the tail.
      const halfWidth = TRAIL.width * (1 - age) * widthRatio;
      const vertex = i * 2 * 3;

      positions[vertex] = x + nx * halfWidth;
      positions[vertex + 1] = y;
      positions[vertex + 2] = z + nz * halfWidth;
      positions[vertex + 3] = x - nx * halfWidth;
      positions[vertex + 4] = y;
      positions[vertex + 5] = z - nz * halfWidth;

      // Squared falloff, not linear: linear reads as the tail being cut off,
      // squared reads as light leaving. The head stays above the bloom
      // threshold and the tail falls below it, so bloom picks up the wheel end
      // only, which is where it belongs.
      const brightness = (1 - age) * (1 - age) * head.fade * (0.35 + widthRatio * 0.65);
      const r = tint.r * brightness;
      const g = tint.g * brightness;
      const b = tint.b * brightness;
      colors[vertex] = r;
      colors[vertex + 1] = g;
      colors[vertex + 2] = b;
      colors[vertex + 3] = r;
      colors[vertex + 4] = g;
      colors[vertex + 5] = b;
    }

    head.slot = (slot + 1) % points;
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return <mesh ref={mesh} geometry={gpu.geometry} material={gpu.material} frustumCulled={false} renderOrder={2} />;
}

/* ========================================================================== */
/* Dust                                                                        */
/* ========================================================================== */

const DUST_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aOpacity;
  varying float vOpacity;
  void main() {
    vOpacity = aOpacity;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    // Perspective-correct size, clamped so a particle close to the near plane
    // cannot blow up into a screen-filling quad.
    gl_PointSize = min(aSize * (300.0 / max(-viewPosition.z, 0.001)), 64.0);
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vOpacity;
  void main() {
    if (vOpacity <= 0.002) discard;
    // Soft round falloff. Square points read as confetti.
    vec2 offset = gl_PointCoord - vec2(0.5);
    float falloff = 1.0 - smoothstep(0.0, 1.0, length(offset) * 2.0);
    if (falloff <= 0.002) discard;
    gl_FragColor = vec4(uColor, falloff * vOpacity);
  }
`;

/**
 * Pooled dust and sparks off the rear wheel.
 *
 * One `Points` object, one draw call, one `useFrame` for the whole system.
 *
 * The pool is allocated once at mount; a cursor walks it and dead particles are
 * recycled in place, so there is no allocation, no garbage and no array growth
 * regardless of how long the session runs. Velocity and remaining life live in
 * plain `Float32Array`s on the CPU — they are only needed there — while position,
 * size and opacity go straight into the geometry's attribute buffers.
 *
 * Emission is rate-based (`rateMax * speed * dt`, drained in a `while`) rather
 * than a fixed spawn per frame. That makes the effect framerate-independent: a
 * 30fps machine and a 144fps machine emit the same number of particles per
 * second, and the emission scales smoothly with velocity instead of stepping.
 */
function Dust() {
  const quality = getQuality();
  if (!quality.dust) return null;
  const count = Math.floor(DUST.count * quality.particles);
  if (count < 1) return null;
  return <DustPool count={count} />;
}

function DustPool({ count }: { count: number }) {
  const gpu = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    const sizeAttr = new THREE.BufferAttribute(sizes, 1);
    const opacityAttr = new THREE.BufferAttribute(opacities, 1);
    // Default usage is fine and explicit here: these are rewritten every frame.
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    opacityAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttr);
    geometry.setAttribute('aSize', sizeAttr);
    geometry.setAttribute('aOpacity', opacityAttr);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    const material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      uniforms: { uColor: { value: new THREE.Color(COLORS.accent) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return {
      geometry,
      material,
      // The attribute objects *and* their backing arrays are captured once. The
      // arrays are what the frame loop writes through; the attributes are only
      // ever flagged for upload. Holding both avoids a `geometry.attributes`
      // lookup — and the optional chaining that a dynamic index signature would
      // otherwise force — on every access, every frame.
      positionAttr,
      sizeAttr,
      opacityAttr,
      positions,
      sizes,
      opacities,
      pool: {
        vx: new Float32Array(count),
        vy: new Float32Array(count),
        vz: new Float32Array(count),
        life: new Float32Array(count),
        maxLife: new Float32Array(count),
        cursor: 0,
        emission: 0,
        fade: 0,
      },
    };
  }, [count]);

  useEffect(
    () => () => {
      gpu.geometry.dispose();
      gpu.material.dispose();
    },
    [gpu],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const { positionAttr, sizeAttr, opacityAttr, positions, sizes, opacities, pool } = gpu;
    const speedFactor = getRide().speedFactor;

    const moving = speedFactor > DUST.speedFloor / MAX_SPEED;
    pool.fade = damp(pool.fade, moving ? 1 : 0, moving ? 12 : 5, dt);

    /* --- emission -------------------------------------------------- */
    if (moving) {
      pool.emission += DUST.rateMax * speedRatio(speedFactor, DUST.speedFloor, MAX_SPEED) * dt;

      while (pool.emission >= 1) {
        pool.emission -= 1;
        const i = pool.cursor;
        pool.cursor = (pool.cursor + 1) % count;

        // Two deterministic jitters per particle. A hash rather than
        // `Math.random()` so a particle's spawn offset is a function of its slot
        // and stays stable for the frames it lives, and so nothing here can pull
        // in an RNG object from the global namespace.
        const a = jitter(i, 0);
        const b = jitter(i, 1);

        const j = i * 3;
        positions[j] = _origin.x + (a - 0.5) * DUST.jitter;
        positions[j + 1] = _origin.y + (a - 0.5) * DUST.jitter * 0.5;
        positions[j + 2] = _origin.z + (b - 0.5) * DUST.jitter;

        // Thrown backward along the road and spread sideways, so the plume trails
        // the bike instead of moving with it.
        pool.vx[i] = -_forward.x * DUST.driftBack + _right.x * (a - 0.5) * DUST.spread;
        pool.vy[i] = DUST.lift + (b - 0.5) * DUST.spread * 0.5;
        pool.vz[i] = -_forward.z * DUST.driftBack + _right.z * (b - 0.5) * DUST.spread;
        pool.maxLife[i] = DUST.lifetime * (0.7 + a * 0.3);
        pool.life[i] = pool.maxLife[i];

        sizes[i] = DUST.sizeStart;
        opacities[i] = DUST.maxOpacity * pool.fade;
      }
    } else {
      pool.emission = 0;
    }

    /* --- integration ----------------------------------------------- */
    for (let i = 0; i < count; i++) {
      const remaining = pool.life[i] ?? 0;
      if (remaining <= 0) {
        // Only touch the attribute when something is actually visible, so a
        // parked bike does not mark three buffers dirty every frame for nothing.
        if (opacities[i] !== 0) opacities[i] = 0;
        continue;
      }

      const next = remaining - dt;
      pool.life[i] = next;
      if (next <= 0) {
        opacities[i] = 0;
        continue;
      }

      pool.vy[i] = (pool.vy[i] ?? 0) + DUST.gravity * dt;
      // Read-modify-write through locals: `positions[j] += v` reads the indexed
      // slot first, and an index signature under `noUncheckedIndexedAccess`
      // makes that read `number | undefined` even though the write is fine.
      const j = i * 3;
      positions[j] = (positions[j] ?? 0) + (pool.vx[i] ?? 0) * dt;
      positions[j + 1] = (positions[j + 1] ?? 0) + (pool.vy[i] ?? 0) * dt;
      positions[j + 2] = (positions[j + 2] ?? 0) + (pool.vz[i] ?? 0) * dt;

      // 1 at spawn, 0 at death, driving both size and opacity together.
      const lifeRatio = next / (pool.maxLife[i] ?? 1);
      sizes[i] = DUST.sizeEnd + (DUST.sizeStart - DUST.sizeEnd) * lifeRatio;
      opacities[i] = DUST.maxOpacity * lifeRatio * lifeRatio * pool.fade;
    }

    positionAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    opacityAttr.needsUpdate = true;
  });

  return <points geometry={gpu.geometry} material={gpu.material} frustumCulled={false} renderOrder={3} />;
}

/**
 * A cheap deterministic 0..1 hash.
 *
 * A `Math.sin` multiply-fracture: no allocation, no state, no RNG object. Two
 * channels per particle so the x/z jitters are uncorrelated.
 */
function jitter(slot: number, channel: number): number {
  const x = Math.sin(slot * 12.9898 + channel * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* ========================================================================== */
/* Headlight                                                                   */
/* ========================================================================== */

/**
 * A soft cone of light ahead of the bike.
 *
 * Three parts: an additive cone mesh for the visible beam, a radial-gradient
 * sprite for the bulb itself, and one small point light so the road ahead is
 * genuinely lit rather than merely hazed over.
 *
 * Deliberately *not* a shadow-casting spot light. A second shadow map doubles
 * the scene's shadow pass for a contact highlight nobody would notice at this
 * scale, and the brief rules it out. The point light casts nothing and costs
 * effectively nothing — three's forward renderer handles a handful of
 * non-shadow-casting lights in the same pass as the moon's.
 */
function Headlight() {
  if (!getQuality().headlight) return null;
  return <HeadlightRig />;
}

function HeadlightRig() {
  const cone = useRef<THREE.Mesh>(null);
  const bulb = useRef<THREE.Sprite>(null);
  const light = useRef<THREE.PointLight>(null);

  const assets = useMemo(() => {
    /* --- beam ------------------------------------------------------ */
    // Cone authored along +Y by three, then translated so its apex sits at the
    // group origin, then rotated so it opens along +Z — the bike's direction of
    // travel. Doing the rotation on the geometry rather than the mesh keeps the
    // per-frame work down to a single yaw.
    const geometry = new THREE.ConeGeometry(HEADLIGHT.spread, HEADLIGHT.length, 20, 1, true);
    geometry.translate(0, -HEADLIGHT.length / 2, 0);
    geometry.rotateX(Math.PI / 2);
    // Additive and open-ended, so there is no visible cap and no depth write.
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.lampHead),
      transparent: true,
      opacity: HEADLIGHT.glow * 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    /* --- bulb ------------------------------------------------------ */
    // 64px is plenty for something this soft; a larger canvas would only cost
    // memory and upload time.
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(255,240,205,0.55)');
      gradient.addColorStop(1, 'rgba(255,230,166,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const bulbMaterial = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(COLORS.lampHead),
      transparent: true,
      opacity: HEADLIGHT.glow,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return { geometry, material, texture, bulbMaterial };
  }, []);

  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
      assets.bulbMaterial.dispose();
      assets.texture.dispose();
    },
    [assets],
  );

  useFrame(() => {
    const speedFactor = getRide().speedFactor;
    // The beam dims slightly with speed: a headlight that stays at full output
    // while the bike accelerates reads as pasted on, whereas a falloff reads as
    // the source falling behind — which is roughly what happens.
    if (light.current) light.current.intensity = HEADLIGHT.lightIntensity * (1 - speedFactor * 0.35);
    if (cone.current) cone.current.visible = true;
    if (bulb.current) bulb.current.visible = true;
  });

  return (
    /* Height and forward offset tuned to sit at the Speed T4's headlight bucket. */
    <group position={[0, 0.92, 0.55]}>
      <mesh ref={cone} geometry={assets.geometry} material={assets.material} renderOrder={4} />
      <sprite ref={bulb} material={assets.bulbMaterial} scale={[1.6, 1.6, 1]} renderOrder={5} />
      <pointLight
        ref={light}
        color={COLORS.lampHead}
        intensity={HEADLIGHT.lightIntensity}
        distance={HEADLIGHT.lightDistance}
        decay={HEADLIGHT.lightDecay}
        castShadow={false}
      />
    </group>
  );
}

/* ========================================================================== */
/* Camera kick                                                                 */
/* ========================================================================== */

/**
 * Velocity-driven FOV widening and micro-shake.
 *
 * Reads the shared `speedFactor` — the same value the trail and dust use — so
 * all three agree on what "fast" means and their envelopes line up as the bike
 * accelerates and eases off.
 *
 * Writes into `cameraKick` rather than touching the camera. The chase rig owns
 * the camera transform; if this component also wrote `camera.fov`, the rig would
 * damp the kick straight back out before it ever reached the screen. The channel
 * and the reasoning are documented in `lib/cameraKick.ts`.
 *
 * Small on purpose. The FOV opens by four degrees at full speed, which reads as
 * the shot widening; the shake stays under a tenth of a world unit, which reads
 * as road texture. A camera that visibly shakes is a broken camera.
 */
function CameraKick() {
  if (!getQuality().cameraKick) return null;
  return <CameraKickRig />;
}

function CameraKickRig() {
  useEffect(() => resetCameraKick, []);

  useFrame(() => {
    const ride = getRide();

    /* --- FOV ------------------------------------------------------- */
    cameraKick.fovOffset = CAMERA_KICK.fovKick * ride.speedFactor;

    /* --- shake ----------------------------------------------------- */
    // Speed below the floor gets nothing at all. A fraction of a pixel of
    // jitter while parked reads as a broken camera, not a live one.
    if (ride.speed < CAMERA_KICK.speedFloor) {
      cameraKick.shakeX = 0;
      cameraKick.shakeY = 0;
      cameraKick.shakeRoll = 0;
      return;
    }

    // Two out-of-phase sines rather than random noise. Random jitter reads as a
    // stutter; a low-frequency wobble reads as the road.
    const strength = clamp((ride.speed - CAMERA_KICK.speedFloor) / MAX_SPEED);
    const phase = performance.now() * 0.001 * CAMERA_KICK.shakeHz * Math.PI * 2;
    const amount = CAMERA_KICK.shake * strength;

    cameraKick.shakeX = Math.sin(phase) * amount;
    cameraKick.shakeY = Math.sin(phase * 1.7 + 1.1) * amount * 0.7;
    cameraKick.shakeRoll = Math.sin(phase * 0.6) * CAMERA_KICK.shakeRoll * strength;
  });

  return null;
}

/* ========================================================================== */
/* Roots                                                                       */
/* ========================================================================== */

/**
 * Bike-parented effects, mounted inside the bike's root group.
 *
 * Only the headlight lives here. It is authored in bike-local space — a fixed
 * offset from the frame — so riding on the group is exactly what makes it track
 * the bike without a per-frame transform of its own. The camera kick rides along
 * too, but it is transform-independent: it writes scalars into the shared channel
 * that `CameraRig` reads, and the rig lives outside the bike entirely.
 */
export function BikeEffects() {
  return (
    <>
      <Headlight />
      <CameraKick />
    </>
  );
}

/**
 * World-space effects, mounted as a sibling of the bike rather than inside it.
 *
 * The split exists because the trail and the dust both build their geometry from
 * `sampleBikeFrame()`, whose output is already in **world** space — the rear
 * wheel's contact patch. Inside the bike group that transform was being applied
 * twice: the group's world position and orientation, then the geometry's own
 * world-space coordinates on top. Nothing looked obviously broken, because a
 * double transform is still a coherent ribbon, but the trail was welded to a
 * point that tracked the bike's origin rather than its rear wheel, and it swung
 * with the bike's roll as it leaned. The dust plume had the same problem.
 *
 * Sampling happens once per frame here, at negative priority so it is guaranteed
 * to run before either child reads `_origin`. The children used to sample
 * individually, which meant two identical curve evaluations per frame whenever
 * both were mounted.
 */
export function BikeWorldEffects() {
  /*
   * Negative priority, which is the whole point of this callback existing
   * separately. R3F runs subscribers in ascending priority, so -1 lands ahead of
   * the trail and dust at the default 0 without taking over rendering — only a
   * priority above 0 does that, which is reserved for the post composer.
   */
  useFrame(sampleBikeFrame, -1);

  return (
    <>
      <Trail />
      <Dust />
    </>
  );
}
