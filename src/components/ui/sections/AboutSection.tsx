import type { AboutStation } from '../../../data/content';
import { SkillTiles } from './SkillTiles';

/**
 * About and Skills.
 *
 * The summary paragraph is repeated here rather than referenced from the hero:
 * the hero shows the condensed one-liner, this is the full text, and a reader
 * who only ever sees one card still gets the substantive version.
 */
export function AboutSection({ station }: { station: AboutStation }) {
  return (
    <div className="flex flex-col gap-5">
      {station.paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-[0.94rem] leading-relaxed text-mist-200">
          {paragraph}
        </p>
      ))}

      <SkillTiles groups={station.skillGroups} />
    </div>
  );
}
