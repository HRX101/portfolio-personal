/**
 * Privacy-friendly analytics stub (Phase 7).
 *
 * Completely inert unless configured: with no `VITE_ANALYTICS_ENDPOINT` set,
 * every function here is a no-op and no request ever leaves the browser. When
 * configured, it POSTs minimal JSON events (page view + 3D/2D mode choice) to a
 * first-party or privacy-friendly endpoint such as Umami or Plausible — never a
 * third-party tracker script, so there is nothing to consent to:
 *
 * - No cookies are read or written, ever.
 * - No fingerprinting: URL path, mode and referrer only.
 * - `navigator.doNotTrack` is honoured before anything is sent.
 * - `navigator.sendBeacon` (or `fetch` with `keepalive` as fallback) so events
 *   never delay navigation or compete with rendering.
 *
 * To enable: set VITE_ANALYTICS_ENDPOINT (and VITE_ANALYTICS_SITE if the
 * endpoint needs a site identifier) and rebuild. See `.env.example`.
 */
interface AnalyticsEvent {
  /** Event name, e.g. `pageview` or `mode-choice`. */
  kind: string;
  /** Page path at the time of the event. */
  path: string;
  /** Active experience mode, when known. */
  mode?: '3D' | '2D';
}

function endpoint(): string | null {
  try {
    const url = import.meta.env?.VITE_ANALYTICS_ENDPOINT as string | undefined;
    return url && url.trim() !== '' ? url.trim() : null;
  } catch {
    return null;
  }
}

function siteId(): string {
  try {
    return (import.meta.env?.VITE_ANALYTICS_SITE as string | undefined) ?? window.location.hostname;
  } catch {
    return window.location.hostname;
  }
}

function allowed(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // Respect Do Not Track in all its historical spellings.
  if (
    navigator.doNotTrack === '1' ||
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack === '1' ||
    (window as Window & { doNotTrack?: string }).doNotTrack === '1'
  ) {
    return false;
  }
  return endpoint() !== null;
}

function send(event: AnalyticsEvent): void {
  const url = endpoint();
  if (url === null) return;
  const payload = JSON.stringify({
    ...event,
    site: siteId(),
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
  });
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Analytics must never surface an error to the reader.
    });
  } catch {
    // Analytics must never throw, either.
  }
}

/** Whether any analytics event will actually be sent this session. */
export const analyticsEnabled = (): boolean => allowed();

/** Records the initial page view. Call once per page load. */
export function trackPageView(mode?: '3D' | '2D'): void {
  if (!allowed()) return;
  send({ kind: 'pageview', path: window.location.pathname, mode });
}

/** Records an explicit 3D/2D mode choice. Fires on user switches, not on auto. */
export function trackModeChoice(mode: '3D' | '2D'): void {
  if (!allowed()) return;
  send({ kind: 'mode-choice', path: window.location.pathname, mode });
}
