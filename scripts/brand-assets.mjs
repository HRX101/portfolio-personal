/**
 * Brand asset generation (Phase 7).
 *
 * Renders the OG social card (1200x630), the apple-touch-icon (180px), the
 * 32px favicon PNG and the multi-size favicon.ico from the same hand-written
 * SVG identity used across the site (dusk gradient + bike silhouette), so the
 * preview image can never drift from the visual identity.
 *
 * The .ico is a PNG-in-ICO container (16px + 32px entries): valid for every
 * modern browser, written with plain Buffer math, no image dependency.
 *
 * Run with:  node scripts/brand-assets.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PUBLIC = join(ROOT, 'public');

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const BIKE = `
  <svg width="480" height="240" viewBox="0 0 64 32" fill="none" stroke="#45f0e0" stroke-width="1.6" aria-hidden="true">
    <path d="M8 20h8M16 20h8M24 20h8M32 20h8M40 20h8M48 20h8M56 20h8" stroke-linecap="round" />
    <circle cx="12" cy="24" r="4" />
    <circle cx="44" cy="24" r="4" />
    <path d="M8 20 L12 16 L20 16 L24 20" stroke-linejoin="round" />
    <path d="M40 20 L44 16 L52 16 L56 20" stroke-linejoin="round" />
  </svg>`;

const browser = await chromium.launch();

async function shot(html, width, height, path, deviceScaleFactor = 1) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path, omitBackground: html.includes('OMIT-BG') });
  await page.close();
}

try {
  /* ---------------- OG social card, 1200x630 ---------------- */
  const og = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
    <div style="width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;
      background:radial-gradient(ellipse 80% 60% at 50% -10%, #134e4a 0%, transparent 70%),
      radial-gradient(ellipse 60% 50% at 85% 25%, #2e1065 0%, transparent 60%),
      linear-gradient(180deg, #04050d 0%, #07081a 55%, #04050d 100%);
      font-family:system-ui,-apple-system,'Segoe UI',sans-serif;text-align:center">
      <div style="opacity:.9;filter:drop-shadow(0 0 24px #45f0e0)">${BIKE}</div>
      <div style="font-size:84px;font-weight:800;letter-spacing:-2px;color:#eef1ff;line-height:1">Hrithik Paul</div>
      <div style="font-size:34px;font-weight:500;color:#45f0e0;letter-spacing:1px">Software Engineer | AI/LLM Engineer</div>
      <div style="margin-top:18px;font-family:ui-monospace,monospace;font-size:22px;letter-spacing:6px;color:#7d85ad">SCROLL-DRIVEN&nbsp;3D&nbsp;PORTFOLIO</div>
    </div></body></html>`;
  await shot(og, 1200, 630, join(PUBLIC, 'og-image.png'));

  /* ---------------- app icons on the ink tile ---------------- */
  const tile = (px) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
    <div style="width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(160deg,#0c0e1c 0%,#04050d 70%);border-radius:${Math.round(px * 0.22)}px">
      <svg width="${Math.round(px * 0.62)}" height="${Math.round(px * 0.31)}" viewBox="0 0 64 32" fill="none"
        stroke="#45f0e0" stroke-width="2.4" aria-hidden="true">
        <path d="M8 20h8M16 20h8M24 20h8M32 20h8M40 20h8M48 20h8M56 20h8" stroke-linecap="round" />
        <circle cx="12" cy="24" r="4" /><circle cx="44" cy="24" r="4" />
        <path d="M8 20 L12 16 L20 16 L24 20" stroke-linejoin="round" />
        <path d="M40 20 L44 16 L52 16 L56 20" stroke-linejoin="round" />
      </svg>
    </div></body></html>`;
  await shot(tile(180), 180, 180, join(PUBLIC, 'apple-touch-icon.png'));
  await shot(tile(32), 32, 32, join(PUBLIC, 'favicon-32x32.png'));
  await shot(tile(16), 16, 16, join(PUBLIC, 'favicon-16x16.png'));

  /* ---------------- favicon.ico: PNG-in-ICO, 16px + 32px ---------------- */
  const png16 = readFileSync(join(PUBLIC, 'favicon-16x16.png'));
  const png32 = readFileSync(join(PUBLIC, 'favicon-32x32.png'));
  const entry = (size, data, offset) => {
    const b = Buffer.alloc(16);
    b.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    b.writeUInt8(size === 256 ? 0 : size, 1); // height
    b.writeUInt8(0, 2); // palette
    b.writeUInt8(0, 3); // reserved
    b.writeUInt16LE(1, 4); // color planes
    b.writeUInt16LE(32, 6); // bits per pixel
    b.writeUInt32LE(data.length, 8); // data size
    b.writeUInt32LE(offset, 12); // data offset
    return b;
  };
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(2, 4); // two images
  const off16 = 6 + 32;
  const off32 = off16 + png16.length;
  const ico = Buffer.concat([header, entry(16, png16, off16), entry(32, png32, off32), png16, png32]);
  writeFileSync(join(PUBLIC, 'favicon.ico'), ico);
} finally {
  await browser.close();
}

for (const [name, bytes] of [
  ['og-image.png', 'public/og-image.png'],
  ['apple-touch-icon.png', 'public/apple-touch-icon.png'],
  ['favicon-32x32.png', 'public/favicon-32x32.png'],
  ['favicon.ico', 'public/favicon.ico'],
]) {
  try {
    const { size } = await import('node:fs').then((fs) => fs.statSync(join(ROOT, bytes)));
    check(`${name} generated`, size > 500, `${(size / 1024).toFixed(1)} KB`);
  } catch {
    check(`${name} generated`, false);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
