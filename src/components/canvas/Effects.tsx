import { useFrame } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { EMISSIVE } from '../../config/scene';
import { clamp, damp } from '../../lib/easing';
import { getRide } from '../../hooks/useScrollProgress';

/**
 * ============================================================================
 * POST-PROCESSING — PHASE 5
 * ============================================================================
 *
 * Three effects, in the order that matters:
 *
 *   Bloom               bright-pass + mip blur, added back
 *   ChromaticAberration a per-channel offset, scaled by the bike's speed
 *   Vignette            static darkening at the frame edges
 *
 * Order is not cosmetic. Chromatic aberration reads as colour fringing on
 * whatever is already blurred, so running it *before* bloom would smear the
 * fringes into the glow and lose the crisp edge that makes it legible. Running it
 * after means the fringing sits on top of the finished image, which is where a
 * real lens does it. The vignette is last because it is a multiply over whatever
 * the other two produced — it should never be softened by them.
 *
 * The single most important decision in this file is the early return when bloom
 * is off. At MEDIUM and LOW no composer is constructed, no render target is
 * allocated and no full-screen copy is issued: R3F falls back to its default
 * render path and the scene draws straight to the canvas. That is the difference
 * between "the post chain is off" and "the post chain is on but weak", and it is
 * worth a full-screen copy plus a blur pyramid.
 *
 * `multisampling={0}` is deliberate and pairs with `render.antialias`. MSAA and a
 * composer do not compose: once the composer owns the output, the default
 * framebuffer's antialiasing is bypassed, so requesting both means paying for
 * MSAA on a target the composer immediately discards. Antialiasing is handled
 * instead by the renderer's own setting at the tiers without a composer.
 */

/**
 * The aberration offset, shared between the composer and the loop that drives it.
 *
 * Module scope rather than a `useMemo`, because it must be the *same* object the
 * effect holds: `ChromaticAberrationEffect` copies the reference once at
 * construction, so a vector created inside the component body would be captured
 * and never updated. Mutated in place every frame — no allocation, and the
 * uniform updates without React being involved at all.
 */
const aberration = new THREE.Vector2(0, 0);

/** Speed at which the aberration reaches full strength, world units/second. */
const ABERRATION_SPEED_CEILING = 42;
/** Maximum channel offset at full speed, in pixels. */
const ABERRATION_MAX = 0.0016;
/**
 * How quickly the offset returns to zero when the bike stops. Slower than the
 * FOV kick on purpose: colour fringing that snaps away feels like a camera
 * effect switching off, while fringing that eases out reads as the lens settling.
 */
const ABERRATION_RETURN = 3.4;

export function Effects({ bloom }: { bloom: boolean }) {
  if (!bloom) return null;

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        intensity={EMISSIVE.bloomIntensity}
        luminanceThreshold={EMISSIVE.bloomThreshold}
        luminanceSmoothing={EMISSIVE.bloomSmoothing}
        radius={EMISSIVE.bloomRadius}
        mipmapBlur
      />
      <ChromaticAberration
        offset={aberration}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette eskil={false} offset={0.28} darkness={0.72} blendFunction={BlendFunction.NORMAL} />
      <AberrationDriver />
    </EffectComposer>
  );
}

/**
 * Drives the aberration offset from the ride's speed.
 *
 * A component rather than a `useFrame` in `Effects` itself, so that when bloom is
 * off there is no frame loop in the tree at all — consistent with the rule every
 * other Phase 5 effect follows.
 *
 * R3F runs composer children inside the composer's own render pass, so this is
 * the natural place for it: the offset is already correct by the time the
 * fragment shaders sample it.
 */
function AberrationDriver() {
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const wanted = clamp(getRide().speedFactor) * ABERRATION_MAX;
    // Asymmetric, like the FOV kick: fast to grow with speed, slow to fall away.
    const lambda = wanted > aberration.x ? 8 : ABERRATION_RETURN;
    const next = damp(aberration.x, wanted, lambda, dt);
    // Slightly stronger horizontally than vertically, matching the geometry of a
    // radial aberration: a circle stretched along one axis reads as depth, while
    // the same offset on both axes reads as a mistake.
    aberration.set(next, next * 0.6);
  });

  return null;
}

/** Speed at which aberration is strongest, exported for the debug overlay. */
export const ABERRATION_CEILING = ABERRATION_SPEED_CEILING;
