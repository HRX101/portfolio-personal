import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS, LIGHTING } from '../../../config/scene';
import { createTrackPose, sampleTrack } from '../../../lib/track';
import { getRide } from '../../../hooks/useScrollProgress';
import { sampleAtmosphere } from '../../../lib/atmosphere';

/* ========================================================================== */
/* Sky dome                                                                    */
/* ========================================================================== */

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uFog;
  void main() {
    float h = normalize(vDir).y;
    vec3 col;
    if (h >= 0.0) {
      col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
      col = mix(col, uZenith, smoothstep(0.28, 0.78, h));
    } else {
      // Below the horizon fades to the fog colour so the terrain edge blends.
      col = mix(uHorizon, uFog, smoothstep(0.0, 0.35, -h));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Inverted sphere with a three-stop vertical gradient. A shader (rather than
 * vertex colours) lets Atmosphere retint it every frame as the ride progresses,
 * and keeps the horizon colour exactly equal to the fog colour so distant
 * geometry dissolves cleanly.
 */
function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color('#04050d') },
      uMid: { value: new THREE.Color('#1b1b45') },
      uHorizon: { value: new THREE.Color('#4a2a63') },
      uFog: { value: new THREE.Color('#0a0b1c') },
    }),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [uniforms],
  );

  const geometry = useMemo(() => new THREE.SphereGeometry(900, 32, 20), []);

  useFrame(() => {
    const s = sampleAtmosphere(getRide().t);
    uniforms.uZenith.value.copy(s.skyZenith);
    uniforms.uMid.value.copy(s.skyMid);
    uniforms.uHorizon.value.copy(s.skyHorizon);
    uniforms.uFog.value.copy(s.fog);
  });

  return (
    <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />
  );
}

/* ========================================================================== */
/* Lighting                                                                    */
/* ========================================================================== */

/** Light offsets from the bike, pre-normalised into scratch vectors below. */
const MOON_OFFSET = new THREE.Vector3(...LIGHTING.moonDirection).normalize().multiplyScalar(70);
const RIM_OFFSET = new THREE.Vector3(0.5, 0.35, -0.9).normalize().multiplyScalar(90);
const FILL_OFFSET = new THREE.Vector3(-0.4, 1.6, -1.2).normalize().multiplyScalar(7);

/**
 * Hemisphere fill plus a single directional "moon".
 *
 * The shadow camera follows the bike each frame and stays deliberately small
 * (±16u): a full-track shadow map would need an enormous frustum to keep any
 * useful resolution, and the only meaningful shadows are the bike's own.
 */
function Lighting({ shadows }: { shadows: boolean }) {
  const pose = useMemo(() => createTrackPose(), []);
  const moon = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  // The light's aim point is a real object in the scene graph (three requires
  // that), but its position is driven every frame to sit under the bike.
  const aim = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const s = sampleAtmosphere(getRide().t);
    sampleTrack(getRide().t, pose);
    aim.position.copy(pose.position);
    aim.updateMatrixWorld();

    moon.current?.position.copy(pose.position).add(MOON_OFFSET);
    rim.current?.position.copy(pose.position).add(RIM_OFFSET);
    fill.current?.position.copy(pose.position).add(FILL_OFFSET);

    if (moon.current) {
      moon.current.color.copy(s.moonColor);
      moon.current.intensity = s.moonIntensity;
    }
    if (hemi.current) {
      hemi.current.color.copy(s.hemisphereSky);
      hemi.current.intensity = s.hemisphereIntensity;
    }
  });

  const extent = LIGHTING.shadowExtent;

  return (
    <>
      <hemisphereLight
        ref={hemi}
        args={[LIGHTING.hemisphereSky, LIGHTING.hemisphereGround, LIGHTING.hemisphereIntensity]}
      />
      {/* Warm ground bounce so the underside of the bike is not pure black. */}
      <pointLight
        ref={fill}
        color={COLORS.accentAlt}
        intensity={LIGHTING.fillIntensity}
        distance={LIGHTING.fillDistance}
        decay={2}
      />
      {/* Rim light from behind, tinted to the neon accent, no shadows. */}
      <directionalLight ref={rim} color={COLORS.accent} intensity={1.1} />
      <primitive object={aim} />
      <directionalLight
        ref={moon}
        color={LIGHTING.moonColor}
        intensity={LIGHTING.moonIntensity}
        castShadow={shadows}
        target={aim}
        shadow-mapSize-width={LIGHTING.shadowMapSize}
        shadow-mapSize-height={LIGHTING.shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-camera-left={-extent}
        shadow-camera-right={extent}
        shadow-camera-top={extent}
        shadow-camera-bottom={-extent}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
    </>
  );
}

/* ========================================================================== */
/* Atmosphere                                                                  */
/* ========================================================================== */

/**
 * Owns the fog, sky and lights, and retints them every frame from the ride
 * progress. Mounted once near the top of the scene so its useFrame runs before
 * anything that samples the atmosphere.
 */
export function Atmosphere({ shadows }: { shadows: boolean }) {
  const fog = useMemo(() => new THREE.Fog('#0a0b1c', 70, 460), []);

  useFrame(() => {
    const s = sampleAtmosphere(getRide().t);
    fog.color.copy(s.fog);
    fog.near = s.fogNear;
    fog.far = s.fogFar;
  });

  return (
    <>
      <primitive object={fog} />
      <SkyDome />
      <Lighting shadows={shadows} />
    </>
  );
}
