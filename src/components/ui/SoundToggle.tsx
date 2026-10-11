import { useCallback, useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { SITE_CHROME } from '../../data/content';
import { disposeSound, setSoundEnabled, soundAvailable, soundPreference, useSoundRide } from '../../lib/audio';

/**
 * ============================================================================
 * AMBIENT SOUND TOGGLE
 * ============================================================================
 *
 * Off by default, and the graph is not built until this is pressed — see the
 * ordering note in `lib/audio.ts`.
 *
 * The label swaps between the two actions rather than describing the current
 * state, which is the convention every other button in this chrome follows: the
 * label is what pressing it does, not what is currently true.
 */
export function SoundToggle() {
  /*
   * Lazy initialisers rather than an effect that sets state on mount.
   *
   * There is no server render here, so reading `window` during the first render is
   * safe, and doing it in the initialiser means the button never renders once as
   * "unavailable" and then re-render to add itself — which is the flash a
   * mount-effect would cause on every page load.
   */
  const [available] = useState(soundAvailable);
  const [on, setOn] = useState(false);

  // The ride subscription lives in this component so it exists only while the
  // ambience can be heard. It is cheap either way, but there is no reason to run a
  // per-frame callback for a sound nobody has turned on.
  useSoundRide();

  useEffect(() => {
    if (!available) return;

    /*
     * A saved preference is honoured, but only after the reader has interacted
     * once in this tab.
     *
     * Browsers will not let an `AudioContext` start without a gesture, and the
     * honest options are "play from the visitor's previous choice, the moment they
     * first touch the page" or "make them press the button again". The first is
     * chosen here: restored, silent until then, and ramped in on the first
     * pointer or key event. It costs a listener and saves a control being ignored.
     */
    const restore = () => {
      setOn(soundPreference());
      window.removeEventListener('pointerdown', restore);
      window.removeEventListener('keydown', restore);
    };
    window.addEventListener('pointerdown', restore, { once: true });
    window.addEventListener('keydown', restore, { once: true });

    return () => {
      window.removeEventListener('pointerdown', restore);
      window.removeEventListener('keydown', restore);
      disposeSound();
    };
  }, [available]);

  const toggle = useCallback(() => {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
  }, [on]);

  /*
   * Renders nothing at all where WebAudio does not exist, rather than a disabled
   * button. A control that can never work is noise in the chrome, and this one
   * would also be a permanent false affordance.
   */
  if (!available) return null;

  const label = on ? SITE_CHROME.audio.disable : SITE_CHROME.audio.enable;
  const Icon = on ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      onClick={toggle}
      /*
       * `aria-pressed` alongside the swapping label, so a screen reader announces
       * the state as well as the action. Without it, "Mute ambient audio" reads as
       * ambiguous: it is not clear whether the sound is currently on.
       */
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="pointer-events-auto relative grid size-8 place-items-center rounded-full border border-white/12 text-mist-300 transition-colors hover:border-neon-violet/60 hover:text-neon-violet"
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
      <span className="sr-only">{label}</span>
      {/* Confirms to a sighted reader that the press registered, since the only
          other change is the icon and that is easy to miss. */}
      <span
        aria-hidden="true"
        className={`absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-neon-teal transition-opacity ${
          on ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </button>
  );
}
