import { describe, expect, it, beforeEach } from 'vitest';
import {
  decideMode,
  recommendQuality,
  parseModeOverride,
  setForceMode,
  force2D,
  force3D,
  type ExperienceMode,
} from '../src/lib/capabilities';
import type { DeviceProfile } from '../src/hooks/useIsLowEnd';

/**
 * Mode-selection rules for the capability resolver.
 *
 * These are the exact priority rules `decideMode` implements; the hook and the
 * router both funnel through it, so pinning it here guards the Phase 6
 * resilience contract against future "just reorder two lines" edits.
 */

function device(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    tier: 'high',
    webglFailed: false,
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)',
    isMobile: false,
    isTouch: false,
    ...overrides,
  };
}

/** Minimal browser double: storage + location + matchMedia, nothing else. */
function stubBrowser(options: { href?: string; storage?: Record<string, string> } = {}): void {
  const store = new Map(Object.entries(options.storage ?? {}));
  const fakeWindow = {
    location: new URL(options.href ?? 'https://hrithikpaul.dev/'),
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  };
  (globalThis as { window?: unknown }).window = fakeWindow;
}

beforeEach(() => {
  stubBrowser();
});

describe('decideMode', () => {
  it('defaults to 3D on a capable device', () => {
    expect(decideMode(true, false, false, false)).toBe('3D');
  });

  it('falls back to 2D with no WebGL', () => {
    expect(decideMode(false, false, false, false)).toBe('2D');
  });

  it('defaults to 2D when reduced motion is preferred', () => {
    expect(decideMode(true, true, false, false)).toBe('2D');
  });

  it('falls back to 2D for low-end hardware asking to save data', () => {
    expect(decideMode(true, false, true, true)).toBe('2D');
  });

  it('stays 3D on low-end hardware without a save-data signal', () => {
    expect(decideMode(true, false, false, true)).toBe('3D');
  });

  it('stays 3D on capable hardware with save-data alone', () => {
    expect(decideMode(true, false, true, false)).toBe('3D');
  });

  it.each(['2D', '3D'] as ExperienceMode[])(
    'a stored preference for %s beats auto-detection',
    (mode) => {
      setForceMode(mode);
      // Capable device that would otherwise land on 3D…
      expect(decideMode(true, false, false, false)).toBe(mode);
      // …and even a device that would land on 2D.
      expect(decideMode(false, false, false, true)).toBe(mode);
    },
  );

  it('reports the stored preference through force2D/force3D', () => {
    expect(force2D()).toBe(false);
    expect(force3D()).toBe(false);
    setForceMode('2D');
    expect(force2D()).toBe(true);
    expect(force3D()).toBe(false);
    // Clearing restores auto-detection.
    setForceMode(null);
    expect(force2D()).toBe(false);
  });
});

describe('parseModeOverride', () => {
  it.each([
    ['https://hrithikpaul.dev/?mode=2d', '2D'],
    ['https://hrithikpaul.dev/?mode=2D', '2D'],
    ['https://hrithikpaul.dev/?mode=3d', '3D'],
    ['https://hrithikpaul.dev/?mode=3D', '3D'],
    ['https://hrithikpaul.dev/', null],
    ['https://hrithikpaul.dev/?mode=potato', null],
  ] as [string, ExperienceMode | null][])('parses %s as %s', (href, expected) => {
    stubBrowser({ href });
    expect(parseModeOverride()).toBe(expected);
  });
});

describe('recommendQuality', () => {
  it('recommends LOW with no usable WebGL', () => {
    expect(recommendQuality(device({ webglFailed: true }), false, false)).toBe('LOW');
  });

  it('recommends LOW for software rasterisers regardless of tier', () => {
    expect(recommendQuality(device({ renderer: 'SwiftShader' }), false, false)).toBe('LOW');
  });

  it('caps at MEDIUM when saving data', () => {
    expect(recommendQuality(device(), false, true)).toBe('MEDIUM');
  });

  it('follows the tier heuristic otherwise', () => {
    expect(recommendQuality(device({ tier: 'low' }), false, false)).toBe('LOW');
    expect(recommendQuality(device({ tier: 'mid' }), false, false)).toBe('MEDIUM');
    expect(recommendQuality(device({ tier: 'high' }), false, false)).toBe('HIGH');
  });
});
