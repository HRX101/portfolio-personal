import { useState } from 'react';
import type { SkillGroup } from '../../../data/content';
import type { CssVars } from '../vars';

interface Tile {
  name: string;
  detail: string;
  groupId: string;
  groupLabel: string;
}

/**
 * Every skill in one flat, keyboard-navigable cloud, grouped by family.
 *
 * The group name is only shown for the family currently hovered or focused,
 * which keeps a fifty-chip wall from turning into a wall of repeated headings.
 * To get there without fifty tab stops the tiles use a roving tabindex on a
 * `toolbar`: the cloud is one tab stop and the arrow keys move within it, which
 * is the standard pattern for a dense control strip. Each chip still carries its
 * group and detail in its accessible name, so a screen reader announces
 * "LangGraph — Generative AI & Agents: stateful graph orchestration" rather than
 * a bare word.
 */
export function SkillTiles({ groups }: { groups: SkillGroup[] }) {
  const tiles: Tile[] = groups.flatMap((group) =>
    group.skills.map((skill) => ({
      name: skill.name,
      detail: skill.detail,
      groupId: group.id,
      groupLabel: group.label,
    })),
  );

  // The roving tabindex position, and whichever chip is hovered or focused.
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const current = tiles[activeIndex ?? cursor];
  const group = groups.find((candidate) => candidate.id === current?.groupId);
  const allLabels = groups.map((entry) => entry.label).join(' · ');

  const move = (next: number) => {
    const index = (next + tiles.length) % tiles.length;
    setCursor(index);
    setActiveIndex(index);
    // Focus has to follow the highlight, or the arrow keys would move the
    // readout while the screen reader stayed on the old chip.
    document.getElementById(`skill-tile-${index}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="min-h-11 rounded-lg border border-white/10 bg-ink-950/50 px-3 py-2"
        aria-live="polite"
      >
        <p className="font-mono text-[0.62rem] tracking-[0.28em] text-neon-teal uppercase">
          {group?.label ?? allLabels}
        </p>
        <p className="mt-1 text-[0.78rem] leading-snug text-mist-300">
          {current?.detail ?? ''}
        </p>
      </div>

      <div
        className="flex flex-wrap gap-1.5"
        /* Marks the group the ripple CSS scopes itself to, so hovering a tile only
           stirs its own row. */
        data-skill-row=""
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={group?.label ?? allLabels}
        onKeyDown={(event) => {
          switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
              event.preventDefault();
              move(cursor + 1);
              break;
            case 'ArrowLeft':
            case 'ArrowUp':
              event.preventDefault();
              move(cursor - 1);
              break;
            case 'Home':
              event.preventDefault();
              move(0);
              break;
            case 'End':
              event.preventDefault();
              move(tiles.length - 1);
              break;
            default:
              break;
          }
        }}
      >
        {tiles.map((tile, index) => (
          <button
            key={`${tile.groupId}-${tile.name}`}
            type="button"
            id={`skill-tile-${index}`}
            tabIndex={index === cursor ? 0 : -1}
            data-active={tile.groupId === current?.groupId}
            style={{ '--tile-index': index } as CssVars}
            onFocus={() => {
              setCursor(index);
              setActiveIndex(index);
            }}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            aria-label={`${tile.name} — ${tile.groupLabel}: ${tile.detail}`}
            className="skill-tile rounded-full border px-2.5 py-1 font-mono text-[0.68rem] tracking-wide whitespace-nowrap transition-colors duration-200"
          >
            {tile.name}
          </button>
        ))}
      </div>
    </div>
  );
}
