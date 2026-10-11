import type { FreelanceStation } from '../../../data/content';
import { ProjectCard } from './ProjectCard';

/** Client work only. Personal side projects are deliberately not listed. */
export function FreelanceSection({ station }: { station: FreelanceStation }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.78rem] leading-relaxed text-mist-400">{station.note}</p>

      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        {station.projects.map((project, index) => (
          <li key={project.id} className="rounded-lg border border-white/10 bg-ink-950/35 p-3">
            <ProjectCard project={project} index={index} />
          </li>
        ))}
      </ul>
    </div>
  );
}
