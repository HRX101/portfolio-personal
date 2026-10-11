import { useEffect } from 'react';
import { invalidate } from '@react-three/fiber';
import { subscribeScroll } from '../../hooks/useScrollProgress';

/**
 * ============================================================================
 * DEMAND-LOOP PUMP
 * ============================================================================
 *
 * The Canvas runs `frameloop="demand"`: R3F renders a frame only when something
 * calls `invalidate()`, and its rAF loop cancels itself when idle. Every
 * continuous value in the scene (ride damping, camera, effects) lives in
 * `useFrame`, so without a pump the canvas renders exactly once on mount and
 * then freezes — scrolling moves the DOM but the 3D ride never follows.
 *
 * This component is the pump for scroll-driven motion. It renders nothing and
 * owns no state; it just translates scroll activity into frames:
 *
 * - the Lenis scroll bus (covers wheel, touch AND programmatic `scrollTo`),
 * - a native `scroll` listener as backstop (a jump Lenis did not cause still
 *   means the ride target moved and the camera owes the reader a frame).
 *
 * `invalidate()` is idempotent and cheap (requests a single frame, restarts
 * the loop if it stopped), so firing it per scroll event cannot stack work.
 *
 * Two siblings complete the contract: the ride driver re-invalidates while
 * the bike is still settling toward its target (the damping tail after the
 * last scroll event), and the Loader pumps for the duration of the intro
 * glide (scroll is locked then, so there is no scroll activity to pump
 * from). When none of the three has anything to ask for, no frames render
 * and the GPU idles — which is the whole point of demand mode.
 *
 * Canvas-side on purpose: importing `@react-three/fiber` from anything the
 * entry chunk reaches would drag the renderer into every 2D load.
 */
export function RideInvalidator() {
  useEffect(() => {
    const offBus = subscribeScroll(() => invalidate());
    const onNativeScroll = () => invalidate();
    window.addEventListener('scroll', onNativeScroll, { passive: true });
    return () => {
      offBus();
      window.removeEventListener('scroll', onNativeScroll);
    };
  }, []);

  return null;
}
