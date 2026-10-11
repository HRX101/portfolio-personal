import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getStationContent, type StationId } from '../../../data/content';
import { getRide } from '../../../hooks/useScrollProgress';
import { smoothstep } from '../../../lib/easing';
import type { LandmarkAnchor } from '../../../lib/world';
import { Landmark } from './Landmark';

/**
 * A roadside sign carrying the station's short title, so the rider knows which
 * card is about to open before the DOM overlay has faded in.
 *
 * A canvas texture is used rather than troika/drei `<Text>`: troika fetches a
 * default Roboto face from a font CDN on first use, which turns a decorative
 * label into a network dependency and a source of console errors on an offline
 * or firewalled machine. Drawing the glyphs ourselves costs one canvas and one
 * texture, works with no network at all, and inherits the site's own type stack.
 *
 * Only the title is in 3D. The body copy lives in the DOM overlay, duplicated
 * into the scene would be unreadable at chase-camera distance and would drift
 * out of sync with the real text the first time the copy is edited.
 */

const CANVAS_W = 1024;
const CANVAS_H = 256;

/** Sign height and width per station, chosen to clear each landmark's roof. */
const PLACEMENT: Record<StationId, { y: number; width: number }> = {
  // Gate beam tops out at 15.6, so the sign sits above the arch.
  hero: { y: 18.4, width: 11 },
  // The constellation bobs up to about y=11.5.
  about: { y: 15, width: 10 },
  // The tallest tower in the cluster is 29u.
  experience: { y: 32.5, width: 11 },
  // The workshop's gantry reaches roughly y=13.
  freelance: { y: 16.5, width: 10 },
  // Dome plus dish tops out near y=11.
  research: { y: 14, width: 10 },
  // The podium is low; the sign floats clear of it.
  achievements: { y: 12, width: 10 },
  // Finish gate beam is at 14.6.
  contact: { y: 17.4, width: 11 },
};

const FONT_STACK = '"Space Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif';

function drawSign(title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const radius = 34;
  const inset = 12;
  const width = CANVAS_W - inset * 2;
  const height = CANVAS_H - inset * 2;

  // Panel: a dark plate so the glyphs never fight the sky behind them.
  ctx.beginPath();
  ctx.roundRect(inset, inset, width, height, radius);
  ctx.fillStyle = 'rgba(6, 8, 20, 0.82)';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(69, 240, 224, 0.55)';
  ctx.stroke();

  // Accent rule under the text, matching the DOM card's hairline.
  ctx.fillStyle = 'rgba(69, 240, 224, 0.35)';
  ctx.fillRect(inset + 60, CANVAS_H - 52, width - 120, 4);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 108px ${FONT_STACK}`;
  // Shrink to fit rather than overflow: station labels differ in length.
  const maxWidth = width - 140;
  let size = 108;
  while (size > 48 && ctx.measureText(title).width > maxWidth) {
    size -= 6;
    ctx.font = `700 ${size}px ${FONT_STACK}`;
  }

  ctx.shadowColor = 'rgba(69, 240, 224, 0.55)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#eef1ff';
  ctx.fillText(title, CANVAS_W / 2, CANVAS_H / 2 - 14);
  ctx.shadowBlur = 0;
  ctx.fillText(title, CANVAS_W / 2, CANVAS_H / 2 - 14);

  return canvas;
}

export function StationSign({ station, anchor }: { station: StationId; anchor: LandmarkAnchor }) {
  const title = getStationContent(station).navLabel.toUpperCase();
  const placement = PLACEMENT[station];

  const texture = useMemo(() => {
    const map = new THREE.CanvasTexture(drawSign(title));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, [title]);

  const material = useRef<THREE.MeshBasicMaterial>(null);
  const height = placement.width / (CANVAS_W / CANVAS_H);

  useEffect(() => () => texture.dispose(), [texture]);

  // Fade with proximity. A sign at full brightness 400u down the road is a bright
  // rectangle in the fog with nothing to say; the fog alone does not do this job
  // because the sign is close to the camera exactly when it is about to matter.
  useFrame(() => {
    const mesh = material.current;
    if (!mesh) return;
    const distance = Math.abs(getRide().t - anchor.t);
    mesh.opacity = smoothstep(1 - (distance - 0.14) / 0.16);
  });

  return (
    <Landmark anchor={anchor}>
      <mesh position={[0, placement.y, 0]} rotation={[0, anchor.side === 0 ? Math.PI : 0, 0]}>
        <planeGeometry args={[placement.width, height]} />
        <meshBasicMaterial
          ref={material}
          map={texture}
          // White, not the accent: the texture already carries the teal plate and
          // the white glyphs, so tinting it would recolour both.
          color="#ffffff"
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
          toneMapped={false}
        />
      </mesh>
    </Landmark>
  );
}
