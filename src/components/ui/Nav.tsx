import { Monitor, Smartphone } from 'lucide-react';
import {
  IDENTITY,
  SITE_CHROME,
  STATIONS,
  getStationContent,
} from '../../data/content';
import { useActiveStation } from '../../hooks/useActiveStation';
import { SoundToggle } from './SoundToggle';
import { iconFor } from './icons';
import { useCapabilities } from '../../hooks/useCapabilities';

interface NavProps {
  /** Whether the device supports WebGL and can switch to 3D. */
  canSwitchTo2D: boolean;
  /** Callback to switch to 2D mode. */
  onSwitchTo2D: () => void;
  /** Current experience mode. */
  mode: '3D' | '2D';
}

/**
 * Fixed top bar: identity on the left, the seven stations, then resume and the
 * two profile links, plus a mode switcher when WebGL is available.
 *
 * Station links are real anchors carrying `href="#station-x"`, and one
 * delegated click handler (`useAnchorScroll`) turns them into a Lenis
 * `scrollTo`. Keeping the href means the link is copyable, shows a destination
 * on hover and works with browser history; routing the click through Lenis is
 * required because Lenis owns scroll position from its own rAF loop and would
 * overwrite a native jump on the very next frame. The same handler moves focus
 * to the destination, so no per-link click code is needed here.
 *
 * The active highlight comes from the shared station store, so it tracks the
 * bike's damped position rather than raw scroll and cannot disagree with the
 * overlay or the mini-map.
 */
export function Nav({ canSwitchTo2D, onSwitchTo2D, mode }: NavProps) {
  const { activeId } = useActiveStation();
  const { webgl } = useCapabilities();

  const github = IDENTITY.links.find((link) => link.icon === 'github');
  const linkedin = IDENTITY.links.find((link) => link.icon === 'linkedin');
  const GitHubIcon = github ? iconFor(github.icon) : null;
  const LinkedInIcon = linkedin ? iconFor(linkedin.icon) : null;

  // Allow switching to 3D from 2D if WebGL is available
  const canSwitchTo3D = mode === '2D' && webgl;

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="pointer-events-none bg-gradient-to-b from-ink-950/92 via-ink-950/65 to-transparent">
        <div className="mx-auto flex max-w-[86rem] items-center gap-3 px-4 py-2.5 sm:px-5">
          <a
            href="#station-hero"
            className="font-display pointer-events-auto shrink-0 text-sm font-semibold tracking-tight text-mist-100 transition-colors hover:text-neon-teal"
          >
            {IDENTITY.name}
          </a>

          <nav aria-label={SITE_CHROME.ui.nav.label} className="min-w-0 flex-1">
            <ul className="flex items-center justify-center gap-0.5 overflow-x-auto">
              {STATIONS.map((station) => (
                <li key={station.id}>
                  <a
                    href={`#station-${station.id}`}
                    aria-current={activeId === station.id ? 'true' : undefined}
                    data-active={activeId === station.id}
                    className="nav-link pointer-events-auto block rounded-full px-2.5 py-1 font-mono text-[0.64rem] tracking-[0.14em] whitespace-nowrap uppercase transition-colors"
                  >
                    {station.navLabel}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <a
              href={SITE_CHROME.resume.href}
              download
              className="pointer-events-auto rounded-full border border-neon-teal/40 px-3 py-1.5 font-mono text-[0.62rem] tracking-[0.16em] text-mist-100 uppercase transition-colors hover:border-neon-teal hover:text-neon-teal"
            >
              {SITE_CHROME.resume.label}
            </a>
            {github && GitHubIcon && <SocialLink link={github} Icon={GitHubIcon} />}
            {linkedin && LinkedInIcon && <SocialLink link={linkedin} Icon={LinkedInIcon} />}
            {/* Before the social links: it is chrome, not an outbound link, and
                keeping links grouped reads better than splitting them. */}
            <SoundToggle />

            {/* Mode switcher: show when WebGL is available and not in reduced-motion forced 2D */}
            {(canSwitchTo2D || canSwitchTo3D) && (
              <button
                /*
                 * A plain action button, not `aria-pressed`: it does not toggle
                 * a state, it leaves the 3D experience for the 2D one. The label
                 * says where it goes, which is all a screen reader needs.
                 */
                onClick={onSwitchTo2D}
                className="btn btn-ghost btn-sm mode-switch"
                aria-label={
                  mode === '3D' ? 'Switch to lightweight view' : 'Switch to 3D experience'
                }
              >
                {mode === '3D' ? (
                  <>
                    <Smartphone size={16} strokeWidth={2} aria-hidden="true" />
                    <span className="btn-text">Lightweight</span>
                  </>
                ) : (
                  <>
                    <Monitor size={16} strokeWidth={2} aria-hidden="true" />
                    <span className="btn-text">3D</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/*
        Skip link. Visually hidden until focused, then it appears and targets the
        card the reader is already looking at, so the first Tab press lands inside
        the content rather than back at the nav they just came from. The delegated
        anchor handler does the scrolling and the focus move.
      */}
      <a
        href={`#station-${activeId}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-4 focus:z-50 focus:rounded-full focus:bg-neon-teal focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:font-semibold focus:text-ink-950"
      >
        {SITE_CHROME.skipToContent}: {getStationContent(activeId).heading}
      </a>
    </header>
  );
}

function SocialLink({
  link,
  Icon,
}: {
  link: { label: string; href: string };
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link.label}
      /*
       * 44px floor, matching the 2D token. The icon inside stays 16px — only
       * the hit area grows, so the bar keeps its proportions.
       */
      className="pointer-events-auto grid size-11 place-items-center rounded-full border border-white/12 text-mist-300 transition-colors hover:border-neon-violet/60 hover:text-neon-violet"
    >
      <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
    </a>
  );
}