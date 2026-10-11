import { useEffect, useRef, useState } from 'react';
import {
  IDENTITY,
  SITE_CHROME,
  STATIONS,
  getStationContent,
  type StationId,
} from '../../data/content';

/**
 * Navigation for the 2D experience.
 *
 * Station links are real `<a href="#station-…">` elements rather than buttons
 * with a click handler. In 2D mode every station is a section of one document,
 * so these are ordinary in-page links, and treating them as buttons costs three
 * things a reader would otherwise get for free: the status bar shows the target,
 * "open in new tab" works, and — the one that actually matters for the
 * accessibility budget — a link conveys "this goes somewhere" while a button
 * conveys "this does something".
 *
 * The delegated scroll driver still animates these for readers who want it; the
 * browser's own fragment navigation is what happens when they do not.
 */
interface Nav2DProps {
  /** Station currently occupying the viewport, for the highlight. */
  activeStation: StationId;
  /** Smooth-scroll to a station. */
  onStationClick: (id: StationId) => void;
  /** Scroll back to the top. */
  onHomeClick: () => void;
  /** Whether returning to 3D is possible (needs a WebGL context). */
  canSwitchTo3D: boolean;
  /** Switch back to 3D. */
  onSwitchTo3D: () => void;
}

export function Nav2D({
  activeStation,
  onStationClick,
  onHomeClick,
  canSwitchTo3D,
  onSwitchTo3D,
}: Nav2DProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  /*
   * Background state only. Coalesced into rAF and compared against the current
   * value so a scroll does not re-render on every event — the class drives a
   * shadow, and a shadow that is already on does not need React to agree again.
   */
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled((was) => {
        const now = window.scrollY > 20;
        return was === now ? was : now;
      });
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  /*
   * Escape closes the mobile menu.
   *
   * Without it the panel is only reachable by tabbing to its toggle, which sits
   * *before* the panel in the DOM: a keyboard user opens the menu, tabs forward
   * into it, and then cannot get back to the button without cycling the entire
   * page. Escape is the conventional way out of a disclosure like this.
   */
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  /* The panel is off-screen when closed, so it must not be focusable. */
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) panel.inert = !menuOpen;
  }, [menuOpen]);

  const handleStationClick = (id: StationId) => {
    onStationClick(id);
    setMenuOpen(false);
  };

  return (
    <header className={`nav-2d ${scrolled ? 'scrolled' : ''} ${menuOpen ? 'menu-open' : ''}`}>
      <div className="nav-inner">
        <a
          href="#station-hero"
          onClick={(event) => {
            event.preventDefault();
            onHomeClick();
          }}
          className="logo"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 64 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8 20h8M16 20h8M24 20h8M32 20h8M40 20h8M48 20h8M56 20h8" strokeLinecap="round" />
            <circle cx="12" cy="24" r="4" fill="none" stroke="currentColor" />
            <circle cx="44" cy="24" r="4" fill="none" stroke="currentColor" />
            <path d="M8 20 L12 16 L20 16 L24 20" fill="none" strokeLinejoin="round" />
            <path d="M40 20 L44 16 L52 16 L56 20" fill="none" strokeLinejoin="round" />
          </svg>
          <span className="logo-text">{IDENTITY.name}</span>
          <span className="sr-only">{SITE_CHROME.ui.nav.home}</span>
        </a>

        <nav className="nav-links" aria-label={SITE_CHROME.ui.nav.label}>
          {/*
            One `<ul>`, revealed as a panel on narrow screens and laid out inline
            on wide ones. The breakpoint moves the `open` class between the list
            and its wrapper rather than rendering two navigations — two copies of
            the same links in the DOM is a duplicate-content and duplicate-id
            problem, and screen readers announce both.
          */}
          <div
            ref={panelRef}
            id="nav-menu"
            className={`nav-panel ${menuOpen ? 'open' : ''}`}
          >
            <ul className="nav-list">
              {STATIONS.map((station) => {
                const isActive = activeStation === station.id;
                return (
                  <li key={station.id}>
                    <a
                      href={`#station-${station.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        handleStationClick(station.id);
                      }}
                      className={`nav-link ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      {getStationContent(station.id).navLabel}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        <div className="nav-actions">
          <a
            href={SITE_CHROME.resume.href}
            download
            className="btn btn-ghost btn-sm"
            /*
             * The visible label hides below 480px (`.btn-text`), leaving only
             * the icon — and an icon-only link with no name. The aria-label
             * carries the name at every width, so the accessible name never
             * depends on which breakpoint is showing.
             */
            aria-label={SITE_CHROME.resume.label}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="btn-text">{SITE_CHROME.resume.label}</span>
          </a>

          {/*
            Social links live in the panel on narrow screens and in the footer on
            wide ones. Duplicating them in the header as well would put two
            identical links within a few hundred pixels of each other on desktop,
            which is noise in a tab order for no benefit.
          */}

          {canSwitchTo3D && (
            <button
              type="button"
              onClick={onSwitchTo3D}
              className="btn btn-primary btn-sm mode-toggle"
              /*
               * Same hidden-label problem as the resume link above: below
               * 480px only the icon shows. The label matches the visible text
               * exactly, so speech-input users ("click Try 3D") land on the
               * same name a screen reader announces (WCAG 2.5.3).
               */
              aria-label="Try 3D"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                focusable="false"
              >
                <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                <line x1="12" y1="22" x2="12" y2="15.5" />
                <line x1="22" y1="15.5" x2="12" y2="11" />
                <line x1="2" y1="15.5" x2="12" y2="11" />
              </svg>
              <span className="btn-text">Try 3D</span>
            </button>
          )}

          <button
            type="button"
            ref={toggleRef}
            onClick={() => setMenuOpen((open) => !open)}
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              focusable="false"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/*
        Click-outside dismiss. `aria-hidden` rather than a button role: this is a
        redundant affordance for pointer users — the toggle and Escape both work —
        and announcing it would just be noise in the accessibility tree.
      */}
      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
    </header>
  );
}