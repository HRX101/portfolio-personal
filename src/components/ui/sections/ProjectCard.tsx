import { ExternalLink } from 'lucide-react';
import { SITE_CHROME, type FreelanceProject } from '../../../data/content';
import type { CssVars } from '../vars';

/**
 * One client engagement.
 *
 * No metric, download count or client claim appears on this card. Everything the
 * owner has not confirmed is still a literal `TODO(owner):` line in the data, and
 * the dev-only badge says so out loud rather than letting a placeholder pass as
 * finished copy. The TODO prefix also means the card is self-announcing in
 * production: a reader sees the placeholder text, not a silently missing fact.
 */
export function ProjectCard({
  project,
  index,
}: {
  project: FreelanceProject;
  index: number;
}) {
  const showBadge = import.meta.env.DEV && project.placeholder;

  return (
    <article className="stagger-item flex flex-col gap-2" style={{ '--i': index } as CssVars}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-mist-100">{project.title}</h3>
        {showBadge && (
          <span className="shrink-0 rounded-full border border-neon-amber/45 px-2 py-0.5 font-mono text-[0.55rem] tracking-[0.14em] text-neon-amber uppercase">
            {SITE_CHROME.ui.badges.placeholder}
          </span>
        )}
      </div>

      {project.image && (
        <img
          src={project.image}
          alt={`${project.title} screenshot`}
          loading="lazy"
          decoding="async"
          className="w-full rounded-md border border-white/10"
        />
      )}

      <p className="text-[0.82rem] leading-relaxed text-mist-300">{project.description}</p>

      <p className="text-[0.75rem] leading-relaxed text-mist-400">{project.role}</p>

      <ul className="mt-0.5 flex flex-wrap gap-1">
        {project.tags.map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 font-mono text-[0.6rem] text-mist-300"
          >
            {tag}
          </li>
        ))}
      </ul>

      {project.link && (
        <a
          href={project.link}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto mt-1 inline-flex w-fit items-center gap-1.5 font-mono text-[0.66rem] tracking-[0.16em] text-neon-teal uppercase transition-colors hover:text-mist-100"
        >
          <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={2} />
          {project.linkLabel ?? SITE_CHROME.ui.actions.viewProject}
        </a>
      )}
    </article>
  );
}
