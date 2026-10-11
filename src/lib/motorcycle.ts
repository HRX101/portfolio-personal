/**
 * ============================================================================
 * TRIUMPH SPEED T4 — STYLIZED LOW-POLY ROADSTER (PROCEDURAL, NO ASSETS)
 * ============================================================================
 *
 * A complete motorcycle built only from Three.js core primitives plus
 * runtime-generated CanvasTextures — no GLB, no external image files.
 * Drop-in replacement for the procedural bicycle in
 * `src/components/canvas/Bike.tsx`.
 *
 * Conventions (match the existing ride code):
 * - Origin on the ground, directly under the middle of the wheelbase.
 * - The bike faces +Z (same +Z-forward convention as the track code).
 * - Wheelbase 1.4 (axles at z = +0.70 / -0.70), ~2.1 long, seat top ~0.8.
 * - Wheel spin is rotation.x on each wheel group (wheels live in the YZ plane).
 * - Steering turns a pivot whose local Y is the (raked) fork axis.
 *
 * ----------------------------------------------------------------------------
 * PHASE 2 — black/graphite livery, canvas-drawn branding, live customization
 * ----------------------------------------------------------------------------
 * - One `PALETTE` constant at the top owns every color; edit it to reskin.
 * - All logos/plates/stripes are CanvasTextures drawn at runtime (plus an
 *   optional `options.logoUrl` to load your own badge image instead).
 * - `setBikeColors(bike, {...})` recolors paint/trim/wheels/seat at runtime.
 * - `setBikeLogo(bike, imageUrl)` swaps the badge texture at runtime.
 * - Phase 1 API is unchanged: `createMotorcycle`, `updateMotorcycle`,
 *   `disposeMotorcycle` and every `userData` name behave exactly as before
 *   (only additions: `mats`, `logoMats`, `badgeTexture`).
 *
 * SUPPLYING YOUR OWN LOGO (3-line note):
 * 1. Export a PNG with transparency, square, 512x512 recommended.
 * 2. Pass it as `createMotorcycle({ logoUrl: '/my-logo.png' })`, or call
 *    `setBikeLogo(bike, '/my-logo.png')` later to hot-swap it.
 * 3. It replaces the generated triangle badge everywhere (tank, engine,
 *    headlight); text plates (SPEED T4 / tail) are unaffected.
 *
 * LIVE COLOR-PICKER EXAMPLE (plain HTML, no dependencies):
 *
 * ```html
 * <input type="color" id="pick-body" value="#1a1a20" />
 * <input type="color" id="pick-accent" value="#c7c9d1" />
 * <script type="module">
 *   import { setBikeColors } from './motorcycle.js';
 *   const $ = (id) => document.getElementById(id);
 *   const apply = () => setBikeColors(bike, {
 *     body: Number.parseInt($('pick-body').value.slice(1), 16),
 *     accent: Number.parseInt($('pick-accent').value.slice(1), 16),
 *   });
 *   $('pick-body').addEventListener('input', apply);
 *   $('pick-accent').addEventListener('input', apply);
 * </script>
 * ```
 *
 * SHORT USAGE EXAMPLE (plain Three.js):
 *
 * ```ts
 * import * as THREE from 'three';
 * import { createMotorcycle, updateMotorcycle } from './motorcycle';
 *
 * const scene = new THREE.Scene();
 * scene.background = new THREE.Color(0x04050d);
 *
 * const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
 * camera.position.set(2.6, 1.6, 3.2);
 * camera.lookAt(0, 0.6, 0);
 *
 * const renderer = new THREE.WebGLRenderer({ antialias: true });
 * renderer.setSize(innerWidth, innerHeight);
 * renderer.shadowMap.enabled = true;
 * renderer.shadowMap.type = THREE.PCFSoftShadowMap;
 * document.body.appendChild(renderer.domElement);
 *
 * scene.add(new THREE.HemisphereLight(0xbdd0ff, 0x1a1410, 0.7));
 * const sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
 * sun.position.set(3, 6, 2);
 * sun.castShadow = true;
 * sun.shadow.mapSize.set(2048, 2048);
 * scene.add(sun);
 *
 * const ground = new THREE.Mesh(
 *   new THREE.PlaneGeometry(30, 30),
 *   new THREE.MeshStandardMaterial({ color: 0x0c0e1c, roughness: 0.95 }),
 * );
 * ground.rotation.x = -Math.PI / 2;
 * ground.receiveShadow = true;
 * scene.add(ground);
 *
 * const bike = createMotorcycle({ logoUrl: '/my-logo.png', plateText: 'MY-BIKE' });
 * scene.add(bike);
 *
 * const clock = new THREE.Clock();
 * let steer = 0;
 * renderer.setAnimationLoop(() => {
 *   const delta = Math.min(clock.getDelta(), 1 / 20);
 *   steer = Math.sin(clock.elapsedTime * 0.6) * 0.25; // demo weave
 *   updateMotorcycle(bike, 8, steer, delta);          // 8 units/s cruise
 *   renderer.render(scene, camera);
 * });
 * ```
 *
 * SWAPPING IT FOR THE BICYCLE (`src/components/canvas/Bike.tsx`):
 *
 * ```tsx
 * import { createMotorcycle, updateMotorcycle } from '../../lib/motorcycle';
 *
 * // inside the component (memoised once):
 * const bike = useMemo(() => createMotorcycle({ scale: BIKE_MODEL_SCALE }), []);
 * useEffect(() => () => disposeMotorcycle(bike), [bike]);
 *
 * // inside the existing useFrame, after positioning the root group:
 * const steerAngle = THREE.MathUtils.clamp(-pose.curvature * 0.4, -0.4, 0.4);
 * updateMotorcycle(bike, ride.speed, steerAngle, dt);
 *
 * // render:
 * <primitive object={bike} />
 * ```
 *
 * Three constants elsewhere still assume bicycle proportions — update them:
 * - `WHEEL_RADIUS` (Bike.tsx, 0.62) -> front 0.335 / rear 0.327 (stored on
 *   `bike.userData.frontWheelRadius` / `rearWheelRadius`).
 * - Rear-wheel contact offset -0.95 (BikeEffects `sampleBikeFrame`, DUST origin)
 *   -> -0.70. The headlight effect already follows the bike root.
 */

import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/* PHASE 2 — palette: every livery color in one editable place                */
/* -------------------------------------------------------------------------- */

/**
 * The black/graphite Speed T4 livery. Edit these hexes to reskin the whole
 * bike; `setBikeColors` overrides the big four (tank/panels, trim, wheels,
 * seat) at runtime without touching this table.
 *
 * The blacks sit slightly above pure black on purpose: under the night
 * lighting the scene uses, sub-0x14 tones crush into one silhouette and the
 * tank, frame, tires and seat stop reading as separate parts.
 */
export const PALETTE = {
  /** Tank + side panels + tail cowl (glossy, clearcoat — see paint). */
  tank: 0x1a1a20,
  /** Tank stripe, trim, badges, instrument glass (brushed silver). */
  silver: 0xc7c9d1,
  /** Engine block + covers (matte black). */
  engine: 0x1a1a1e,
  /** Cylinder cooling fins (brushed silver). */
  fins: 0xb8bcc4,
  /** Frame, subframe, grab rail, crash guard, fork lowers (black). */
  frame: 0x1c1c21,
  /** Wheel rims + spokes (black alloy). */
  alloy: 0x26262b,
  /** Tires (near-black rubber). */
  tire: 0x17171a,
  /** Front fender (dark grey, matte). */
  fender: 0x4a4a52,
  /** Seat hide (near-black leather). */
  seat: 0x19191d,
  /** Exhaust header + muffler (brushed steel). */
  exhaust: 0xa9adb5,
  /** Front rim stripe (reflective white). */
  stripe: 0xffffff,
  /** "T4" accent on the side plates. */
  plateRed: 0xd0202a,
} as const;

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export interface MotorcycleOptions {
  /** Glossy graphite paint for the tank, tail and side panels. */
  bodyColor?: number;
  /** Brushed-silver trim: fins, exhaust, stripes, badges. */
  accentColor?: number;
  /** Uniform scale applied to the root group. */
  scale?: number;
  /* ---------------- PHASE 2 additions (all optional) ---------------- */
  /** Custom badge image URL — replaces the generated triangle everywhere. */
  logoUrl?: string;
  /** Tail number-plate text (default 'MY-BIKE'). */
  plateText?: string;
  /** Optional small owner text drawn on both tank flanks. */
  riderName?: string;
}

/** Subset of materials `setBikeColors` can retint at runtime. */
export interface BikeMaterials {
  paint: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  silver: THREE.MeshStandardMaterial;
  fins: THREE.MeshStandardMaterial;
  alloy: THREE.MeshStandardMaterial;
  seat: THREE.MeshStandardMaterial;
}

/** Runtime color overrides; every field is optional. */
export interface BikeColorOverrides {
  body?: number;
  accent?: number;
  wheels?: number;
  seat?: number;
}

/** Named nodes exposed for animation, effects and camera work. */
export interface MotorcycleUserData {
  /** Spin group of the 19" front wheel (rotation.x). */
  frontWheel: THREE.Group;
  /** Spin group of the 17" rear wheel (rotation.x). */
  rearWheel: THREE.Group;
  /** Steering assembly: bars + fork + front wheel (rotation.y). */
  handlebar: THREE.Group;
  /** Alias of `handlebar` — the raked steering pivot. */
  steer: THREE.Group;
  /** The telescopic fork (child of the steering pivot). */
  fork: THREE.Group;
  /** The glowing headlight bucket (for lens-flare / light effects). */
  headlight: THREE.Group;
  /** The red tail-light bucket. */
  taillight: THREE.Group;
  /** Both wheel spin groups, in [front, rear] order. */
  wheelGroups: [THREE.Group, THREE.Group];
  /** Inner body group that carries the steering lean (rotation.z). */
  body: THREE.Group;
  /** Rolling radius of each wheel, for speed -> angular velocity. */
  frontWheelRadius: number;
  rearWheelRadius: number;
  /* ---------------- PHASE 2 additions ---------------- */
  /** Shared material set, so `setBikeColors` can retint without traversal. */
  mats: BikeMaterials;
  /** Decal materials showing the badge — `setBikeLogo` swaps their maps. */
  logoMats: THREE.MeshStandardMaterial[];
  /** The currently installed badge texture (generated or custom). */
  badgeTexture: THREE.Texture | null;
  [key: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Dimensions (Speed T4 proportions, stylized)                                 */
/* -------------------------------------------------------------------------- */

/** Front 19" rim — the larger of the pair (19:17 ratio vs the rear). */
const FRONT_RIM = 0.27;
/** Rear 17" rim. */
const REAR_RIM = 0.242;
const FRONT_TIRE_TUBE = 0.055;
/** Rear tire is slightly wider than the front. */
const REAR_TIRE_TUBE = 0.075;
/** Tire carcass ring sits just outside the rim edge. */
const TIRE_BEAD = 0.01;
/** Rolling (outer) radius = bead ring + tube. Axles sit exactly this high. */
const FRONT_OUTER = FRONT_RIM + TIRE_BEAD + FRONT_TIRE_TUBE; // 0.335
const REAR_OUTER = REAR_RIM + TIRE_BEAD + REAR_TIRE_TUBE; // 0.327
/** Axle positions: 1.4 wheelbase, origin mid-way, bike faces +Z. */
const FRONT_Z = 0.7;
const REAR_Z = -0.7;
/** Fork rake from vertical — gives the chopper-ish roadster stance. */
const RAKE = THREE.MathUtils.degToRad(24);
/** Distance from the headstock pivot down the fork axis to the front axle. */
const FORK_LENGTH = 0.72;
/** Handlebar half-width. */
const BAR_HALF_WIDTH = 0.31;
/** Default tail-plate text when `options.plateText` is absent. */
const DEFAULT_PLATE_TEXT = 'MY-BIKE';

/* -------------------------------------------------------------------------- */
/* Small builders                                                              */
/* -------------------------------------------------------------------------- */

/** Flags a mesh for the shadow pass. Chained so builds stay declarative. */
function sh<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A cylinder strut between two points — frame tubes, stalks, levers, stand.
 * `rTop`/`rBottom` allow tapered tubes (muffler, fork shrouds).
 */
function tube(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  radius: number,
  material: THREE.Material,
  radialSegments = 10,
  rTop?: number,
): THREE.Mesh {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geo = new THREE.CylinderGeometry(rTop ?? radius, radius, length, radialSegments);
  const mesh = sh(new THREE.Mesh(geo, material));
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

/** Shorthand for a shadowed box mesh. */
function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
  mesh.position.set(x, y, z);
  return mesh;
}

/* -------------------------------------------------------------------------- */
/* PHASE 2 — canvas texture studio (no external image files)                   */
/* -------------------------------------------------------------------------- */

/*
 * Every texture below is drawn at runtime on a 2D canvas. That keeps the
 * module fully self-contained (nothing to download, nothing to license) while
 * still giving real badges, plates and surface variation.
 *
 * Headless guard: unit tests run in Node with no DOM. `canvas2d` returns null
 * there, every `make*Texture` returns null with it, and the builders skip
 * decals/maps gracefully — geometry, animation and disposal stay testable.
 * In a browser the same code paths produce the full livery.
 */

/** False in headless/unit-test environments where canvas is unavailable. */
const CANVAS_OK: boolean =
  typeof document !== 'undefined' && typeof document.createElement === 'function';

/** A 2D drawing surface, or null headless. Caller must null-check the ctx. */
function canvas2d(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!CANVAS_OK) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

/** Wraps a drawn canvas in a color-correct texture. */
function toTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** CSS hex for a palette number, for canvas fills. */
function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/**
 * PHASE 2 — Triumph-style triangle badge, 512x512, transparent background.
 * A rounded triangle outline in silver with a stylized "T" inside. Applied as
 * a decal on the tank flanks, the engine cover and the headlight.
 */
export function makeBadgeTexture(): THREE.CanvasTexture | null {
  const surface = canvas2d(512, 512);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  const cx = 256;
  const cy = 282;
  const r = 168;

  // Rounded triangle outline: thick round-joined stroke reads as rounded.
  ctx.strokeStyle = hex(PALETTE.silver);
  ctx.lineWidth = 26;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // Stylized "T": crossbar + stem, same silver, centered in the triangle.
  ctx.fillStyle = hex(PALETTE.silver);
  ctx.fillRect(cx - 78, cy - 62, 156, 34);
  ctx.fillRect(cx - 17, cy - 62, 34, 140);

  return toTexture(canvas);
}

/**
 * PHASE 2 — tank clearcoat gradient. Luminance-only (white -> mid grey) so it
 * multiplies with any paint color: darker at the belly, a faint sheen crown.
 * Canvas top maps to the sphere top (flipY), hence the light stop first.
 */
export function makeTankGradientTexture(): THREE.CanvasTexture | null {
  const surface = canvas2d(64, 256);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffffff'); // crown sheen
  grad.addColorStop(0.35, '#f2f2f2');
  grad.addColorStop(0.75, '#c2c2c2');
  grad.addColorStop(1, '#a8a8a8'); // shaded belly, still above crush
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  return toTexture(canvas, false);
}

/**
 * PHASE 2 — tank-grip dot pattern for the knee pads. Used as a bumpMap: the
 * dots read as rubber grip nubs under grazing light.
 */
export function makeGripTexture(): THREE.CanvasTexture | null {
  const surface = canvas2d(128, 128);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  for (let y = 8; y < 128; y += 16) {
    for (let x = 8; x < 128; x += 16) {
      ctx.beginPath();
      ctx.arc(x + ((y / 16) % 2) * 8, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = toTexture(canvas, false);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/**
 * PHASE 2 — monochrome value noise, used as a roughnessMap for dust/wear
 * variation on the engine and exhaust. Green channel drives roughness.
 */
export function makeNoiseTexture(size = 256): THREE.CanvasTexture | null {
  const surface = canvas2d(size, size);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  const img = ctx.createImageData(size, size);
  // Blocky 4px cells read as patchy wear rather than per-pixel static.
  // Kept close to mid-grey so the variation stays subtle, not blotchy.
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const v = 150 + Math.floor(Math.random() * 65);
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const i = (((y + dy) * size + (x + dx)) * 4);
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = toTexture(canvas, false);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * PHASE 2 — "SPEED T4" side plate. Brushed-silver card, italic bold wordmark,
 * "T4" in Triumph red. Chrome-like via metalness on the material (set by the
 * caller), not the texture.
 */
export function makeSidePlateTexture(): THREE.CanvasTexture | null {
  const surface = canvas2d(512, 128);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  // Brushed card: vertical silver gradient + faint horizontal streaks.
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#dfe1e6');
  grad.addColorStop(0.5, '#b9bcc4');
  grad.addColorStop(1, '#d5d7dc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  for (let y = 6; y < 128; y += 7) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  // Wordmark: dark "SPEED ", red italic "T4".
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 800 64px system-ui, sans-serif';
  const speed = 'SPEED ';
  const wSpeed = ctx.measureText(speed).width;
  const wT4 = ctx.measureText('T4').width;
  const x0 = (512 - wSpeed - wT4) / 2;
  ctx.fillStyle = '#23252c';
  ctx.fillText(speed, x0, 68);
  ctx.fillStyle = hex(PALETTE.plateRed);
  ctx.fillText('T4', x0 + wSpeed, 68);
  return toTexture(canvas);
}

/**
 * PHASE 2 — tail number plate. Black card, light condensed placeholder text.
 * Pass your own `plateText` (or edit the default) — no re-export needed.
 */
export function makeTailPlateTexture(text: string = DEFAULT_PLATE_TEXT): THREE.CanvasTexture | null {
  const surface = canvas2d(512, 160);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#3a3d44';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.fillStyle = '#e8eaf0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 72px system-ui, sans-serif';
  ctx.fillText(text.slice(0, 12), 256, 84);
  return toTexture(canvas);
}

/**
 * PHASE 2 — tank crown stripe as a decal: thin silver diagonal bar on a
 * transparent ground, running rear-top toward front-bottom once placed.
 */
export function makeTankStripeTexture(): THREE.CanvasTexture | null {
  const surface = canvas2d(128, 512);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  ctx.clearRect(0, 0, 128, 512);
  ctx.fillStyle = hex(PALETTE.silver);
  ctx.save();
  ctx.translate(64, 256);
  ctx.rotate(0.42);
  ctx.fillRect(-16, -250, 32, 500);
  // Pin-stripe edges for a painted-on read.
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(-16, -250, 4, 500);
  ctx.fillRect(12, -250, 4, 500);
  ctx.restore();
  return toTexture(canvas);
}

/**
 * PHASE 2 — generic silver text decal on transparency ("TRIUMPH" knees,
 * optional rider name). Letter-spaced for the engraved look.
 */
export function makeTextDecalTexture(
  text: string,
  px = 56,
  color: string = hex(PALETTE.silver),
): THREE.CanvasTexture | null {
  const surface = canvas2d(512, 128);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${px}px system-ui, sans-serif`;
  // Manual letter-spacing: canvas has no tracking property everywhere.
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const tracking = px * 0.18;
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let x = 256 - total / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x + (widths[i] ?? 0) / 2, 66);
    x += (widths[i] ?? 0) + tracking;
  });
  return toTexture(canvas);
}

/**
 * PHASE 2 — decal plane: transparent, depth-offset against z-fighting, double-
 * sided so a mirrored placement never shows a hole. Each call owns its
 * material (they share textures, never materials) so `setBikeLogo` can retint
 * per-decal later without cross-talk.
 */
export function makeDecal(
  tex: THREE.Texture,
  width: number,
  height: number,
  metalness = 0.6,
  roughness = 0.35,
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    metalness,
    roughness,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/* -------------------------------------------------------------------------- */
/* Wheels                                                                      */
/* -------------------------------------------------------------------------- */

export interface WheelOptions {
  /** Rim (bead-seat) radius. 19:17 front:rear reads as 19"/17" wheels. */
  rimRadius: number;
  tireTube: number;
  tire: THREE.Material;
  alloy: THREE.Material;
  steel: THREE.Material;
  white: THREE.Material;
  dark: THREE.Material;
  /** Thin white rim stripe — Speed T4 signature, front wheel only. */
  rimStripe: boolean;
}

/**
 * One complete wheel in its own Group so it can spin on rotation.x.
 * Tire torus + alloy rim ring, 10 thin box spokes sharing one geometry, a small
 * hub barrel and a steel brake disc (which spins with the wheel, as it should —
 * the non-spinning caliper is placed on the fork / swingarm by the caller).
 * All parts are built in the YZ plane (axle along X) so spinning is a plain
 * rotation.x.
 *
 * PHASE 2: black alloy + near-black tires from PALETTE (passed in as
 * materials); the front stripe material carries a white emissive kick so it
 * reads as reflective tape under the headlight and street lamps.
 */
export function makeWheel(o: WheelOptions): THREE.Group {
  const wheel = new THREE.Group();
  const { rimRadius } = o;
  const tireRing = rimRadius + TIRE_BEAD;

  // Tire: torus rotated into the YZ plane.
  const tire = sh(new THREE.Mesh(new THREE.TorusGeometry(tireRing, o.tireTube, 12, 30), o.tire));
  tire.rotation.y = Math.PI / 2;
  wheel.add(tire);

  // Alloy rim ring.
  const rim = sh(new THREE.Mesh(new THREE.TorusGeometry(rimRadius, 0.028, 8, 24), o.alloy));
  rim.rotation.y = Math.PI / 2;
  wheel.add(rim);

  // Thin reflective rim stripe (front wheel signature detail).
  if (o.rimStripe) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(rimRadius + 0.012, 0.008, 6, 28), o.white);
    stripe.rotation.y = Math.PI / 2;
    wheel.add(stripe);
  }

  // 10 thin spokes — one shared geometry, rotated around the X (axle) axis.
  const spokeLength = rimRadius * 0.95;
  const spokeGeo = new THREE.BoxGeometry(0.016, spokeLength, 0.03);
  for (let i = 0; i < 10; i++) {
    const spoke = sh(new THREE.Mesh(spokeGeo, o.alloy));
    const angle = (i / 10) * Math.PI * 2;
    spoke.position.set(0, Math.cos(angle) * spokeLength * 0.5, Math.sin(angle) * spokeLength * 0.5);
    spoke.rotation.x = -angle;
    wheel.add(spoke);
  }

  // Hub barrel along the axle.
  const hub = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12), o.dark));
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  // Brake disc: steel, spins with the wheel like the real floater.
  const discRadius = rimRadius * 0.6;
  const disc = sh(
    new THREE.Mesh(new THREE.CylinderGeometry(discRadius, discRadius, 0.018, 24), o.steel),
  );
  disc.rotation.z = Math.PI / 2;
  disc.position.x = 0.035;
  wheel.add(disc);

  // Drilled lightening holes: dark dots on the steel disc. The asymmetric
  // pattern makes rotation readable at a glance — a plain disc spinning looks
  // identical parked, which is why "the tires don't rotate" gets reported
  // even when the angular velocity is correct.
  const holeGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.024, 10);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.3;
    const hole = new THREE.Mesh(holeGeo, o.dark);
    hole.rotation.z = Math.PI / 2;
    hole.position.set(0.035, Math.cos(angle) * discRadius * 0.55, Math.sin(angle) * discRadius * 0.55);
    wheel.add(hole);
  }

  // Valve stem: one bright nub on the rim, pointing radially outward — the
  // unambiguous spin marker.
  const valve = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), o.steel));
  valve.position.set(0, rimRadius + 0.01, 0);
  wheel.add(valve);

  return wheel;
}

/**
 * Brake caliper block. Deliberately NOT part of `makeWheel`: it bolts to the
 * fork / swingarm and must never spin. Positioned by the caller at the disc,
 * trailing the leg.
 */
export function makeCaliper(dark: THREE.Material): THREE.Mesh {
  return box(0.05, 0.09, 0.06, dark);
}

/* -------------------------------------------------------------------------- */
/* Engine + frame                                                              */
/* -------------------------------------------------------------------------- */

interface EngineMats {
  crank: THREE.Material;
  steel: THREE.Material;
  silver: THREE.Material;
  dark: THREE.Material;
}

/**
 * Single-cylinder 400cc: matte-black crankcase block (PHASE 2: noise wear in
 * the roughnessMap, carried on the crank material), a forward-leaning barrel
 * wrapped in seven brushed-silver cooling fins, and a finned cam cover on top.
 * The cover badge is a canvas decal now (added in `addDecals`), replacing the
 * old 3-sided prism — crisper at every distance, and swappable via logoUrl.
 *
 * The barrel runs slightly oversized for its bay — the fins peek past the
 * tank flanks so the single reads at chase distance instead of hiding.
 */
export function makeEngine(m: EngineMats): THREE.Group {
  const engine = new THREE.Group();

  // Crankcase block.
  engine.add(box(0.3, 0.3, 0.42, m.crank, 0, 0.38, 0.02));
  // Sump chin below the cases.
  engine.add(box(0.22, 0.1, 0.3, m.dark, 0, 0.2, 0.02));

  // Cylinder barrel leaning slightly forward (+Z), wrapped in cooling fins.
  const barrel = box(0.23, 0.34, 0.23, m.crank, 0, 0.63, 0.1);
  barrel.rotation.x = 0.12;
  engine.add(barrel);
  const finGeo = new THREE.BoxGeometry(0.34, 0.02, 0.34);
  for (let i = 0; i < 7; i++) {
    const fin = sh(new THREE.Mesh(finGeo, m.steel));
    fin.position.set(0, 0.52 + i * 0.046, 0.1 - i * 0.008);
    fin.rotation.x = 0.12;
    engine.add(fin);
  }
  // Cam cover caps the stack.
  const cover = box(0.2, 0.08, 0.22, m.silver, 0, 0.845, 0.05);
  cover.rotation.x = 0.12;
  engine.add(cover);

  return engine;
}

interface FrameMats {
  black: THREE.Material;
  silver: THREE.Material;
}

/**
 * Black cradle (PHASE 2: 0x0d0d0f powder-coat): headstock tube on the steering
 * axis, a black backbone to the tail, twin silver downtubes hugging the
 * engine, and a swingarm pair running back to the rear axle.
 */
export function makeFrame(m: FrameMats, headstock: THREE.Vector3): THREE.Group {
  const frame = new THREE.Group();

  // Headstock: short fat tube along the fork axis at the steering pivot.
  const axis = new THREE.Vector3(0, -Math.cos(RAKE), Math.sin(RAKE));
  const top = headstock.clone().addScaledVector(axis, -0.09);
  const bottom = headstock.clone().addScaledVector(axis, 0.09);
  const topArr: [number, number, number] = [top.x, top.y, top.z];
  const bottomArr: [number, number, number] = [bottom.x, bottom.y, bottom.z];
  frame.add(tube(topArr, bottomArr, 0.055, m.silver, 12));

  // Backbone: headstock top back to the tail.
  frame.add(tube([0, 0.92, 0.34], [0, 0.78, -0.62], 0.04, m.black));
  // Twin downtubes: headstock bottom around the engine to the rear mounts.
  for (const side of [-1, 1]) {
    frame.add(tube([side * 0.07, 0.88, 0.38], [side * 0.14, 0.3, 0.18], 0.028, m.silver));
    frame.add(tube([side * 0.14, 0.3, 0.18], [side * 0.11, 0.32, -0.5], 0.028, m.silver));
  }
  // Subframe pair up to the tail cowl.
  for (const side of [-1, 1]) {
    frame.add(tube([side * 0.08, 0.76, -0.35], [side * 0.07, 0.82, -0.72], 0.02, m.black));
  }
  // Swingarm pair to the rear axle.
  for (const side of [-1, 1]) {
    frame.add(tube([side * 0.1, 0.32, -0.25], [side * 0.07, REAR_OUTER, REAR_Z], 0.03, m.black));
  }
  // Rear shock: chrome spring hint from swingarm to subframe.
  frame.add(tube([0.11, 0.34, -0.42], [0.09, 0.72, -0.52], 0.025, m.silver));

  return frame;
}

/* -------------------------------------------------------------------------- */
/* Tank + seat + tail                                                          */
/* -------------------------------------------------------------------------- */

interface BodyMats {
  paint: THREE.Material;
  silver: THREE.Material;
  leather: THREE.Material;
  dark: THREE.Material;
  red: THREE.Material;
  /* ---------------- PHASE 2 additions (optional: fall back gracefully) ----- */
  /** Knee-pad rubber with a grip bumpMap; falls back to `dark`. */
  pad?: THREE.Material;
  /** Seat stitching thread; falls back to `dark`. */
  stitch?: THREE.Material;
}

/**
 * Sculpted tank: scaled sphere in clearcoat physical paint (PHASE 2) with a
 * gradient map baked into the material, fuel cap, and grippy knee pads.
 * Stripes, badges and lettering are decals — see `addDecals`.
 */
export function makeTank(m: BodyMats): THREE.Group {
  const tank = new THREE.Group();

  const shell = sh(new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), m.paint));
  shell.scale.set(0.82, 0.62, 1.25);
  shell.position.set(0, 0.8, 0.1);
  tank.add(shell);

  // Fuel cap.
  const cap = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), m.dark));
  cap.position.set(0, 0.925, 0.16);
  tank.add(cap);

  // Rubber knee pads with a dotted grip bump, hugging both flanks.
  const padMat = m.pad ?? m.dark;
  for (const side of [-1, 1]) {
    const pad = sh(new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), padMat));
    pad.scale.set(0.35, 0.7, 1.1);
    pad.position.set(side * 0.15, 0.76, 0.02);
    tank.add(pad);
  }

  return tank;
}

/**
 * Long flat ribbed bench rising slightly toward the rear, an upswept tail
 * cowl, a grab-rail loop and a red tail light.
 *
 * PHASE 2: light stitching threads replace the old dark grooves; the tail
 * lamp is a thin red LED strip; an optional number-plate decal faces rear.
 */
export function makeSeatTail(m: BodyMats, plateTex: THREE.Texture | null = null): THREE.Group {
  const tail = new THREE.Group();

  // Bench base, nose low at the tank, tail kicked up.
  const seat = box(0.24, 0.08, 0.6, m.leather, 0, 0.79, -0.42);
  seat.rotation.x = -0.06;
  tail.add(seat);

  // Stitching: five light threads across the hide (thin bars on the top).
  const stitchMat = m.stitch ?? m.dark;
  const ribGeo = new THREE.BoxGeometry(0.22, 0.008, 0.016);
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(ribGeo, stitchMat);
    rib.position.set(0, 0.833 + i * 0.007, -0.28 - i * 0.09);
    rib.rotation.x = -0.06;
    tail.add(rib);
  }

  // Short upswept tail cowl in body paint.
  const cowl = box(0.2, 0.09, 0.26, m.paint, 0, 0.85, -0.78);
  cowl.rotation.x = -0.22;
  tail.add(cowl);

  // Grab-rail loop behind the cowl.
  const rail = sh(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 20, Math.PI), m.dark));
  rail.position.set(0, 0.86, -0.9);
  rail.rotation.y = Math.PI / 2;
  rail.rotation.z = Math.PI;
  tail.add(rail);

  // Tail light: thin red LED strip + bracket, facing rear (-Z).
  const lampGroup = new THREE.Group();
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.02), m.red);
  lamp.position.set(0, 0.825, -0.918);
  lampGroup.add(lamp);
  lampGroup.add(box(0.06, 0.04, 0.06, m.dark, 0, 0.79, -0.89));
  tail.add(lampGroup);
  tail.userData.lamp = lampGroup;

  // Number plate below the strip (skipped headless — no canvas, no plate).
  if (plateTex) {
    const plate = makeDecal(plateTex, 0.15, 0.047, 0.4, 0.6);
    plate.position.set(0, 0.762, -0.9);
    plate.rotation.y = Math.PI;
    tail.add(plate);
  }

  return tail;
}

/* -------------------------------------------------------------------------- */
/* Front end: fork, bars, headlight, fender                                    */
/* -------------------------------------------------------------------------- */

interface FrontMats {
  gold: THREE.Material;
  dark: THREE.Material;
  steel: THREE.Material;
  paint: THREE.Material;
  lens: THREE.Material;
  rubber: THREE.Material;
  /* ---------------- PHASE 2 additions (optional: fall back gracefully) ----- */
  /** Matte dark-grey fender; falls back to `paint`. */
  fender?: THREE.Material;
  /** Smoked lens glass behind the DRL ring; falls back to `lens`. */
  glass?: THREE.Material;
}

/**
 * Builds the steering assembly. `forkPivot` sits at the headstock with its
 * local Y aligned to the fork axis; `steer` (the returned group's child) yaws
 * on that axis. Fork legs, fender, headlight, bars and the front wheel all
 * hang off `steer` so they turn as one — like the real triple-tree.
 *
 * PHASE 2: matte-grey fender, ring-shaped LED DRL (torus + emissive) over a
 * smoked lens, headlight badge decal mount point (added in `addDecals`).
 */
export function makeFrontEnd(
  m: FrontMats,
  headstock: THREE.Vector3,
  frontWheel: THREE.Group,
): { pivot: THREE.Group; steer: THREE.Group; fork: THREE.Group; headlight: THREE.Group } {
  const pivot = new THREE.Group();
  pivot.position.copy(headstock);
  pivot.rotation.x = -RAKE; // local Y now runs down the fork axis

  const steer = new THREE.Group();
  pivot.add(steer);

  const fork = new THREE.Group();
  steer.add(fork);

  // Telescopic legs: gold uppers sliding into black lowers.
  for (const side of [-1, 1]) {
    fork.add(tube([side * 0.07, 0.06, 0], [side * 0.07, -0.38, 0], 0.026, m.gold, 12));
    fork.add(tube([side * 0.07, -0.36, 0], [side * 0.07, -FORK_LENGTH, 0], 0.032, m.dark, 12));
  }
  // Triple clamps tying the legs together.
  fork.add(box(0.2, 0.04, 0.08, m.dark, 0, 0.02, 0));
  fork.add(box(0.2, 0.035, 0.08, m.dark, 0, -0.3, 0));

  // Front fender: an open arc hugging the tire (fork-mounted, so it rakes too).
  const fenderGeo = new THREE.CylinderGeometry(
    FRONT_OUTER + 0.045,
    FRONT_OUTER + 0.045,
    0.14,
    14,
    1,
    true,
    Math.PI * 0.15,
    Math.PI * 0.7,
  );
  const fender = sh(new THREE.Mesh(fenderGeo, m.fender ?? m.paint));
  fender.rotation.z = Math.PI / 2; // axis along X (axle direction)
  fender.position.set(0, -FORK_LENGTH, 0);
  fork.add(fender);

  // Front wheel hangs off the fork bottoms (axle along X). The steering pivot
  // is raked, but a wheel must stay vertical — counter-tilt the wheel group by
  // +RAKE so the net orientation is upright. `updateMotorcycle` accumulates
  // spin on top of this base angle via the same rotation.x channel.
  frontWheel.position.set(0, -FORK_LENGTH, 0);
  frontWheel.rotation.x = RAKE;
  steer.add(frontWheel);

  // Front brake caliper: bolted to the fork leg at the disc, trailing it.
  // Fork-local placement of the wheel-space disc offset (Rx(RAKE) un-tilt).
  const caliper = makeCaliper(m.dark);
  const discOffset = new THREE.Vector3(0.035, 0.072, -0.1).applyEuler(new THREE.Euler(RAKE, 0, 0));
  caliper.position.set(discOffset.x, -FORK_LENGTH + discOffset.y, discOffset.z);
  fork.add(caliper);

  // Round LED headlight: dark bucket, smoked lens, emissive DRL ring.
  const headlight = new THREE.Group();
  const bucket = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.1, 18), m.dark));
  bucket.rotation.x = Math.PI / 2 - 0.1;
  headlight.add(bucket);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.078, 18, 14), m.glass ?? m.lens);
  lens.scale.set(1, 1, 0.45);
  lens.position.set(0, 0.008, 0.045);
  headlight.add(lens);
  // DRL ring: the signature round LED halo, floating just off the lens.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 8, 28), m.lens);
  ring.position.set(0, 0.008, 0.075);
  headlight.add(ring);
  const brow = box(0.05, 0.02, 0.1, m.dark, 0, -0.05, -0.06);
  headlight.add(brow);
  headlight.position.set(0, -0.12, 0.1);
  steer.add(headlight);

  // Wide flat handlebar: risers, bar, grips, levers, mirrors, instrument pod.
  const bars = new THREE.Group();
  bars.add(tube([-0.05, 0.1, -0.02], [-0.05, 0.2, -0.05], 0.02, m.dark));
  bars.add(tube([0.05, 0.1, -0.02], [0.05, 0.2, -0.05], 0.02, m.dark));
  const barTube = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, BAR_HALF_WIDTH * 2, 10), m.steel));
  barTube.rotation.z = Math.PI / 2;
  barTube.position.set(0, 0.2, -0.05);
  bars.add(barTube);
  for (const side of [-1, 1]) {
    // Rubber grip.
    const grip = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 10), m.rubber));
    grip.rotation.z = Math.PI / 2;
    grip.position.set(side * (BAR_HALF_WIDTH - 0.065), 0.2, -0.05);
    bars.add(grip);
    // Brake/clutch lever blade angling forward.
    const lever = box(0.012, 0.015, 0.14, m.steel, side * (BAR_HALF_WIDTH - 0.05), 0.185, 0.04);
    lever.rotation.y = side * -0.25;
    bars.add(lever);
    // Round mirror on a stalk.
    bars.add(tube([side * 0.2, 0.2, -0.05], [side * 0.24, 0.34, -0.08], 0.008, m.dark, 8));
    const mirror = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16), m.dark));
    mirror.rotation.x = Math.PI / 2 - 0.3;
    mirror.position.set(side * 0.245, 0.36, -0.08);
    bars.add(mirror);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), m.steel);
    glass.position.set(side * 0.245, 0.365, -0.068);
    glass.rotation.x = -0.3;
    bars.add(glass);
  }
  // Round single-pod instrument cluster facing the rider.
  const pod = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.05, 16), m.dark));
  pod.rotation.x = Math.PI / 2 - 0.5;
  pod.position.set(0, 0.24, -0.02);
  bars.add(pod);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), m.lens);
  face.position.set(0, 0.262, -0.038);
  face.rotation.x = -0.5 + Math.PI;
  face.rotation.y = Math.PI;
  bars.add(face);
  bars.position.set(0, 0, 0.02);
  steer.add(bars);

  return { pivot, steer, fork, headlight };
}

/* -------------------------------------------------------------------------- */
/* Exhaust, stand, crash guard, side panels                                    */
/* -------------------------------------------------------------------------- */

interface RearMats {
  steel: THREE.Material;
  dark: THREE.Material;
  paint: THREE.Material;
  silver: THREE.Material;
}

/**
 * Low header sweeping back into a slim upswept muffler on the right (+X).
 * PHASE 2: brushed-steel material carries the wear-noise roughnessMap
 * (assigned in `createMotorcycle`), so the pipe reads road-used, not chrome.
 *
 * Deliberately slim: a fat silencer reads as a second engine cylinder next
 * to the barrel. Tucked inboard and low, it sits in the exhaust's visual
 * lane rather than competing with the single.
 */
export function makeExhaust(m: RearMats): THREE.Group {
  const exhaust = new THREE.Group();

  // Header: a brushed-steel tube curving down from the exhaust port.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 0.62, 0.24),
    new THREE.Vector3(0.1, 0.42, 0.3),
    new THREE.Vector3(0.14, 0.26, 0.1),
    new THREE.Vector3(0.155, 0.25, -0.27),
  ]);
  exhaust.add(sh(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.032, 10), m.steel)));

  // Muffler: short, slim, tapered and kicked up at the tail.
  const muffler = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.38, 16), m.steel));
  muffler.rotation.x = Math.PI / 2 + 0.18;
  muffler.position.set(0.155, 0.285, -0.48);
  exhaust.add(muffler);
  // Dark outlet tip.
  const tip = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 14), m.dark));
  tip.rotation.x = Math.PI / 2 + 0.18;
  tip.position.set(0.155, 0.323, -0.68);
  exhaust.add(tip);
  // Clamp band where header meets muffler.
  const clamp = sh(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 18), m.dark));
  clamp.position.set(0.155, 0.268, -0.2);
  clamp.rotation.x = 0.18;
  exhaust.add(clamp);

  return exhaust;
}

/** Sidestand on the left + a black crash-guard loop around the engine. */
export function makeStandAndGuard(m: RearMats): THREE.Group {
  const group = new THREE.Group();

  // Sidestand: angled leg with a small foot, parked deployed.
  group.add(tube([-0.12, 0.28, -0.05], [-0.24, 0.0, -0.12], 0.018, m.dark, 8));
  group.add(box(0.08, 0.02, 0.05, m.dark, -0.25, 0.01, -0.12));

  // Crash guard: a flattened torus loop hugging the crankcase.
  const guard = sh(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 8, 24), m.dark));
  guard.scale.set(1, 1.15, 1);
  guard.position.set(0, 0.4, 0.05);
  group.add(guard);
  for (const side of [-1, 1]) {
    group.add(tube([side * 0.1, 0.3, 0.05], [side * 0.2, 0.4, 0.05], 0.015, m.dark, 8));
  }

  return group;
}

/**
 * Dark side covers under the seat.
 *
 * PHASE 2: the blank badge plate is now a chrome "SPEED T4" card (canvas
 * texture, metalness 0.9). Without canvas (headless tests) it falls back to
 * the plain silver plate, so geometry counts stay stable everywhere.
 */
export function makeSidePanels(m: RearMats, plateTex: THREE.Texture | null = null): THREE.Group {
  const panels = new THREE.Group();
  for (const side of [-1, 1]) {
    const cover = box(0.03, 0.16, 0.4, m.paint, side * 0.14, 0.62, -0.42);
    cover.rotation.x = -0.05;
    panels.add(cover);
    if (plateTex) {
      const plate = makeDecal(plateTex, 0.17, 0.042, 0.9, 0.32);
      plate.position.set(side * 0.158, 0.63, -0.42);
      plate.rotation.y = side * (Math.PI / 2);
      plate.rotation.z = -0.05;
      panels.add(plate);
    } else {
      const plate = sh(new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.035), m.silver));
      plate.position.set(side * 0.158, 0.63, -0.42);
      plate.rotation.y = side * (Math.PI / 2);
      plate.rotation.z = -0.05;
      panels.add(plate);
    }
  }
  return panels;
}

/* -------------------------------------------------------------------------- */
/* PHASE 2 — livery decals (badges, lettering, stripes, plates)                */
/* -------------------------------------------------------------------------- */

interface DecalSet {
  badge: THREE.CanvasTexture | null;
  stripe: THREE.CanvasTexture | null;
  triumph: THREE.CanvasTexture | null;
  rider: THREE.CanvasTexture | null;
}

/**
 * Places every canvas-drawn decal in body space. Each badge decal material is
 * registered on `logoMats` so `setBikeLogo` can hot-swap the badge texture;
 * text plates keep their own maps and are untouched by logo swaps.
 * Skipped wholesale headless (no canvas → no decals, geometry-only bike).
 */
function addDecals(
  body: THREE.Group,
  headlight: THREE.Group,
  tex: DecalSet,
  logoMats: THREE.MeshStandardMaterial[],
): void {
  // Tank badges: upper front flank, both sides.
  if (tex.badge) {
    for (const side of [-1, 1]) {
      const badge = makeDecal(tex.badge, 0.11, 0.11, 0.7, 0.3);
      badge.position.set(side * 0.148, 0.855, 0.2);
      badge.rotation.y = side * 1.15;
      body.add(badge);
      logoMats.push(badge.material as THREE.MeshStandardMaterial);
    }
    // Engine cover badges, both sides of the crankcase.
    for (const side of [-1, 1]) {
      const badge = makeDecal(tex.badge, 0.1, 0.1, 0.7, 0.3);
      badge.position.set(side * 0.152, 0.4, 0.02);
      badge.rotation.y = side * (Math.PI / 2);
      body.add(badge);
      logoMats.push(badge.material as THREE.MeshStandardMaterial);
    }
    // Small badge on the headlight brow (steers with the bars).
    const nose = makeDecal(tex.badge, 0.045, 0.045, 0.7, 0.3);
    nose.position.set(0, -0.048, 0.068);
    nose.rotation.x = -0.1;
    headlight.add(nose);
    logoMats.push(nose.material as THREE.MeshStandardMaterial);
  }

  // Tank crown stripe: rear-top toward front-bottom diagonal.
  if (tex.stripe) {
    const stripeGeo = new THREE.PlaneGeometry(0.055, 0.36);
    stripeGeo.rotateX(-Math.PI / 2); // lie flat on the crown…
    stripeGeo.rotateY(0.45); // …then skew into the diagonal
    const stripe = new THREE.Mesh(
      stripeGeo,
      new THREE.MeshStandardMaterial({
        map: tex.stripe,
        transparent: true,
        metalness: 0.85,
        roughness: 0.3,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    stripe.position.set(0.015, 0.927, 0.1);
    body.add(stripe);
  }

  // "TRIUMPH" across both knee pads.
  if (tex.triumph) {
    for (const side of [-1, 1]) {
      const text = makeDecal(tex.triumph, 0.1, 0.025, 0.5, 0.5);
      text.position.set(side * 0.184, 0.76, 0.02);
      text.rotation.y = side * (Math.PI / 2);
      body.add(text);
    }
  }

  // Optional owner text beneath the tank badges.
  if (tex.rider) {
    for (const side of [-1, 1]) {
      const text = makeDecal(tex.rider, 0.1, 0.025, 0.5, 0.5);
      text.position.set(side * 0.15, 0.782, 0.2);
      text.rotation.y = side * 1.15;
      body.add(text);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds the whole Speed T4 roadster. Origin on the ground mid-wheelbase,
 * facing +Z. All meshes cast + receive shadows; the returned group carries
 * the animated nodes on `userData` (see `MotorcycleUserData`).
 *
 * PHASE 2: palette-driven materials (clearcoat paint, wear maps, grip bump),
 * canvas livery, optional custom logo / plate text / rider name.
 */
export function createMotorcycle(options: MotorcycleOptions = {}): THREE.Group {
  const {
    bodyColor = PALETTE.tank,
    accentColor = PALETTE.silver,
    scale = 1,
    logoUrl,
    plateText = DEFAULT_PLATE_TEXT,
    riderName,
  } = options;

  // -- PHASE 2 textures (null headless — builders degrade gracefully) ---------
  const badgeTex = makeBadgeTexture();
  const tankGradTex = makeTankGradientTexture();
  const gripTex = makeGripTexture();
  const wearTex = makeNoiseTexture();
  const plateSideTex = makeSidePlateTexture();
  const plateTailTex = makeTailPlateTexture(plateText);
  const stripeTex = makeTankStripeTexture();
  const triumphTex = makeTextDecalTexture('TRIUMPH', 60);
  const riderTex = riderName ? makeTextDecalTexture(riderName.toUpperCase(), 52) : null;

  // -- Materials (one set per bike; shared by every part of that bike) -------
  // PHASE 2: physical clearcoat paint over a gradient map; wear noise on the
  // hard-working metals; grip bump on the knee rubber.
  const paint = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    metalness: 0.7,
    roughness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    map: tankGradTex ?? undefined,
  });
  const silver = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.9, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({
    color: PALETTE.exhaust,
    metalness: 1.0,
    roughness: 0.35,
    roughnessMap: wearTex ?? undefined,
  });
  const finSteel = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 1.0, roughness: 0.35 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 1.0, roughness: 0.3 });
  const alloy = new THREE.MeshStandardMaterial({ color: PALETTE.alloy, metalness: 0.85, roughness: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: PALETTE.tire, metalness: 0.0, roughness: 0.95 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.1, roughness: 0.8 });
  const engineMat = new THREE.MeshStandardMaterial({
    color: PALETTE.engine,
    metalness: 0.2,
    roughness: 0.8,
    roughnessMap: wearTex ?? undefined,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.frame, metalness: 0.6, roughness: 0.5 });
  const fenderMat = new THREE.MeshStandardMaterial({ color: PALETTE.fender, metalness: 0.15, roughness: 0.85 });
  // Open-ended fender arc shows its hollow inside: skin it double-sided.
  fenderMat.side = THREE.DoubleSide;
  const leather = new THREE.MeshStandardMaterial({ color: PALETTE.seat, metalness: 0.0, roughness: 0.7 });
  const stitch = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.0, roughness: 0.9 });
  const padRubber = new THREE.MeshStandardMaterial({
    color: 0x1b1b1f,
    metalness: 0.0,
    roughness: 0.9,
    bumpMap: gripTex ?? undefined,
    bumpScale: 0.02,
  });
  // PHASE 2: reflective white — emissive kick so the front stripe pops.
  const stripeWhite = new THREE.MeshStandardMaterial({
    color: PALETTE.stripe,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    metalness: 0.2,
    roughness: 0.5,
  });
  const glass = new THREE.MeshStandardMaterial({ color: 0x11131a, metalness: 0.4, roughness: 0.15 });
  // Emissive details: LED DRL ring + pod face (warm white), tail strip (red).
  const lens = new THREE.MeshStandardMaterial({
    color: 0xfff6e0,
    emissive: 0xfff2d0,
    emissiveIntensity: 2.0,
    roughness: 0.2,
    metalness: 0.1,
  });
  const tailRed = new THREE.MeshStandardMaterial({
    color: 0x550000,
    emissive: 0xff2211,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });

  const root = new THREE.Group();
  root.name = 'motorcycle-root';

  // Inner body: carries the steering lean so the outer root stays glued to
  // whatever positions it (track rig, demo turntable, …).
  const body = new THREE.Group();
  body.name = 'motorcycle-body';
  root.add(body);

  // -- Wheels ----------------------------------------------------------------
  const frontWheel = makeWheel({
    rimRadius: FRONT_RIM,
    tireTube: FRONT_TIRE_TUBE,
    tire: rubber,
    alloy,
    steel,
    white: stripeWhite,
    dark: frameMat,
    rimStripe: true,
  });
  frontWheel.name = 'frontWheel';
  const rearWheel = makeWheel({
    rimRadius: REAR_RIM,
    tireTube: REAR_TIRE_TUBE,
    tire: rubber,
    alloy,
    steel,
    white: stripeWhite,
    dark: frameMat,
    rimStripe: false,
  });
  rearWheel.name = 'rearWheel';
  // Axles sit exactly one rolling radius up so the contact patches kiss y=0.
  rearWheel.position.set(0, REAR_OUTER, REAR_Z);
  body.add(rearWheel);
  // Rear caliper: bolted to the swingarm at the disc, never spinning.
  const rearCaliper = makeCaliper(frameMat);
  rearCaliper.position.set(0.035, REAR_OUTER + 0.065, REAR_Z - 0.1);
  body.add(rearCaliper);

  // -- Steering geometry ------------------------------------------------------
  // Headstock world position, solved so the fork (length FORK_LENGTH down the
  // raked axis) lands the front axle exactly on (0, FRONT_OUTER, FRONT_Z).
  const forkDir = new THREE.Vector3(0, -Math.cos(RAKE), Math.sin(RAKE));
  const frontAxle = new THREE.Vector3(0, FRONT_OUTER, FRONT_Z);
  const headstock = frontAxle.clone().addScaledVector(forkDir, -FORK_LENGTH);

  const { pivot, steer, fork, headlight } = makeFrontEnd(
    { gold, dark: frameMat, steel, paint, lens, rubber, fender: fenderMat, glass },
    headstock,
    frontWheel,
  );
  pivot.name = 'steering-pivot';
  steer.name = 'handlebar';
  fork.name = 'frontFork';
  headlight.name = 'headlight';
  body.add(pivot);

  // -- Chassis, engine, bodywork ----------------------------------------------
  body.add(makeFrame({ black: frameMat, silver }, headstock));
  body.add(makeEngine({ crank: engineMat, steel: finSteel, silver, dark: engineMat }));
  body.add(makeTank({ paint, silver, leather, dark: matte, red: tailRed, pad: padRubber, stitch }));

  const seatTail = makeSeatTail(
    { paint, silver, leather, dark: frameMat, red: tailRed, pad: padRubber, stitch },
    plateTailTex,
  );
  body.add(seatTail);

  body.add(makeExhaust({ steel, dark: frameMat, paint, silver }));
  body.add(makeStandAndGuard({ steel, dark: frameMat, paint, silver }));
  body.add(makeSidePanels({ steel, dark: frameMat, paint, silver }, plateSideTex));

  // -- PHASE 2 livery ----------------------------------------------------------
  const logoMats: THREE.MeshStandardMaterial[] = [];
  addDecals(
    body,
    headlight,
    { badge: badgeTex, stripe: stripeTex, triumph: triumphTex, rider: riderTex },
    logoMats,
  );

  // Belt-and-braces: every mesh shadows (decals opt out in `makeDecal`,
  // then get their flags re-applied here — keep them unshadowed instead).
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.Material | undefined;
      const isDecal = mat instanceof THREE.MeshStandardMaterial && mat.transparent && mat.polygonOffset;
      if (!isDecal) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    }
  });

  root.scale.setScalar(scale);

  const taillight = (seatTail.userData.lamp as THREE.Group) ?? new THREE.Group();
  taillight.name = 'taillight';

  root.userData = {
    frontWheel,
    rearWheel,
    handlebar: steer,
    steer,
    fork,
    headlight,
    taillight,
    wheelGroups: [frontWheel, rearWheel],
    body,
    frontWheelRadius: FRONT_OUTER,
    rearWheelRadius: REAR_OUTER,
    // PHASE 2 additions: live-customization registries.
    mats: { paint, silver, fins: finSteel, alloy, seat: leather },
    logoMats,
    badgeTexture: badgeTex,
  } satisfies MotorcycleUserData;

  // PHASE 2: custom badge image wins over the generated triangle (async; the
  // generated badge shows until the file arrives). Fire-and-forget with a
  // warning on failure — a missing logo must never break the bike.
  if (logoUrl) {
    setBikeLogo(root, logoUrl).catch((error: unknown) => {
      console.warn('[motorcycle] custom logo failed to load, keeping generated badge:', error);
    });
  }

  return root;
}

/* -------------------------------------------------------------------------- */
/* Animation                                                                   */
/* -------------------------------------------------------------------------- */

/** Clamp for the steering-lean coupling so a full-lock turn stays plausible. */
const MAX_STEER_LEAN = 0.22;

/**
 * Advances the bike one frame. Allocation-free: only writes rotations.
 *
 * @param bike      Group returned by `createMotorcycle`.
 * @param speed     Forward speed in world units/second (signed; reverse unwinds).
 * @param steerAngle Handlebar angle in radians (+ = turning left).
 * @param delta     Frame time in seconds (clamp to ~1/20 upstream).
 */
export function updateMotorcycle(
  bike: THREE.Group,
  speed: number,
  steerAngle: number,
  delta: number,
): void {
  const u = bike.userData as MotorcycleUserData;
  const dt = Math.max(delta, 0);

  // Wheel spin: angular velocity = linear speed / rolling radius. Integrated so
  // scrolling (or driving) backwards unwinds the wheels instead of snapping.
  if (Math.abs(speed) > 1e-4 && dt > 0) {
    u.frontWheel.rotation.x += (speed * dt) / u.frontWheelRadius;
    u.rearWheel.rotation.x += (speed * dt) / u.rearWheelRadius;
  }

  // Steering: yaw the whole front assembly (bars + fork + wheel) about the
  // raked fork axis, then lean the body slightly into the turn.
  u.steer.rotation.y = steerAngle;
  const lean = THREE.MathUtils.clamp(-steerAngle * 0.35, -MAX_STEER_LEAN, MAX_STEER_LEAN);
  u.body.rotation.z = lean;
}

/* -------------------------------------------------------------------------- */
/* PHASE 2 — live customization                                                */
/* -------------------------------------------------------------------------- */

/**
 * Recolors the bike at runtime without rebuilding. Every field is optional;
 * omitted fields keep their current color. Works on the shared materials, so
 * one call retints every part at once (and the change survives disposal of
 * nothing — materials are per-bike).
 */
export function setBikeColors(bike: THREE.Group, colors: BikeColorOverrides): void {
  const u = bike.userData as MotorcycleUserData;
  const mats = u.mats;
  if (!mats) return;
  if (colors.body !== undefined) mats.paint.color.setHex(colors.body);
  if (colors.accent !== undefined) {
    mats.silver.color.setHex(colors.accent);
    mats.fins.color.setHex(colors.accent);
  }
  if (colors.wheels !== undefined) mats.alloy.color.setHex(colors.wheels);
  if (colors.seat !== undefined) mats.seat.color.setHex(colors.seat);
}

/**
 * Swaps the badge texture at runtime (tank flanks, engine covers, headlight).
 * Resolves with the loaded texture; rejects (never throws) when the file
 * cannot be decoded — including headless environments with no DOM `Image`.
 * The previous badge texture is disposed once every decal has moved over.
 */
export function setBikeLogo(bike: THREE.Group, imageUrl: string): Promise<THREE.Texture> {
  const u = bike.userData as MotorcycleUserData;
  const fail = (reason: unknown): Error =>
    reason instanceof Error ? reason : new Error(`[motorcycle] logo load failed: ${String(reason)}`);
  return new Promise<THREE.Texture>((resolve, reject) => {
    let loader: THREE.TextureLoader;
    try {
      loader = new THREE.TextureLoader();
    } catch (error) {
      reject(fail(error));
      return;
    }
    try {
      loader.load(
        imageUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          for (const mat of u.logoMats ?? []) mat.map = tex;
          const old = u.badgeTexture;
          u.badgeTexture = tex;
          if (old) old.dispose();
          resolve(tex);
        },
        undefined,
        (error) => reject(fail(error)),
      );
    } catch (error) {
      reject(fail(error));
    }
  });
}

/**
 * Frees everything `createMotorcycle` allocated. Geometries, materials and
 * generated/custom textures are shared across the parts of one bike, so each
 * is disposed exactly once via Sets. Call on unmount (R3F) or scene teardown
 * (vanilla).
 *
 * PHASE 2: texture maps ride on the materials now, so they join the sweep —
 * including a custom logo texture installed by `setBikeLogo`.
 */
export function disposeMotorcycle(bike: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const collectTexture = (tex: THREE.Texture | null | undefined): void => {
    if (tex) textures.add(tex);
  };
  bike.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    if (geo) geometries.add(geo);
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      materials.add(m);
      // PHASE 2: sweep every map slot a livery texture could sit in.
      const std = m as THREE.MeshStandardMaterial;
      collectTexture(std.map);
      collectTexture(std.roughnessMap);
      collectTexture(std.bumpMap);
      collectTexture(std.emissiveMap);
      collectTexture(std.normalMap);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
