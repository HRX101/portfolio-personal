import { useEffect, useRef } from 'react';
import type { Station } from '../../data/content';
import { onStationFrame, readActiveStation } from '../../hooks/useActiveStationStore';
import { useActiveStation } from '../../hooks/useActiveStation';
import { AboutSection } from './sections/AboutSection';
import { AchievementsSection } from './sections/AchievementsSection';
import { ContactSection } from './sections/ContactSection';
import { ExperienceSection } from './sections/ExperienceSection';
import { FreelanceSection } from './sections/FreelanceSection';
import { HeroSection } from './sections/HeroSection';
import { ResearchSection } from './sections/ResearchSection';

interface Props {
  station: Station;
  /** Position in the ride; also picks which side of the road the card sits on. */
  index: number;
}

/**
 * The DOM half of one station.
 *
 * Three decisions worth stating, because they are what keeps this cheap and
 * accessible at the same time:
 *
 * 1. The section is always mounted. Crawlers, the no-JS SEO block's replacement
 *    and screen readers all get the real text; the 3D layer is decoration on
 *    top, not the source of the content.
 *
 * 2. Opacity and transform are written straight to the node from the shared
 *    station ticker. Seven sections re-rendering every frame would cost more
 *    than the whole scene, and the value is continuous, so it never belongs in
 *    React state.
 *
 * 3. Inactive cards keep their text in the accessibility tree but drop their
 *    links and buttons out of the tab order. A card the reader cannot see must
 *    not be able to take focus, or the focus ring disappears somewhere off
 *    screen; but hiding it from assistive technology too would mean a screen
 *    reader user could only ever read one station. `visibility: hidden` would
 *    solve the focus half by destroying the reading half, so the tab order is
 *    managed explicitly instead.
 */
export function StationSection({ station, index }: Props) {
  const ref = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { activeId } = useActiveStation();
  const isActive = activeId === station.id;
  // Last quantized visibility written by the frame loop below. A ref (not state):
  // it is written 60x/s and must never re-render.
  const writtenRef = useRef<number | undefined>(undefined);

  // Continuous values: one shared frame loop, one style write per section.
  // Write-cached: while parked every value below is identical frame to frame, and
  // an unconditional write still invalidates style and keeps the compositor busy
  // at 60fps for a card nobody can see move. The cache lives in the closure so a
  // remount (quality switch) starts clean rather than inheriting stale strings.
  useEffect(
    () =>
      onStationFrame(() => {
        const section = ref.current;
        const card = cardRef.current;
        if (!section || !card) return;

        const visibility = readActiveStation().visibilities[index] ?? 0;
        const quantized = Math.round(visibility * 1000);
        const cache = writtenRef.current;
        if (quantized !== cache) {
          writtenRef.current = quantized;
          section.style.opacity = (quantized / 1000).toFixed(3);
          // Drifts in from below as the station comes into range, and a touch of
          // scale so the card settles rather than sliding flat.
          card.style.transform = `translate3d(0, ${(((1000 - quantized) / 1000) * 26).toFixed(2)}px, 0) scale(${(0.985 + (quantized / 1000) * 0.015).toFixed(4)})`;

          const interactive = quantized > 600;
          // Only the card takes pointer input, and only while it is actually
          // readable. The section itself stays transparent to the pointer, so
          // nothing in the overlay can ever intercept a wheel or touch drag.
          card.style.pointerEvents = interactive ? 'auto' : 'none';
          section.style.visibility = quantized > 4 ? 'visible' : 'hidden';
        }
      }),
    [index],
  );

  // Discrete: only when this station gains or loses the screen.
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    setCardTabbable(section, isActive);
  }, [isActive]);

  // Station i is centred for the opening shot, then alternates sides so the card
  // never sits on top of the bike the reader is watching.
  const alignment =
    index === 0 ? 'justify-center' : index % 2 === 1 ? 'justify-start' : 'justify-end';

  return (
    <section
      ref={ref}
      id={`station-${station.id}`}
      tabIndex={-1}
      aria-labelledby={`${station.id}-heading`}
      data-active={isActive}
      className={`pointer-events-none absolute inset-0 flex items-center px-5 py-20 sm:px-8 ${alignment}`}
      style={{ opacity: 0, visibility: 'hidden' }}
    >
      <div
        ref={cardRef}
        /*
         * Tilt is only offered while the card is the one on screen. Expressed as
         * an attribute rather than a per-frame visibility test inside the pointer
         * loop, so the loop never has to ask which cards are currently shown —
         * adding and removing the attribute is what the micro-interaction layer
         * watches for.
         */
        data-tilt={isActive ? '' : undefined}
        className="station-card w-full max-w-[520px] rounded-2xl px-5 py-5 sm:px-6 sm:py-6"
      >
        {index !== 0 && (
          <>
            <p className="font-mono text-[0.64rem] tracking-[0.32em] text-neon-teal uppercase">
              {station.eyebrow}
            </p>
            <h2
              id={`${station.id}-heading`}
              className="font-display mt-2 text-2xl leading-[1.1] font-semibold tracking-tight text-balance text-mist-100 sm:text-[1.75rem]"
            >
              {station.heading}
            </h2>
            <div aria-hidden="true" className="hairline mt-3 h-px w-20" />
          </>
        )}

        <div className={index === 0 ? '' : 'mt-4'}>{renderBody(station)}</div>
      </div>
    </section>
  );
}

/**
 * Attribute holding an element's authored `tabindex` while it is parked.
 *
 * The value is the original attribute text, or the empty string when the element
 * had no `tabindex` at all and should simply have it removed again. Storing the
 * value rather than a boolean is what makes restoring exact for both kinds.
 */
const ORIGINAL_TABINDEX = 'data-original-tabindex';

/**
 * Toggles the tab order of everything inside a card without touching its text.
 *
 * Idempotent by construction, because it runs on mount for all seven cards
 * (six of them inactive) and again on every station change — including React's
 * StrictMode double-invoke in development. Recording the original value on the
 * first pass and never overwriting it means a second pass cannot mistake the
 * `-1` it just wrote for the author's intent and fail to undo it later.
 */
function setCardTabbable(section: HTMLElement, tabbable: boolean): void {
  const focusable = section.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]',
  );

  for (const element of focusable) {
    if (tabbable) {
      // Restore: put back exactly what React rendered.
      const original = element.getAttribute(ORIGINAL_TABINDEX);
      if (original === null) continue;
      element.removeAttribute(ORIGINAL_TABINDEX);
      if (original === '') element.removeAttribute('tabindex');
      else element.setAttribute('tabindex', original);
      continue;
    }

    // Park. Record the authored value the first time only.
    if (!element.hasAttribute(ORIGINAL_TABINDEX)) {
      element.setAttribute(ORIGINAL_TABINDEX, element.getAttribute('tabindex') ?? '');
    }
    element.setAttribute('tabindex', '-1');
  }
}

function renderBody(station: Station) {
  switch (station.id) {
    case 'hero':
      return <HeroSection station={station} />;
    case 'about':
      return <AboutSection station={station} />;
    case 'experience':
      return <ExperienceSection station={station} />;
    case 'freelance':
      return <FreelanceSection station={station} />;
    case 'research':
      return <ResearchSection station={station} />;
    case 'achievements':
      return <AchievementsSection station={station} />;
    case 'contact':
      return <ContactSection station={station} />;
    default:
      return null;
  }
}
