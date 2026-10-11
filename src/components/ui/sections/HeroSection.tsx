import { ArrowDown, FileText, Mail, MapPin } from 'lucide-react';
import { IDENTITY, SITE_CHROME, STATION_IDS, getStationContent, type HeroStation } from '../../../data/content';
import { scrollToStationId } from '../../../hooks/useScrollProgress';
import type { CssVars } from '../vars';

/** The station after the hero, for the scroll cue's shortcut. */
const NEXT_STATION = STATION_IDS[1] ?? 'about';

/**
 * Opening card.
 *
 * The name is an `<h1>` and the only place it appears; every later station is an
 * `<h2>`, so the document outline is one h1 followed by six siblings. Letters
 * are split into spans purely for the reveal — the split copy is `aria-hidden`
 * with a single readable copy of the name behind it, because assistive
 * technology would otherwise spell the name out letter by letter.
 */
export function HeroSection({ station }: { station: HeroStation }) {
  return (
    <div className="flex flex-col items-start gap-5">
      <p className="font-mono text-[0.68rem] tracking-[0.34em] text-neon-teal/90 uppercase">
        {station.eyebrow}
      </p>

      <h1
        id="hero-heading"
        className="font-display text-5xl leading-[0.95] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl"
      >
        <span aria-hidden="true" className="block">
          {IDENTITY.name.split('').map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className="hero-letter inline-block"
              style={{ '--i': index } as CssVars}
            >
              {letter === ' ' ? ' ' : letter}
            </span>
          ))}
        </span>
        <span className="sr-only">{IDENTITY.name}</span>
      </h1>

      <p className="text-gradient font-display text-lg font-medium tracking-tight sm:text-xl">
        {IDENTITY.title}
      </p>

      <p className="max-w-[34rem] text-base leading-relaxed text-mist-200">{station.tagline}</p>

      <p className="flex items-center gap-2 font-mono text-xs tracking-[0.16em] text-mist-300 uppercase">
        <MapPin aria-hidden="true" className="size-3.5 text-neon-teal" strokeWidth={2} />
        {IDENTITY.location}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-3">
        <a
          href={SITE_CHROME.resume.href}
          download
          data-magnetic=""
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-neon-teal px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.16em] text-ink-950 uppercase transition-transform hover:scale-[1.03] active:scale-100"
        >
          <FileText aria-hidden="true" className="size-4" strokeWidth={2} />
          {SITE_CHROME.ui.actions.downloadResume}
        </a>
        <a
          href={`#station-${station.cta.targetId}`}
          data-magnetic=""
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-neon-violet/45 px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.16em] text-mist-100 uppercase transition-colors hover:border-neon-violet hover:text-neon-violet"
        >
          <Mail aria-hidden="true" className="size-4" strokeWidth={2} />
          {station.cta.label}
        </a>
      </div>

      <button
        type="button"
        onClick={() => scrollToStationId(NEXT_STATION)}
        className="hero-cue pointer-events-auto mt-4 inline-flex items-center gap-2 font-mono text-[0.68rem] tracking-[0.3em] text-mist-200 uppercase transition-colors hover:text-neon-teal"
      >
        {station.scrollHint}
        <ArrowDown aria-hidden="true" className="hero-cue-arrow size-4 text-neon-teal" strokeWidth={2} />
        <span className="sr-only">— {getStationContent(NEXT_STATION).navLabel}</span>
      </button>
    </div>
  );
}
