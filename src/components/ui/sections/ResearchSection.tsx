import { BookOpen, ExternalLink } from 'lucide-react';
import type { ResearchStation } from '../../../data/content';
import type { CssVars } from '../vars';

/**
 * Publication list.
 *
 * Venue and year render only where the data has them: two of the six papers
 * have no recorded venue, and printing an empty "—" or a guessed year would be a
 * claim nobody made. `publication.url` is wired through if the owner adds DOIs
 * later; today every entry is plain text.
 */
export function ResearchSection({ station }: { station: ResearchStation }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.88rem] leading-relaxed text-mist-200">{station.intro}</p>

      <ul className="flex flex-wrap gap-1">
        {station.domainTags.map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-neon-violet/30 bg-neon-violet/8 px-2 py-0.5 font-mono text-[0.6rem] text-mist-200"
          >
            {tag}
          </li>
        ))}
      </ul>

      <ol className="flex flex-col divide-y divide-white/8 border-y border-white/8">
        {station.publications.map((publication, index) => {
          const meta = [publication.venue, publication.year].filter(Boolean).join(' · ');
          return (
            <li
              key={publication.id}
              className="stagger-item flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
              style={{ '--i': index } as CssVars}
            >
              {publication.url ? (
                <a
                  href={publication.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto text-[0.85rem] leading-snug text-mist-100 underline decoration-neon-teal/40 underline-offset-4 transition-colors hover:text-neon-teal"
                >
                  {publication.title}
                </a>
              ) : (
                <span className="text-[0.85rem] leading-snug text-mist-100">
                  {publication.title}
                </span>
              )}
              {meta && (
                <span className="shrink-0 font-mono text-[0.62rem] tracking-[0.12em] text-mist-400 uppercase">
                  {meta}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <a
        href={station.scholarLink.href}
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto inline-flex w-fit items-center gap-2 rounded-full border border-neon-teal/35 px-4 py-2 font-mono text-[0.66rem] font-semibold tracking-[0.16em] text-neon-teal uppercase transition-colors hover:border-neon-teal hover:bg-neon-teal/10"
      >
        {/*
          The Scholar link's `icon` key is resolved through the registry at the
          data layer rather than here, so a link picks its glyph without this
          component constructing one. Lucide has no Scholar brand mark, so the
          registry maps that key to the book glyph.
        */}
        <BookOpen aria-hidden="true" className="size-4" strokeWidth={2} />
        {station.scholarLink.label}
        <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={2} />
      </a>
    </div>
  );
}
