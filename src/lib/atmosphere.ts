import * as THREE from 'three';
import { ATMOSPHERE_KEYS } from '../config/scene';

/**
 * Progressive atmosphere.
 *
 * Four palette keyframes are interpolated across the ride so the sky, fog and
 * lighting drift from late dusk to a pre-dawn glow with no visible pops. Every
 * field is lerped, so any pair of keyframes produces a continuous gradient.
 *
 * The sampler writes into a single reused object: it runs every frame, so it
 * must never allocate.
 */

export interface AtmosphereSample {
  skyZenith: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  moonColor: THREE.Color;
  moonIntensity: number;
  hemisphereSky: THREE.Color;
  hemisphereIntensity: number;
  /** Multiplicative tint applied to terrain, mountains and props. */
  worldTint: THREE.Color;
  starOpacity: number;
}

const WHITE = new THREE.Color('#ffffff');

function makeSample(): AtmosphereSample {
  const first = ATMOSPHERE_KEYS[0]!;
  return {
    skyZenith: new THREE.Color(first.skyZenith),
    skyMid: new THREE.Color(first.skyMid),
    skyHorizon: new THREE.Color(first.skyHorizon),
    fog: new THREE.Color(first.fog),
    fogNear: first.fogNear,
    fogFar: first.fogFar,
    moonColor: new THREE.Color(first.moonColor),
    moonIntensity: first.moonIntensity,
    hemisphereSky: new THREE.Color(first.hemisphereSky),
    hemisphereIntensity: first.hemisphereIntensity,
    worldTint: new THREE.Color(first.worldTint),
    starOpacity: first.starOpacity,
  };
}

/** Reused result. Valid only until the next call. */
export const atmosphereSample: AtmosphereSample = makeSample();

/** Live world tint that terrain, mountains and props read each frame. */
export const liveWorldTint = new THREE.Color('#ffffff');

/** Live star opacity read by the star field each frame. */
export const liveStarOpacity = { value: 1 };

const _ca = new THREE.Color();
const _cb = new THREE.Color();

function lerpColor(out: THREE.Color, a: string, b: string, k: number): void {
  _ca.set(a);
  _cb.set(b);
  out.copy(_ca).lerp(_cb, k);
}

/** Interpolates the keyframes at `t` (0..1) into the reused sample object. */
export function sampleAtmosphere(t: number): AtmosphereSample {
  const keys = ATMOSPHERE_KEYS;
  const clamped = Math.min(Math.max(t, 0), 1);

  let i = 0;
  while (i < keys.length - 1 && clamped > (keys[i + 1]?.at ?? 1)) i++;

  // The keyframes are a fixed non-empty list, so both ends are always defined.
  const a = keys[i]!;
  const b = keys[i + 1] ?? a;
  const span = b.at - a.at;
  const k = span > 1e-6 ? Math.min(Math.max((clamped - a.at) / span, 0), 1) : 0;

  const s = atmosphereSample;
  lerpColor(s.skyZenith, a.skyZenith, b.skyZenith, k);
  lerpColor(s.skyMid, a.skyMid, b.skyMid, k);
  lerpColor(s.skyHorizon, a.skyHorizon, b.skyHorizon, k);
  lerpColor(s.fog, a.fog, b.fog, k);
  s.fogNear = a.fogNear + (b.fogNear - a.fogNear) * k;
  s.fogFar = a.fogFar + (b.fogFar - a.fogFar) * k;
  lerpColor(s.moonColor, a.moonColor, b.moonColor, k);
  s.moonIntensity = a.moonIntensity + (b.moonIntensity - a.moonIntensity) * k;
  lerpColor(s.hemisphereSky, a.hemisphereSky, b.hemisphereSky, k);
  s.hemisphereIntensity =
    a.hemisphereIntensity + (b.hemisphereIntensity - a.hemisphereIntensity) * k;

  // The world tint is a multiplicative colour, so it lerps from white toward
  // the keyed tint by the keyed intensity rather than lerping hue directly.
  lerpColor(s.worldTint, a.worldTint, b.worldTint, k);
  const intensity =
    a.worldTintIntensity + (b.worldTintIntensity - a.worldTintIntensity) * k;
  s.worldTint.copy(WHITE).lerp(s.worldTint, intensity);

  s.starOpacity = a.starOpacity + (b.starOpacity - a.starOpacity) * k;

  liveWorldTint.copy(s.worldTint);
  liveStarOpacity.value = s.starOpacity;

  return s;
}
