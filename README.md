# Hrithik Paul — Portfolio

A scroll-driven 3D portfolio with a complete lightweight 2D fallback. One page,
two experiences: a Three.js night ride through seven career stations, or the
same content as a fast document when the device, the network, or the reader
prefers it.

![Portfolio hero placeholder](public/og-image.png)

> Screenshot: `public/og-image.png` doubles as the social preview card. Replace
> it with a real capture when the 3D scene is final (see `scripts/brand-assets.mjs`).

## Tech stack

- React 19 + TypeScript (strict) + Vite 8 (Rolldown)
- Three.js + React Three Fiber + drei + postprocessing (3D chunk only)
- Lenis smooth scroll, Tailwind CSS v4, lucide-react icons (3D UI)
- Vitest (unit) + Playwright (browser acceptance scripts in `scripts/`)
- No SSR, no backend, no runtime analytics unless configured

## Features

- **3D mode** — scroll-driven camera ride, quality tiers (LOW/MEDIUM/HIGH),
  FPS governor with automatic step-down and a 2D offer, WebGL context-loss
  fallback, debug overlay (`D` key in dev).
- **2D mode** — the same stations as semantic HTML. Auto-selected on no-WebGL,
  reduced motion, low-end + save-data, or stored preference. Zero bytes of
  three.js download in this mode (enforced by `scripts/bundle-guard.mjs`).
- **Reduced motion** — auto-2D, instant nav jumps, no camera sweeps, no intro glide.
- **Accessibility** — landmarks, skip link, focus handoff on nav jumps, 44px
  targets in 2D, AA-or-better contrast, `?mode=2d` works with JS disabled
  (static content in `index.html` + `<noscript>` unhide).

## Folder structure

```
src/
  components/
    App.tsx            # mode router (owns which experience mounts)
    Experience3D.tsx   # everything that may touch three.js (lazy chunk)
    ErrorBoundary.tsx  # 3D crash -> friendly fallback, never white screen
    canvas/            # Scene, CameraRig, PerfGovernor, effects, world
    fallback/          # Site2D, Nav2D, Footer2D (+ Site2D.css)
    ui/                # Nav, Overlay, MiniMap, Loader, PerfPrompt, sections…
  config/              # quality.ts (tiers), scene.ts, effects.ts, site.ts (SEO)
  data/content.ts      # ALL copy. Edit here, nowhere else.
  hooks/               # useScrollProgress, useCapabilities, useQuality, …
  lib/                 # rideMath.ts (three-free), track.ts (3D), easing,
                       # capabilities.ts, analytics.ts (stub), audio.ts
tests/                 # vitest unit tests (capabilities, track, store, world)
scripts/               # acceptance + ops scripts (see below)
public/                # favicons, og-image, manifest, robots, sitemap, 404.html
```

## Getting started

```bash
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build (runs SEO pre/post steps)
npm run preview    # serve dist/ locally (use this for launch verification)
```

Requires Node 20.19+ or 22.12+.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `preview` | standard Vite lifecycle |
| `typecheck` / `lint` / `format`, `format:check` | gates |
| `verify` | `typecheck && lint && build` — the CI gate |
| `analyze` | build + full chunk table with gzip sizes |
| `test` / `test:watch` | vitest unit tests |
| `test:e2e` | smoke + fallback + phase4 + phase5 + phase6 (Playwright, dev server) |
| `test:phase6` | Phase 6 resilience acceptance (2D isolation, switching, reduced motion) |
| `bundle:guard` | fails if 2D regresses (three in 2D chunks, budget >150 KB gz) |
| `seo` / `seo:inject` | generate SEO files / patch dist URLs (wired as pre/postbuild) |
| `brand` | regenerate OG card + favicons from the SVG identity |
| `links` | external-link audit (rel attrs + live reachability) |
| `capture` | screenshot helper |

## Environment variables

See `.env.example`. All optional:

- `VITE_SITE_URL` — canonical URL (sitemap, OG, JSON-LD). Defaults to
  `https://hrithikpaul.dev`; Vercel preview builds pick up `VERCEL_URL`.
- `VITE_ANALYTICS_ENDPOINT` / `VITE_ANALYTICS_SITE` — privacy-friendly event
  endpoint. Unset = analytics fully inert (zero requests). If set to a
  cross-origin host, add it to `connect-src` in `vercel.json`.

## Editing content

All copy lives in `src/data/content.ts` (`IDENTITY`, `STATIONS`, `SITE_CHROME`,
`SEO`). Components must not contain their own strings — chrome labels come from
`SITE_CHROME.ui`, biography from the stations. After editing copy, run
`npm run build` (regenerates sitemap/manifest) and eyeball `index.html`'s
`#seo-boot` block, which duplicates the hero/experience/research summaries for
crawlers — keep it in sync.

### Adding a station

1. Add the id to `StationId` and a `*Station` interface + object in `content.ts`.
2. Add its dock position to the scene station table (`src/config/scene.ts`).
3. Render it in the 3D overlay (`components/ui/Overlay.tsx` section component)
   **and** in `renderStationBody` in `components/fallback/Site2D.tsx` — the
   fallback is content-complete by contract, not a teaser.
4. It appears in nav, minimap, progress bar, and smoke tests automatically
   (they iterate `STATIONS`).

## Quality presets and tuning

`src/config/quality.ts` is the single table: per tier, effect flags, particle
multiplier, render preset (DPR/shadows/AA/terrain), world counts. Effects are
*absent* when off (component returns `null`), never hidden-but-running.
`detectQualityLevel` caps phones at MEDIUM; `Experience3D` additionally clamps
canvas DPR to 1.25 on narrow viewports. The `PerfGovernor` steps down one tier
per session under 45 fps sustained, offers 2D under 25 fps on LOW.

## Debug overlay and query params (dev)

Press `D`: ride state, per-tier FPS table, detection facts, governor numbers,
active query string. Keys `1–7` jump stations, `L/M/H` pin tiers, `0` releases
to auto, `C` cycles.

- `?mode=2d` / `?mode=3d` — force an experience (also the launch-test hooks).
- `?quality=low|medium|high` — pin the starting tier.

## Browser support

Evergreen Chrome/Edge/Firefox/Safari. No WebGL → 2D automatically. Verified in
Chromium, Firefox, and WebKit via Playwright (boot + no-error in both modes);
real-device Safari/iOS still needs a physical check (see launch report).

## Performance budget

- 2D first load: **<150 KB gzipped JS+CSS** (currently ~97 KB; enforced in CI
  by `bundle-guard.mjs`).
- 3D chunk (~310 KB gz: three + R3F + scene) loads only when 3D mounts;
  `index.html` carries no `modulepreload` for it.
- Images: none in the critical path (all 3D is procedural; icons are inline
  SVG). Fonts: system stacks only — no webfont downloads by design.
- `vercel.json`: immutable 1-year cache on hashed `/assets/*`, revalidate on HTML.

## Accessibility notes

Targets: Lighthouse a11y 95+ both modes (measured 100/100/100/96 — the 96 is
one minimap dot-spacing audit, documented in the launch report). Conventions:
real anchors for nav, `aria-current` highlights, focus moved to jump
destinations (`tabIndex=-1`, ring suppressed on sections only), `role=alert`
only on the perf prompt, decorative SVG `aria-hidden`, 44px targets in 2D and
24px+ in 3D chrome, AA contrast throughout (measured table in report).

## Deployment

Target: Vercel. `vercel.json` ships headers (CSP, `nosniff`, referrer,
`frame-ancestors`/`DENY`, locked-down `Permissions-Policy`), caching rules,
and www→apex redirect. Steps:

```bash
npm i -g vercel
vercel            # preview deployment (share the URL for review)
vercel --prod     # production (only with the owner's confirmation)
```

Then: set `VITE_SITE_URL` if the domain differs, add `public/resume.pdf`
(required — the Resume button 404s without it), connect the domain
(Vercel dashboard → Settings → Domains; apex A 76.76.21.21 or CNAME), and
re-run `npm run links`. Notes for Netlify/Cloudflare Pages: same `dist/`
output; copy the headers/caching from `vercel.json` into `_headers`/`_redirects`
or a `_worker` config.

## Troubleshooting

- **Blank page in 3D, 2D works**: GPU/driver issue — the context-loss path
  should auto-switch; check console for `[PerfGovernor]` lines.
- **`?mode=3d` shows 2D**: no WebGL (`webgl` in the debug overlay reads `-`).
- **Stuck in one mode**: a stored preference (`localStorage portfolio:force-*`);
  the footers/navs expose the switch, or clear site storage.
- **Phantom `bike.glb` 404 in dev**: expected — `public/models` ships empty and
  the procedural fallback covers it (`scripts/fallback.mjs`).
- **Lighthouse 3D perf low locally**: SwiftShader (software GL) scores are a
  floor, not a device result.

## Architecture notes (for future edits)

- **Scroll → progress → track**: Lenis emits scroll px → `ride.progress` 0..1 →
  `trackTAtProgress` (equal spans, eased dwell, magnetic settle) → damped `t`.
  The 3D layer reads the mutable `ride` object; React only gets a ~20fps
  snapshot. Never put continuous values in React state.
- **Station system**: `STATIONS` order is canonical — nav, minimap, progress,
  overlay, and tests all derive from it. The discrete active station goes
  through `useSyncExternalStore`; continuous visibility never touches React.
- **Capabilities**: `decideMode` priority is force → no-WebGL → reduced-motion
  → lowEnd+saveData → 3D. `App` owns the mode; children receive props, never
  their own `setMode` (a second hook instance's override is invisible to the
  router — this bug existed and was fixed in Phase 6).
- **PerfGovernor**: drei `PerformanceMonitor` (fast signal) + rolling average
  (decisions). Step-down is one-way per session; recovery needs a sustained
  clean window. The 2D offer is a one-way latch consumed by `PerfPrompt`.
- **The 2D/3D import rule**: if a module loads in 2D mode (directly or
  transitively from `App`), it must not import `three`, R3F, or `lib/track`
  (use `lib/rideMath`). `bundle-guard.mjs` enforces this in CI.

## License

© Hrithik Paul — all rights reserved. No license is granted to reuse the
content, design, or code without permission.
