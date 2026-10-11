import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { SITE_CHROME, type ContactStation } from '../../../data/content';
import { scrollToTop } from '../../../hooks/useScrollProgress';
import { iconFor } from '../icons';

type CopyState = 'idle' | 'copied' | 'failed';

const TOAST_MS = 1800;

/**
 * Contact card.
 *
 * The clipboard write is attempted with the async API and falls back to
 * selecting the address, because the API is unavailable on insecure origins —
 * which includes any preview served over plain http, not just a rare browser.
 * The toast is a live region so the confirmation reaches a screen reader rather
 * than only sighted users.
 */
export function ContactSection({ station }: { station: ContactStation }) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = useCallback((next: CopyState) => {
    setCopyState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState('idle'), TOAST_MS);
  }, []);

  const copyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(station.email);
      flash('copied');
    } catch {
      // No clipboard permission, or an insecure origin. Selecting the address
      // is the honest fallback: the user can copy it themselves.
      flash('failed');
    }
  }, [flash, station.email]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.9rem] leading-relaxed text-mist-200">{station.intro}</p>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`mailto:${station.email}?subject=${encodeURIComponent(station.mailtoSubject)}`}
          className="font-mono text-sm break-all text-neon-teal underline decoration-neon-teal/40 underline-offset-4 transition-colors hover:decoration-neon-teal"
        >
          {station.email}
        </a>
        <button
          type="button"
          onClick={() => {
            void copyEmail();
          }}
          aria-label={SITE_CHROME.ui.actions.copyEmail}
          className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-mist-200 transition-colors hover:border-neon-teal/60 hover:text-neon-teal"
        >
          {copyState === 'copied' ? (
            <Check aria-hidden="true" className="size-4" strokeWidth={2.4} />
          ) : (
            <Copy aria-hidden="true" className="size-4" strokeWidth={2} />
          )}
        </button>
      </div>

      <p role="status" aria-live="polite" className="min-h-4 font-mono text-[0.62rem] tracking-[0.18em] text-mist-400 uppercase">
        {copyState === 'copied' && (
          <span className="text-neon-teal">{SITE_CHROME.ui.actions.copied}</span>
        )}
        {copyState === 'failed' && (
          <span className="text-neon-amber">{SITE_CHROME.ui.actions.copyFailed}</span>
        )}
      </p>

      <ul className="flex flex-wrap gap-2">
        {station.socials.map((social) => {
          const Icon = iconFor(social.icon);
          return (
            <li key={social.href}>
              <a
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                data-magnetic=""
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 font-mono text-[0.66rem] tracking-[0.14em] text-mist-100 uppercase transition-colors hover:border-neon-violet/60 hover:text-neon-violet"
              >
                <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
                {social.label}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
        <p className="text-[0.85rem] text-mist-300">{station.closing}</p>
        <button
          type="button"
          /*
           * Wrapped rather than passed directly: the click event would land in
           * the `instant` parameter (an object is truthy), turning every ride
           * into an instant jump. Reduced-motion readers still get the instant
           * path — through the media query, not by accident.
           */
          onClick={() => scrollToTop()}
          data-magnetic=""
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-neon-teal/35 px-4 py-2 font-mono text-[0.64rem] font-semibold tracking-[0.16em] text-neon-teal uppercase transition-colors hover:border-neon-teal hover:bg-neon-teal/10"
        >
          <RotateCcw aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
          {SITE_CHROME.ui.actions.rideAgain}
        </button>
      </div>
    </div>
  );
}
