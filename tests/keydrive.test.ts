import { describe, expect, it, afterEach } from 'vitest';
import {
  keyDriveStep,
  setKeyDrive,
  getKeyDriveState,
  KEY_DRIVE_SECONDS,
} from '../src/hooks/useScrollProgress';

/**
 * W/S game-style ride control.
 *
 * Only the pure step and the key-state machine are pinned here: the rAF loop
 * and Lenis retargeting need a browser. The contract that matters — same
 * progress mapping as the wheel, additive, never inverted — lives in
 * `keyDriveStep`.
 */

afterEach(() => {
  setKeyDrive('forward', false);
  setKeyDrive('back', false);
});

describe('keyDriveStep', () => {
  it('advances forward and retreats back at the configured rate', () => {
    expect(keyDriveStep(0.5, 1, 1)).toBeCloseTo(0.5 + 1 / KEY_DRIVE_SECONDS, 9);
    expect(keyDriveStep(0.5, -1, 1)).toBeCloseTo(0.5 - 1 / KEY_DRIVE_SECONDS, 9);
  });

  it('holds still with no direction', () => {
    expect(keyDriveStep(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps at both ends of the ride', () => {
    expect(keyDriveStep(0.99, 1, 10)).toBe(1);
    expect(keyDriveStep(0.01, -1, 10)).toBe(0);
  });

  it('crosses the full ride in KEY_DRIVE_SECONDS at 1s steps', () => {
    let p = 0;
    for (let i = 0; i < KEY_DRIVE_SECONDS; i++) p = keyDriveStep(p, 1, 1);
    expect(p).toBeCloseTo(1, 9);
  });
});

describe('setKeyDrive', () => {
  it('tracks held keys and releases cleanly', () => {
    expect(getKeyDriveState()).toEqual({ forward: false, back: false });
    setKeyDrive('forward', true);
    expect(getKeyDriveState()).toEqual({ forward: true, back: false });
    setKeyDrive('forward', false);
    expect(getKeyDriveState()).toEqual({ forward: false, back: false });
  });

  it('is idempotent (key auto-repeat safe) and needs no browser to flip', () => {
    setKeyDrive('forward', true);
    setKeyDrive('forward', true);
    setKeyDrive('back', true);
    expect(getKeyDriveState()).toEqual({ forward: true, back: true });
  });
});
