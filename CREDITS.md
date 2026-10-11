# Credits

Third-party code, assets, and services used by this portfolio. Licenses were
checked at launch (October 2026); re-verify before upgrading major versions.

## Runtime dependencies

| Package | License | Notes |
|---|---|---|
| react, react-dom 19 | MIT | UI framework |
| three | MIT | WebGL renderer (3D chunk only) |
| @react-three/fiber | MIT | React renderer for three |
| @react-three/drei | MIT | `useProgress`, `PerformanceMonitor` |
| @react-three/postprocessing / postprocessing | BSD-3-Clause | Bloom/vignette chain (HIGH tier) |
| lenis | MIT | Smooth scroll driver |
| lucide-react | ISC | Icons in 3D chrome (tree-shaken) |

`framer-motion` and `gsap` were removed in Phase 7 (unused). No webfonts are
loaded (system stacks by design); no stock imagery is used.

## Dev and CI tooling

Vite, TypeScript, Vitest, Playwright, ESLint, Prettier, Tailwind CSS, Husky,
lint-staged, wait-on, Lighthouse CI action — all MIT/Apache-2.0. No concerns.

## Models, textures, audio

- **Bike model** (`/models/bike.glb`): not shipped — `public/models` is empty
  and the app renders a procedural fallback. If a GLB is added later, record
  its source and license here before deploying.
- **Textures**: none — all scenery is procedural geometry + vertex color/noise.
- **Audio**: fully synthesized with the Web Audio API (noise buffers, no
  samples). No audio files, no licenses needed.

## Fonts

System font stacks only (`ui-sans-serif`, `ui-monospace`, …). The display names
"Space Grotesk" and "Inter" appear as first preferences with system fallbacks;
no font files are distributed, so there is nothing to license — but also note
most visitors see the fallback stack, which is intentional (zero font payload).

## Services (all optional, all off by default)

- Analytics: none configured. The `lib/analytics.ts` stub sends nothing unless
  `VITE_ANALYTICS_ENDPOINT` is set; point it at Plausible/Umami (both
  privacy-friendly, no cookies) when ready.
- Hosting target: Vercel (see `vercel.json`).

## License status of this project

All rights reserved © Hrithik Paul. No third-party asset above grants rights
beyond its package license, and nothing in this repo re-licenses anything.
