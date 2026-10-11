import { GraduationCap, Languages, Trophy } from 'lucide-react';
import { SITE_CHROME, type AchievementsStation } from '../../../data/content';
import type { CssVars } from '../vars';

/**
 * Awards, academic record and languages.
 *
 * Education and languages are deliberately the compact secondary block: they are
 * real content the owner asked for, but they are supporting detail beside the
 * awards rather than a second headline, so they get a tighter type scale in the
 * same card.
 */
export function AchievementsSection({ station }: { station: AchievementsStation }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2.5">
        {station.achievements.map((achievement, index) => (
          <li
            key={achievement.id}
            className="stagger-item flex items-start gap-2.5"
            style={{ '--i': index } as CssVars}
          >
            <Trophy
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-neon-amber"
              strokeWidth={2}
            />
            <span className="text-[0.85rem] leading-snug text-mist-100">
              {achievement.title}
              <span className="block font-mono text-[0.62rem] tracking-[0.14em] text-mist-400 uppercase">
                {[achievement.issuer, achievement.year].filter(Boolean).join(' · ')}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <ul className="flex flex-col gap-1.5 border-t border-white/10 pt-3">
        {station.community.map((entry) => (
          <li key={entry.id} className="text-[0.8rem] leading-snug text-mist-200">
            <span className="text-mist-100">{entry.title}</span>
            <span className="text-mist-400"> — {entry.detail}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-white/10 bg-ink-950/35 p-3">
          <h3 className="flex items-center gap-1.5 font-mono text-[0.62rem] tracking-[0.24em] text-neon-teal uppercase">
            <GraduationCap aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {SITE_CHROME.ui.labels.education}
          </h3>
          <div className="mt-2 flex flex-col gap-2.5">
            {station.education.map((group) => (
              <div key={group.label}>
                <p className="font-mono text-[0.58rem] tracking-[0.2em] text-mist-400 uppercase">
                  {group.label}
                </p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {group.records.map((record) => (
                    <li key={record.id}>
                      <p className="text-[0.78rem] leading-snug text-mist-100">
                        {record.qualification}
                      </p>
                      <p className="font-mono text-[0.64rem] text-neon-teal">{record.score}</p>
                      <p className="text-[0.68rem] text-mist-400">
                        {record.institution} · {record.period}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-ink-950/35 p-3">
          <h3 className="flex items-center gap-1.5 font-mono text-[0.62rem] tracking-[0.24em] text-neon-teal uppercase">
            <Languages aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {station.languages.label}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1">
            {station.languages.items.map((item) => (
              <li
                key={item}
                className="rounded-full border border-white/12 bg-white/4 px-2 py-0.5 font-mono text-[0.64rem] text-mist-200"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
