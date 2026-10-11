/**
 * External link audit (Phase 7).
 *
 * Two halves:
 *  1. Static: every `target="_blank"` anchor in `src/` must carry
 *     `rel="noopener noreferrer"` (tab-nabbing). Scans .tsx sources.
 *  2. Live: every outbound URL in `content.ts` must resolve (status < 400).
 *     403/429 is a warning, not a failure — Scholar and LinkedIn bot-guard
 *     automated checks, and a 429 today says nothing about the link target.
 *
 * Run with:  node scripts/check-links.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass ? true : false);
  console.log(`${pass === true ? 'PASS' : pass === 'warn' ? 'WARN' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (pass === 'warn') results[results.length - 1] = true; // warnings don't fail the gate
};

function tsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/* ---------------- 1. static rel audit ---------------- */
let blankWithoutRel = 0;
for (const file of tsxFiles(join(ROOT, 'src'))) {
  const code = readFileSync(file, 'utf8');
  // Find target="_blank" anchors and check the same JSX tag for a rel.
  const tags = code.match(/<a[\s\S]*?>/g) ?? [];
  for (const tag of tags) {
    if (tag.includes('target="_blank"') || tag.includes("target={'_blank'}")) {
      if (!/rel=/.test(tag)) {
        blankWithoutRel += 1;
        console.log(`FAIL  _blank without rel in ${file}\n      ${tag.slice(0, 120)}`);
        results.push(false);
      }
    }
  }
}
check('every target=_blank anchor carries rel', blankWithoutRel === 0, blankWithoutRel === 0 ? 'scanned' : `${blankWithoutRel} offenders`);

/* ---------------- 2. live reachability ---------------- */
const server = await createServer({ root: ROOT, logLevel: 'error', server: { middlewareMode: true } });
let content;
try {
  content = await server.ssrLoadModule('/src/data/content.ts');
} finally {
  await server.close();
}

const urls = new Set();
const collect = (value) => {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
};
collect(content.IDENTITY.links);
for (const station of content.STATIONS) collect(station);

for (const url of [...urls].sort()) {
  const label = url.length > 80 ? `${url.slice(0, 77)}…` : url;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (portfolio link audit)' },
    }).finally(() => clearTimeout(timer));
    if (res.status < 400) check(`resolves: ${label}`, true, res.status);
    else if (res.status === 403 || res.status === 429) check(`resolves: ${label}`, 'warn', `${res.status} (bot-guard likely)`);
    else check(`resolves: ${label}`, false, res.status);
  } catch (error) {
    check(`resolves: ${label}`, false, error.cause?.code ?? error.message);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
