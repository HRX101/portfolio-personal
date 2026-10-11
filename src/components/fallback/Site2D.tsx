import { useEffect, useRef, useState } from 'react';
import {
  IDENTITY,
  SITE_CHROME,
  STATIONS,
  getStationContent,
  type Station,
  type StationId,
} from '../../data/content';
import { useAnchorScroll, scrollToStationById, scrollToTop } from '../../hooks/useScrollProgress';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ScrollProgress } from '../ui/ScrollProgress';
import { Nav2D } from './Nav2D';
import { Footer2D } from './Footer2D';
import './Site2D.css';

/**
 * ============================================================================
 * 2D LIGHTWEIGHT FALLBACK — PHASE 6
 * ============================================================================
 *
 * A fully designed, content-complete version of the portfolio with NO three.js.
 * Dynamically imported so the 3D bundle is never downloaded when mode is '2D'.
 *
 * Features:
 * - Same content from content.ts (Hero, About, Experience, Freelance, Research, Achievements, Contact)
 * - Same visual identity: dusk gradient background, glass cards, accent colors
 * - Lightweight scroll reveals via IntersectionObserver (no Framer Motion)
 * - Subtle decorative bike silhouette that follows scroll (CSS offset-path)
 * - Respects reduced-motion (disables bike animation and scroll reveals)
 * - Sticky nav with section links, resume button, social icons
 * - "Try the 3D experience" button when device is capable
 * - Sticky progress bar (horizontal on mobile)
 * - Keyboard accessible, WCAG AA contrast
 */

function BikeSilhouette() {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = limit > 0 ? window.scrollY / limit : 0;
      el.style.setProperty('--bike-progress', `${ratio * 100}%`);
    };
    // rAF-coalesced and writing straight to the DOM element: a scroll handler
    // that called setState would re-render the silhouette on every scroll
    // event, on the same thread as the scroll itself.
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div ref={ref} className="bike-silhouette" aria-hidden="true">
      <svg viewBox="0 0 64 32" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M8 20h8M16 20h8M24 20h8M32 20h8M40 20h8M48 20h8M56 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="44" cy="24" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 20 L12 16 L20 16 L24 20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        <path d="M40 20 L44 16 L52 16 L56 20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * Social icon paths, inlined so the 2D build pulls in no icon dependency.
 * Every entry is decorative: the adjacent label carries the accessible name.
 */
const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  github: (
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
  ),
  linkedin: (
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
  ),
  email: (
    <>
      <path d="M4 5h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2Z" />
      <polyline points="22,7 12,13.5 2,7" />
    </>
  ),
};

function SocialIcon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      {SOCIAL_ICONS[name]}
    </svg>
  );
}

/** Chips carry no meaning on their own, so they are hidden from the a11y tree. */
function Chips({ items, className = 'tag' }: { items: readonly string[]; className?: string }) {
  return (
    <>
      {items.map((item) => (
        <span key={item} className={className}>
          {item}
        </span>
      ))}
    </>
  );
}

/**
 * Render the appropriate content for each station type.
 *
 * Narrows on `station.id` rather than casting: `Station` is a discriminated union,
 * so each branch gets its own payload type checked for free. Anything the 3D
 * station renders from `content.ts` is rendered here too — the fallback has to be
 * content-complete, not a teaser.
 */
function renderStationBody(station: Station) {
  switch (station.id) {
    case 'hero':
      return null;

    case 'about': {
      const s = station;
      return (
        <>
          {s.paragraphs.map((paragraph, i) => (
            <p key={i} className="body-text">
              {paragraph}
            </p>
          ))}
          {s.skillGroups.map((group) => (
            <section key={group.id} className="skill-group" aria-label={group.label}>
              <h3 className="subheading">{group.label}</h3>
              <p className="body-text muted">{group.blurb}</p>
              <dl className="skill-grid">
                {group.skills.map((skill) => (
                  <div key={skill.name} className="skill-tile">
                    <dt>{skill.name}</dt>
                    <dd>{skill.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </>
      );
    }

    case 'experience': {
      const s = station;
      return (
        <>
          {s.roles.map((role) => (
            <article key={`${role.company}-${role.role}`} className="role-card">
              <header className="role-head">
                <h3 className="subheading">{role.role}</h3>
                <p className="role-company">{role.company}</p>
              </header>
              <p className="body-text muted">
                <span className="meta">{role.period}</span>
                <span className="meta">{role.location}</span>
                <span className="meta">{role.workMode}</span>
              </p>
              <ul className="plain-list">
                {role.projects.map((project) => (
                  <li key={project.name}>
                    <strong>{project.name}</strong>
                    <p className="body-text">{project.summary}</p>
                    {project.highlights.length > 0 && (
                      <ul className="highlight-list">
                        {project.highlights.map((highlight) => (
                          <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {role.stack.length > 0 && (
                <div className="chips" aria-hidden="true">
                  <Chips items={role.stack} className="tag" />
                </div>
              )}
            </article>
          ))}
        </>
      );
    }

    case 'freelance': {
      const s = station;
      return (
        <>
          <p className="body-text">{s.note}</p>
          {s.projects.map((project) => (
            <article key={project.id} className="project-card">
              <h3 className="subheading">{project.title}</h3>
              <p className="body-text">{project.description}</p>
              <p className="body-text muted">
                <span className="meta">{project.role}</span>
              </p>
              <div className="chips" aria-hidden="true">
                <Chips items={project.tags} className="tag" />
              </div>
              {project.outcomes.length > 0 && (
                <ul className="highlight-list">
                  {project.outcomes.map((outcome) => (
                    <li key={outcome}>{outcome}</li>
                  ))}
                </ul>
              )}
              {project.link && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link"
                >
                  {project.linkLabel ?? project.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </article>
          ))}
        </>
      );
    }

    case 'research': {
      const s = station;
      return (
        <>
          <p className="body-text">{s.intro}</p>
          {s.domainTags.length > 0 && (
            <div className="chips" aria-hidden="true">
              <Chips items={s.domainTags} className="tag" />
            </div>
          )}
          {s.publications.length > 0 && (
            <ol className="publication-list">
              {s.publications.map((pub) => (
                <li key={pub.id} className="publication">
                  <span className="pub-title">{pub.title}</span>
                  {pub.venue && <span className="meta"> · {pub.venue}</span>}
                  {pub.year && <span className="meta"> · {pub.year}</span>}
                  {pub.url && (
                    <a href={pub.url} target="_blank" rel="noopener noreferrer" className="link">
                      <span className="sr-only">Link to publication: </span>
                      {pub.title}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
          <a
            href={s.scholarLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="link"
          >
            {s.scholarLink.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </>
      );
    }

    case 'achievements': {
      const s = station;
      return (
        <>
          <section aria-label="Awards and certifications" className="ach-group">
            <h3 className="subheading">Awards &amp; certifications</h3>
            <ul className="ach-list">
              {s.achievements.map((achievement) => (
                <li key={achievement.id} className="ach-item">
                  <span className="ach-title">{achievement.title}</span>
                  <span className="meta">
                    {' · '}
                    {achievement.issuer}
                    {achievement.year ? ` · ${achievement.year}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {s.community.length > 0 && (
            <section aria-label="Community" className="ach-group">
              <h3 className="subheading">Community</h3>
              <ul className="ach-list">
                {s.community.map((entry) => (
                  <li key={entry.id} className="ach-item">
                    <span className="ach-title">{entry.title}</span>
                    <p className="body-text muted">{entry.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.education.map((group) => (
            <section key={group.label} aria-label={group.label} className="ach-group">
              <h3 className="subheading">{group.label}</h3>
              <ul className="ach-list">
                {group.records.map((record) => (
                  <li key={record.id} className="ach-item">
                    <span className="ach-title">{record.qualification}</span>
                    <p className="body-text muted">
                      {record.institution}
                      {' · '}
                      {record.period}
                      {' · '}
                      {record.score}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section aria-label={s.languages.label} className="ach-group">
            <h3 className="subheading">{s.languages.label}</h3>
            <p className="body-text">{s.languages.items.join(' · ')}</p>
          </section>
        </>
      );
    }

    case 'contact': {
      const s = station;
      return (
        <>
          <p className="body-text">{s.intro}</p>
          <a href={`mailto:${s.email}?subject=${encodeURIComponent(s.mailtoSubject)}`} className="btn btn-primary">
            <SocialIcon name="email" />
            {s.email}
          </a>
          <ul className="contact-links">
            {s.socials.map((social) => (
              <li key={social.href}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-link"
                >
                  <span className="contact-icon" aria-hidden="true">
                    <SocialIcon name={social.icon} />
                  </span>
                  {social.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="body-text muted">{s.closing}</p>
        </>
      );
    }

    default:
      return null;
  }
}

/**
 * One station, as a normal in-flow document section.
 *
 * Deliberately *not* a slide deck: `aria-hidden` on inactive cards would strip
 * the whole portfolio from the accessibility tree and from `Ctrl+F`, leaving a
 * 2D-mode screen-reader user with nothing but the hero. In 2D mode everything is
 * on screen at once, so everything is exposed. `data-active` drives only the
 * nav-highlight styling.
 */
function StationCard2D({ station, isActive }: { station: Station; isActive: boolean }) {
  return (
    <section
      id={`station-${station.id}`}
      className="station-card-2d"
      data-active={isActive ? 'true' : undefined}
      aria-labelledby={`${station.id}-heading`}
      /*
       * Focusable by script only, for the anchor-scroll focus handoff: after a
       * nav jump, focus moves here so the next Tab continues from the section.
       * `-1` keeps it out of the tab order itself — a section is a destination,
       * not a control.
       */
      tabIndex={-1}
    >
      <div className="station-card-inner">
        <p className="eyebrow">{station.eyebrow}</p>
        <h2 id={`${station.id}-heading`} className="heading">
          {station.heading}
        </h2>
        <div className="hairline" aria-hidden="true" />
        <div className="body">{renderStationBody(station)}</div>
      </div>
    </section>
  );
}

function HeroSection2D() {
  const station = getStationContent('hero');
  const reducedMotion = useReducedMotion();
  const [timedReveal, setTimedReveal] = useState(false);

  /*
   * The entrance is a timeout, not an animation state: under reduced motion
   * there is no entrance at all, so `revealed` is derived rather than stored
   * and a mid-session preference flip shows the hero immediately instead of
   * leaving it at opacity 0 with a cleared timer.
   */
  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setTimedReveal(true), 200);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);
  const revealed = reducedMotion || timedReveal;

  if (station.id !== 'hero') return null;

  return (
    <header id="station-hero" className="station station-hero" role="banner">
      <BikeSilhouette />
      <div className="hero-content">
        <p className="eyebrow" style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(10px)' }}>
          {station.eyebrow}
        </p>
        <h1 id="hero-heading" className="hero-name" style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(10px)' }}>
          {IDENTITY.name}
        </h1>
        <p className="hero-title" style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(10px)' }}>
          {IDENTITY.title}
        </p>
        <p className="hero-tagline" style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(10px)' }}>
          {station.tagline}
        </p>
        <div className="hero-meta" style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(10px)' }}>
          <span className="location">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {IDENTITY.location}
          </span>
        </div>
        <div className="hero-cta" style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(10px)' }}>
          <a href={SITE_CHROME.resume.href} download className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {SITE_CHROME.ui.actions.downloadResume}
          </a>
          <a href="#station-contact" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            {station.cta.label}
          </a>
        </div>
        <p className="scroll-hint" aria-hidden="true">Scroll to explore</p>
      </div>
    </header>
  );
}

/**
 * Props come from `App` rather than being detected here.
 *
 * The 2D experience used to call `useCapabilities` itself, which meant running a
 * second, independent instance of the detection logic — including its own copy
 * of the mode state. That produced a genuinely confusing bug: the "switch to 3D"
 * button in `Nav2D` set a preference that only that subtree could see, so the
 * router in `App` never heard about it and the click did nothing. Mode is a
 * single fact about the session; it has exactly one owner.
 */
interface Site2DProps {
  /** Whether switching back to 3D is possible (needs a WebGL context). */
  canSwitchTo3D: boolean;
  /** Switch back to 3D. */
  onSwitchTo3D: () => void;
}

export function Site2D({ canSwitchTo3D, onSwitchTo3D }: Site2DProps) {
  const [activeStation, setActiveStation] = useState<StationId>('hero');
  const mainRef = useRef<HTMLElement>(null);

  useAnchorScroll();

  /*
   * Scroll spy for the nav highlight.
   *
   * Runs even under reduced motion: it is a nav state readout, not an
   * animation, and disabling it would freeze the highlight on the hero for
   * exactly the users least able to orient themselves in a long page.
   */
  useEffect(() => {
    const sections = STATIONS.map((s) => document.getElementById(`station-${s.id}`)).filter(Boolean) as HTMLElement[];
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
            const id = entry.target.id.replace('station-', '') as StationId;
            setActiveStation(id);
            break;
          }
        }
      },
      { rootMargin: '0px 0px -60% 0px', threshold: [0, 0.35, 0.5, 0.75, 1] },
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="site-2d">
      <a className="skip-link" href="#main">
        {SITE_CHROME.skipToContent}
      </a>
      <Nav2D
        activeStation={activeStation}
        onStationClick={scrollToStationById}
        onHomeClick={scrollToTop}
        canSwitchTo3D={canSwitchTo3D}
        onSwitchTo3D={onSwitchTo3D}
      />
      <main id="main" ref={mainRef} tabIndex={-1}>
        <HeroSection2D />
        {STATIONS.filter((station) => station.id !== 'hero').map((station) => (
          <StationCard2D
            key={station.id}
            station={station}
            isActive={station.id === activeStation}
          />
        ))}
      </main>
      <ScrollProgress />
      <Footer2D />
    </div>
  );
}