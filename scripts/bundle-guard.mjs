/**
 * Bundle guard for Phase 6.
 *
 * Fails the build if the 2D experience regresses:
 * - `dist/index.html` must not `modulepreload` three.js, R3F or postprocessing.
 * - The entry chunk and the Site2D chunk must contain no renderer markers.
 * - The 2D first-load total (entry + runtime + Site2D + CSS, gzipped) must stay
 *   under the ~150 KB budget.
 *
 * Run with:  node scripts/bundle-guard.mjs  (after `npm run build`)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, '..', 'dist');
const ASSETS = join(DIST, 'assets');

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const files = readdirSync(ASSETS);
const find = (prefix, suffix) => files.find((f) => f.startsWith(prefix) && f.endsWith(suffix));
const gzipKb = (name) => gzipSync(readFileSync(join(ASSETS, name))).length / 1024;

/*
 * Chunk graph from the build manifest. Marker-grepping minified code cannot
 * work — identifiers do not survive minification — so the isolation proof reads
 * the bundler's own accounting: which chunk statically imports which.
 */
const manifest = JSON.parse(readFileSync(join(DIST, '.vite', 'manifest.json'), 'utf8'));
const fileOf = (key) => manifest[key]?.file;
const entryKey = 'index.html';
const site2dKey = 'src/components/fallback/Site2D.tsx';
const entryFile = fileOf(entryKey);
const site2dFile = manifest[site2dKey]?.file;
const isRendererChunk = (file) => /three-|r3f-|postprocessing/i.test(file ?? '');
const staticImports = (key) => manifest[key]?.imports ?? [];

// 1. No unconditional 3D preloads in the HTML shell.
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const preloads = [...html.matchAll(/modulepreload[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const badPreloads = preloads.filter((h) => /three|r3f|postprocessing/i.test(h));
check(
  'index.html preloads no three.js / R3F / postprocessing',
  badPreloads.length === 0,
  badPreloads.length === 0 ? `${preloads.length} preloads: ${preloads.join(', ') || '(none)'}` : badPreloads.join(', '),
);

// 2. Neither the entry nor the Site2D chunk may statically import a renderer
//    chunk. `imports` in the manifest is the bundler's own static edge list,
//    so one level is the whole story for what loads unconditionally.
//
//    This check exists because of a real regression it caught: the bundler once
//    parked `react` inside the r3f chunk, so the entry — which needs react —
//    pulled the entire renderer into every 2D load. No source file imported
//    anything wrong (marker-grepping the minified code found nothing); only the
//    chunk graph told the truth.
const entry = entryFile?.split('/').pop();
const site2d = site2dFile?.split('/').pop();
const runtime = find('rolldown-runtime-', '.js');
for (const [label, key, file] of [['entry', entryKey, entry], ['Site2D', site2dKey, site2d]]) {
  if (!file) {
    check(`2D ${label} chunk exists in manifest`, false, key);
    continue;
  }
  const rendererImports = staticImports(key).filter(isRendererChunk);
  check(
    `2D ${label} chunk (${file}) statically imports no renderer chunk`,
    rendererImports.length === 0,
    rendererImports.length === 0
      ? `imports: ${staticImports(key).join(', ') || '(none)'}`
      : rendererImports.join(', '),
  );
}

// 3. The 2D budget: everything a 2D-mode first load fetches.
const css = files.filter((f) => f.endsWith('.css'));
const react = find('react-', '.js');
if (entry && site2d && runtime) {
  const parts = [entry, site2d, runtime, ...(react ? [react] : []), ...css];
  const total = parts.reduce((sum, f) => sum + gzipKb(f), 0);
  const budget = 150;
  check(
    `2D first load under ~${budget} KB gzipped`,
    total < budget,
    `${total.toFixed(1)} KB gz (${parts.map((f) => `${f.split('-')[0]} ${gzipKb(f).toFixed(1)}`).join(' + ')})`,
  );
} else {
  check('2D budget measurable (all chunks present)', false, `entry=${entry} site2d=${site2d} runtime=${runtime}`);
}

// 4. Report the 3D cost for comparison (informational, never a failure).
const three = find('three-', '.js');
const r3f = find('r3f-', '.js');
const exp3d = find('Experience3D-', '.js');
if (three && r3f && exp3d) {
  const total = [three, r3f, exp3d].reduce((sum, f) => sum + gzipKb(f), 0);
  console.log(
    `INFO  3D-only payload: ${total.toFixed(1)} KB gz (three ${gzipKb(three).toFixed(1)} + r3f ${gzipKb(r3f).toFixed(1)} + scene ${gzipKb(exp3d).toFixed(1)})`,
  );
}

// 5. Full chunk table (the `analyze` report: every major chunk, raw + gzip).
console.log('INFO  chunk table (raw / gzipped):');
for (const f of files.filter((f) => f.endsWith('.js') || f.endsWith('.css')).sort()) {
  const raw = readFileSync(join(ASSETS, f)).length / 1024;
  console.log(`INFO    ${f}: ${raw.toFixed(1)} KB raw / ${gzipKb(f).toFixed(1)} KB gz`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
