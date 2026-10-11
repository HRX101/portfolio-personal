import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { SITE_CHROME, type ExperienceRole, type ExperienceStation } from '../../../data/content';
import type { CssVars } from '../vars';

/** Projects shown before a role is expanded. */
const COLLAPSED_COUNT = 2;

/**
 * Vertical timeline of roles.
 *
 * Telaverge carries five projects and Persistent Systems two, so the long role
 * collapses to its first two entries behind a toggle. The alternative — an
 * internally scrolling card — was rejected: a nested scroll area captures the
 * wheel and touch drag, and page scroll has to stay the only scroll driver in
 * the experience. Expanding in place keeps the page the single source of motion.
 */
export function ExperienceSection({ station }: { station: ExperienceStation }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <ol className="relative flex flex-col gap-5 border-l border-white/12 pl-5">
      {station.roles.map((role) => {
        const open = expanded[role.company] ?? false;
        const collapsible = role.projects.length > COLLAPSED_COUNT;
        const visible = open || !collapsible ? role.projects : role.projects.slice(0, COLLAPSED_COUNT);

        return (
          <li key={role.company} className="relative">
            <span
              aria-hidden="true"
              className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border border-neon-teal bg-ink-950"
            />
            <RoleBlock
              role={role}
              index={station.roles.indexOf(role)}
              projects={visible}
              hiddenCount={role.projects.length - visible.length}
              open={open}
              collapsible={collapsible}
              onToggle={() =>
                setExpanded((previous) => ({ ...previous, [role.company]: !open }))
              }
            />
          </li>
        );
      })}
    </ol>
  );
}

interface RoleBlockProps {
  role: ExperienceRole;
  index: number;
  projects: ExperienceRole['projects'];
  hiddenCount: number;
  open: boolean;
  collapsible: boolean;
  onToggle: () => void;
}

function RoleBlock({
  role,
  index,
  projects,
  hiddenCount,
  open,
  collapsible,
  onToggle,
}: RoleBlockProps) {
  return (
    <article className="stagger-item" style={{ '--i': index } as CssVars}>
      <h3 className="font-display text-base leading-snug font-semibold text-mist-100">
        {role.role}, {role.company}
      </h3>
      <p className="mt-1 font-mono text-[0.66rem] tracking-[0.18em] text-neon-teal/85 uppercase">
        {role.period}
        <span className="text-mist-400"> · {role.workMode} · {role.location}</span>
      </p>

      <ul className="mt-2.5 flex flex-wrap gap-1">
        {role.stack.map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 font-mono text-[0.6rem] text-mist-300"
          >
            {tag}
          </li>
        ))}
      </ul>

      <ul className="mt-3 flex flex-col gap-2.5">
        {projects.map((project, projectIndex) => (
          <li
            key={project.name}
            className="stagger-item"
            style={{ '--i': index * 2 + projectIndex + 1 } as CssVars}
          >
            <p className="text-[0.88rem] leading-snug font-medium text-mist-100">{project.name}</p>
            <p className="text-[0.8rem] leading-relaxed text-mist-300">{project.summary}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {project.highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="relative pl-3 text-[0.76rem] leading-relaxed text-mist-400 before:absolute before:top-[0.55em] before:left-0 before:size-1 before:rounded-full before:bg-neon-violet/80"
                >
                  {highlight}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {collapsible && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="pointer-events-auto mt-2.5 inline-flex items-center gap-1.5 font-mono text-[0.64rem] tracking-[0.18em] text-neon-teal uppercase transition-colors hover:text-mist-100"
        >
          {open ? (
            <ChevronUp aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          ) : (
            <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          )}
          {open ? SITE_CHROME.ui.actions.showLess : `${SITE_CHROME.ui.actions.showAll} (${hiddenCount})`}
        </button>
      )}
    </article>
  );
}
