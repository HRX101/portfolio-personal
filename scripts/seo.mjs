/**
 * SEO generation and validation (Phase 7).
 *
 * Two phases, because source and output have different jobs:
 *
 *   node scripts/seo.mjs            writes public/robots.txt, public/sitemap.xml
 *                                   and public/site.webmanifest from the single
 *                                   source of truth (`src/config/site.ts`), and
 *                                   validates the JSON-LD graph parses with the
 *                                   required relations present.
 *
 *   node scripts/seo.mjs --inject dist
 *                                   rewrites the absolute URLs in the built
 *                                   index.html (canonical, og:url, og:image,
 *                                   twitter:image, JSON-LD `url`s) to the
 *                                   effective site URL: VITE_SITE_URL, then
 *                                   VERCEL_URL (preview deployments), then the
 *                                   apex default. Source index.html keeps the
 *                                   default; only the artifact is rewritten, so
 *                                   a build never dirties the working tree.
 *
 * The TS config is loaded through Vite's module runner so extensionless imports
 * resolve exactly as they do in the app — no duplicated copy, no drift.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/*
 * Writes only on change: `prebuild` runs on every local build, and rewriting
 * identical files would dirty the tree (and bump sitemap `lastmod`) for no
 * reason. The sitemap date still advances when content actually changes,
 * because the check below compares bytes, not timestamps — a new day alone
 * rewrites the file once, which is exactly the desired cadence.
 */
function writeIfChanged(path, content) {
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (prev !== content) writeFileSync(path, content);
}

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

async function loadSite() {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true } });
  try {
    const mod = await server.ssrLoadModule('/src/config/site.ts');
    return { SITE: mod.SITE, buildJsonLd: mod.buildJsonLd };
  } finally {
    await server.close();
  }
}

function effectiveUrl() {
  const raw = (process.env.VITE_SITE_URL || process.env.VERCEL_URL || 'https://hrithikpaul.dev').trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  // VERCEL_URL arrives without a scheme.
  return withScheme;
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const inject = process.argv.includes('--inject');
const outDir = process.argv[process.argv.indexOf('--inject') + 1] || 'dist';

const { SITE, buildJsonLd } = await loadSite();
const url = inject ? effectiveUrl() : SITE.url;

/* ---------------- JSON-LD: generate, then prove it parses ---------------- */
const graph = buildJsonLd();
const parsed = (() => {
  try {
    return JSON.parse(JSON.stringify(graph));
  } catch {
    return null;
  }
})();
check('JSON-LD serialises and re-parses', parsed !== null);
const person = parsed?.find((n) => n['@type'] === 'Person');
const website = parsed?.find((n) => n['@type'] === 'WebSite');
check(
  'Person schema has name, jobTitle, url, sameAs, worksFor, alumniOf',
  !!person?.name && !!person?.jobTitle && !!person?.url &&
    Array.isArray(person?.sameAs) && person.sameAs.length >= 3 &&
    !!person?.worksFor?.name && !!person?.alumniOf?.name,
  person ? `${person.name} @ ${person.worksFor?.name}, alum ${person.alumniOf?.name}` : 'no Person node',
);
check(
  'WebSite schema has name, url, author',
  !!website?.name && !!website?.url && !!website?.author?.name,
  website?.url ?? 'no WebSite node',
);

/* ---------------- public/ files (source phase) ---------------- */
if (!inject) {
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`;
  writeIfChanged(join(ROOT, 'public', 'robots.txt'), robots);

  const today = new Date().toISOString().slice(0, 10);
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${SITE.url}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n` +
    `</urlset>\n`;
  writeIfChanged(join(ROOT, 'public', 'sitemap.xml'), sitemap);

  const manifest = {
    name: SITE.title,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    display: 'standalone',
    background_color: SITE.backgroundColor,
    theme_color: SITE.themeColor,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
  writeIfChanged(join(ROOT, 'public', 'site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

  check('robots.txt, sitemap.xml, site.webmanifest written', true, SITE.url);
}

/* ---------------- dist/index.html URL injection (post-build) ---------------- */
if (inject) {
  const htmlPath = join(ROOT, outDir, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  const before = html;

  // Replace every absolute reference to the default apex with the effective URL.
  html = html.split(SITE.url).join(url);

  // Swap the embedded JSON-LD for the freshly generated graph so the artifact
  // can never carry a stale schema (same shape, current copy).
  const fresh = `<script type="application/ld+json">\n      ${JSON.stringify(graph, null, 2).replace(/\n/g, '\n      ')}\n    </script>`;
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => fresh);

  // Prove the result still parses: extract and re-parse every JSON-LD block.
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let valid = blocks.length > 0;
  for (const b of blocks) {
    try {
      JSON.parse(b[1]);
    } catch {
      valid = false;
    }
  }
  check('dist JSON-LD blocks parse after injection', valid, `${blocks.length} block(s)`);

  if (html !== before) writeFileSync(htmlPath, html);
  check('dist URLs point at the effective site URL', html.includes(url), url);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
