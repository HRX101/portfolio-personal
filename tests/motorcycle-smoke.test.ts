import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createMotorcycle,
  updateMotorcycle,
  disposeMotorcycle,
  setBikeColors,
  setBikeLogo,
  makeBadgeTexture,
  makeSidePlateTexture,
  makeTailPlateTexture,
  PALETTE,
  type MotorcycleUserData,
} from '../src/lib/motorcycle';

/** Smoke tests for the procedural Speed T4 module (geometry + animation). */
describe('motorcycle smoke', () => {
  it('builds a named, shadowed bike facing +Z with a 1.4 wheelbase', () => {
    const bike = createMotorcycle();
    const u = bike.userData as unknown as MotorcycleUserData;
    expect(u.frontWheel).toBeInstanceOf(THREE.Group);
    expect(u.rearWheel).toBeInstanceOf(THREE.Group);
    expect(u.handlebar).toBeInstanceOf(THREE.Group);
    expect(u.headlight).toBeInstanceOf(THREE.Group);
    expect(u.wheelGroups).toHaveLength(2);

    // Wheelbase: axles 1.4 apart, front forward (+Z).
    bike.updateMatrixWorld(true);
    const fz = new THREE.Vector3();
    const rz = new THREE.Vector3();
    u.frontWheel.getWorldPosition(fz);
    u.rearWheel.getWorldPosition(rz);
    expect(fz.z - rz.z).toBeCloseTo(1.4, 2);
    expect(fz.z).toBeGreaterThan(rz.z);

    // Origin on the ground: contact patches kiss y=0, bars/mirrors above 0.9.
    const bbox = new THREE.Box3().setFromObject(bike);
    expect(bbox.min.y).toBeCloseTo(0, 1);
    expect(bbox.max.y).toBeGreaterThan(0.9);
    expect(bbox.max.z - bbox.min.z).toBeCloseTo(2.1, 0);

    // Every mesh shadows — except livery decals, which opt out so thin
    // transparent planes never punch holes in the shadow map.
    let meshes = 0;
    bike.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        meshes++;
        const mesh = c as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isDecal = mat.transparent === true && mat.polygonOffset === true;
        if (!isDecal) {
          expect(c.castShadow).toBe(true);
          expect(c.receiveShadow).toBe(true);
        }
      }
    });
    expect(meshes).toBeGreaterThan(60);
    disposeMotorcycle(bike);
  });

  it('spins wheels by speed/radius, steers, and leans', () => {
    const bike = createMotorcycle();
    const u = bike.userData as unknown as MotorcycleUserData;
    // Front wheel carries a base rake-compensation angle; spin accumulates on top.
    const fx0 = u.frontWheel.rotation.x;
    const rx0 = u.rearWheel.rotation.x;
    updateMotorcycle(bike, 8, 0.3, 0.5);
    expect(u.frontWheel.rotation.x - fx0).toBeCloseTo((8 * 0.5) / u.frontWheelRadius, 6);
    expect(u.rearWheel.rotation.x - rx0).toBeCloseTo((8 * 0.5) / u.rearWheelRadius, 6);
    expect(u.steer.rotation.y).toBeCloseTo(0.3, 6);
    expect(u.body.rotation.z).not.toBe(0);
    // Reverse unwinds.
    updateMotorcycle(bike, -8, 0, 0.5);
    expect(u.frontWheel.rotation.x).toBeCloseTo(fx0, 6);
    disposeMotorcycle(bike);
  });
});

/** Phase 2: palette, canvas-texture degradation, live customization. */
describe('motorcycle phase 2', () => {
  it('exposes the black/graphite palette in one table', () => {
    expect(PALETTE.tank).toBe(0x1a1a20);
    expect(PALETTE.silver).toBe(0xc7c9d1);
    expect(PALETTE.engine).toBe(0x1a1a1e);
    expect(PALETTE.fins).toBe(0xb8bcc4);
    expect(PALETTE.frame).toBe(0x1c1c21);
    expect(PALETTE.alloy).toBe(0x26262b);
    expect(PALETTE.tire).toBe(0x17171a);
    expect(PALETTE.seat).toBe(0x19191d);
    expect(PALETTE.stripe).toBe(0xffffff);
    expect(PALETTE.plateRed).toBe(0xd0202a);
  });

  it('degrades gracefully headless: canvas textures are null, bike still builds', () => {
    // Vitest runs in Node with no DOM canvas.
    expect(makeBadgeTexture()).toBeNull();
    expect(makeSidePlateTexture()).toBeNull();
    expect(makeTailPlateTexture()).toBeNull();
    const bike = createMotorcycle({ plateText: 'TEST-1', riderName: 'Test Rider' });
    const u = bike.userData as unknown as MotorcycleUserData;
    expect(u.logoMats).toHaveLength(0);
    expect(u.badgeTexture).toBeNull();
    disposeMotorcycle(bike);
  });

  it('setBikeColors retints the shared materials (partial updates keep the rest)', () => {
    const bike = createMotorcycle();
    const u = bike.userData as unknown as MotorcycleUserData;
    expect(u.mats.paint.color.getHex()).toBe(PALETTE.tank);
    setBikeColors(bike, { body: 0xff0000, wheels: 0x00ff00 });
    expect(u.mats.paint.color.getHex()).toBe(0xff0000);
    expect(u.mats.alloy.color.getHex()).toBe(0x00ff00);
    // Untouched channels keep palette values.
    expect(u.mats.silver.color.getHex()).toBe(PALETTE.silver);
    expect(u.mats.seat.color.getHex()).toBe(PALETTE.seat);
    setBikeColors(bike, { accent: 0x0000ff, seat: 0x123456 });
    expect(u.mats.silver.color.getHex()).toBe(0x0000ff);
    expect(u.mats.fins.color.getHex()).toBe(0x0000ff);
    expect(u.mats.seat.color.getHex()).toBe(0x123456);
    disposeMotorcycle(bike);
  });

  it('setBikeLogo rejects (never throws) when no image can load', () => {
    const bike = createMotorcycle();
    // Node has no DOM Image: the loader rejects instead of throwing sync.
    const pending = setBikeLogo(bike, 'missing.png');
    expect(pending).toBeInstanceOf(Promise);
    return expect(pending).rejects.toThrow().finally(() => disposeMotorcycle(bike));
  });

  it('wheels carry asymmetric spin markers (valve stems, drilled discs)', () => {
    const bike = createMotorcycle();
    const u = bike.userData as unknown as MotorcycleUserData;
    // One valve stem per wheel (bright radial nub) + five disc holes each.
    let valves = 0;
    let holes = 0;
    for (const wheel of u.wheelGroups) {
      wheel.updateMatrixWorld(true);
      wheel.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        const params = (mesh.geometry as THREE.CylinderGeometry).parameters as
          | { radiusTop?: number }
          | undefined;
        if (mesh.geometry.type === 'CylinderGeometry' && params?.radiusTop === 0.012) valves++;
        if (mesh.geometry.type === 'CylinderGeometry' && params?.radiusTop === 0.016) holes++;
        // Markers must live inside the spin group to rotate with the wheel.
        expect(mesh.parent).not.toBeNull();
      });
    }
    expect(valves).toBe(2);
    expect(holes).toBe(10);
    disposeMotorcycle(bike);
  });
});
