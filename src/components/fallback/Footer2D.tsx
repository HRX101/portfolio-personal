import {
  IDENTITY,
  SITE_CHROME,
  STATION_IDS,
  getStationContent,
  type SocialLink,
} from '../../data/content';

/**
 * Footer for the 2D experience.
 *
 * Everything here comes from `content.ts`. The previous version hard-coded
 * `https://github.com`, `https://linkedin.com` and `mailto:hrithik@example.com`
 * as placeholders, which meant the 2D fallback — the one a screen-reader user or
 * a low-end device is most likely to see — linked to accounts that do not belong
 * to the person whose portfolio this is. A fallback that is nearly complete is
 * worse than one that is obviously incomplete, because the broken links are not
 * obvious.
 *
 * The mode toggle is deliberately absent here: `Nav2D` already owns switching
 * back to 3D, and two controls for one action in two places is one too many.
 */
export function Footer2D() {
  const contact = getStationContent('contact');
  const socials: readonly SocialLink[] = contact.id === 'contact' ? contact.socials : [];
  const stationLinks = STATION_IDS.filter((id) => id !== 'hero');

  return (
    <footer className="footer-2d">
      <div className="footer-inner">
        <div className="footer-brand">
          <svg
            width="32"
            height="32"
            viewBox="0 0 64 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M8 20h8M16 20h8M24 20h8M32 20h8M40 20h8M48 20h8M56 20h8" strokeLinecap="round" />
            <circle cx="12" cy="24" r="4" fill="none" stroke="currentColor" />
            <circle cx="44" cy="24" r="4" fill="none" stroke="currentColor" />
            <path d="M8 20 L12 16 L20 16 L24 20" fill="none" strokeLinejoin="round" />
            <path d="M40 20 L44 16 L52 16 L56 20" fill="none" strokeLinejoin="round" />
          </svg>
          <span>{IDENTITY.name}</span>
          <p className="tagline">{IDENTITY.title}</p>
          <p className="tagline">{IDENTITY.location}</p>
        </div>

        <div className="footer-links">
          {/*
            In-page anchors rather than the delegated scroll driver: these are
            ordinary links, so middle-click, ctrl-click and "open in new tab" all
            behave the way the browser says they will. Same for the footer being
            a real landmark rather than a div with an ARIA role bolted on.
          */}
          <nav aria-label="Footer navigation">
            <ul>
              {stationLinks.map((id) => (
                <li key={id}>
                  <a href={`#station-${id}`}>
                    {getStationContent(id).navLabel}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <ul className="social-links" aria-label="Elsewhere">
            {socials.map((social) => (
              <li key={social.href}>
                <a href={social.href} aria-label={social.label}>
                  <span aria-hidden="true">{social.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-controls">
          <a
            href={SITE_CHROME.resume.href}
            download
            className="btn btn-ghost btn-sm"
          >
            {SITE_CHROME.ui.actions.downloadResume}
          </a>
        </div>

        <p className="copyright">
          © {new Date().getFullYear()} {IDENTITY.name}
        </p>
      </div>
    </footer>
  );
}