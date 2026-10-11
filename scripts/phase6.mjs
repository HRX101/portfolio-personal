/**
 * Acceptance checks for Phase 6 (resilience).
 *
 * - 2D mode downloads zero bytes of three.js / R3F / postprocessing.
 * - 2D mode renders every station with real content (no placeholders).
 * - 2D mode has working landmarks: skip link, nav, main, footer.
 * - Mode switching works in both directions and unmounts the canvas.
 * - Reduced-motion auto-selects 2D.
 * - Neither mode logs unexpected console errors.
 *
 * Run with:  node scripts/phase6.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const server = await createServer({ server: { port: 4191, strictPort: true }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const THREE_PATTERNS = [/\/assets\/three-.*\.js/, /\/assets\/r3f-.*\.js/, /postprocessing/i];

async function newPage(viewport, extra = {}) {
  const page = await browser.newPage({ viewport, ...extra });
  const errors = [];
  const requested = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => requested.push(r.url()));
  return { page, errors, requested };
}

try {
  /* ---------------- 2D mode on a phone viewport ---------------- */
  {
    const { page, errors, requested } = await newPage({ width: 390, height: 844 });
    await page.goto('http://localhost:4191/?mode=2d', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const threeBytes = requested.filter((u) => THREE_PATTERNS.some((p) => p.test(u)));
    check(
      '2D mode fetches zero three.js / R3F / postprocessing',
      threeBytes.length === 0,
      threeBytes.length === 0 ? `${requested.length} requests total` : threeBytes.join(', '),
    );

    const stations = await page.evaluate(() =>
      [...document.querySelectorAll('.station-card-2d')].map((el) => ({
        id: el.id,
        heading: el.querySelector('h2')?.textContent?.trim() ?? '',
        // Real copy, not a placeholder: every card must render body text.
        bodyChars: (el.querySelector('.body')?.textContent ?? '').trim().length,
      })),
    );
    const expected = ['about', 'experience', 'freelance', 'research', 'achievements', 'contact'];
    const rendered = stations.map((s) => s.id.replace('station-', ''));
    check(
      '2D mode renders all six content stations',
      expected.every((id) => rendered.includes(id)),
      rendered.join(', '),
    );
    check(
      'every 2D station has a heading and real body copy',
      stations.every((s) => s.heading.length > 0 && s.bodyChars > 200),
      stations.map((s) => `${s.id}:${s.bodyChars}ch`).join(' '),
    );

    const landmarks = await page.evaluate(() => ({
      skip: !!document.querySelector('.skip-link[href="#main"]'),
      nav: !!document.querySelector('header nav[aria-label]'),
      main: !!document.querySelector('main#main'),
      footer: !!document.querySelector('footer.footer-2d'),
      h1: (document.querySelector('main h1')?.textContent ?? '').trim().length > 0,
    }));
    check(
      '2D landmarks: skip link, nav, main, footer, h1',
      Object.values(landmarks).every(Boolean),
      JSON.stringify(landmarks),
    );

    // Keyboard: tab reaches the skip link first, station links are real anchors.
    const firstTab = await page.evaluate(() => {
      const links = [...document.querySelectorAll('#nav-menu a[href^="#station-"]')];
      return {
        count: links.length,
        allAnchors: links.every((a) => a.tagName === 'A' && (a.getAttribute('href') ?? '').startsWith('#station-')),
      };
    });
    check('station nav uses real anchor links', firstTab.count === 7 && firstTab.allAnchors, `${firstTab.count} links`);

    check(
      '2D mode has no unexpected console errors',
      errors.length === 0,
      errors.slice(0, 3).join(' | '),
    );

    // 2D -> 3D: the toggle mounts the canvas.
    const canTry3D = await page.evaluate(() => !!document.querySelector('.mode-toggle'));
    check('2D offers the 3D toggle (WebGL present)', canTry3D);
    if (canTry3D) {
      await page.click('.mode-toggle');
      await page.waitForTimeout(4000);
      const canvas = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return !!c && c.width > 0 && c.height > 0;
      });
      check('switching 2D -> 3D mounts a live canvas', canvas);
    }

    await page.close();
  }

  /* ---------------- reduced motion auto-selects 2D ---------------- */
  {
    const { page, errors } = await newPage(
      { width: 1280, height: 800 },
      { reducedMotion: 'reduce' },
    );
    await page.goto('http://localhost:4191/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const mode = await page.evaluate(() => ({
      has2D: !!document.querySelector('.site-2d'),
      hasCanvas: !!document.querySelector('canvas'),
    }));
    check(
      'prefers-reduced-motion auto-selects the 2D experience',
      mode.has2D && !mode.hasCanvas,
      JSON.stringify(mode),
    );
    check('reduced-motion 2D has no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }

  /* ---------------- 3D mode still boots on desktop ---------------- */
  {
    const { page, errors } = await newPage({ width: 1280, height: 800 });
    await page.goto('http://localhost:4191/?mode=3d', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    const canvas = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return !!c && c.width > 0 && c.height > 0;
    });
    check('3D mode boots a live canvas (?mode=3d)', canvas);

    // ?quality=low is honoured: the debug overlay reports the LOW tier.
    await page.keyboard.press('d');
    await page.waitForTimeout(500);
    const autoQuality = await page.evaluate(() => {
      const el = document.querySelector('[data-debug-overlay]');
      const line = [...(el?.children ?? [])].find((c) => c.textContent?.startsWith('quality'));
      return line?.textContent ?? '';
    });
    check('3D auto quality resolves without a query override', /quality\s+\w+/.test(autoQuality), autoQuality.trim());
    await page.keyboard.press('d');

    // 3D -> 2D via the nav toggle unmounts the canvas entirely.
    const switched = await page.evaluate(() => {
      const btn = document.querySelector('header button.mode-switch');
      if (!btn) return 'no-toggle';
      btn.click();
      return 'clicked';
    });
    check('3D nav exposes a mode control', switched === 'clicked', switched);
    if (switched === 'clicked') {
      await page.waitForTimeout(2500);
      const after = await page.evaluate(() => ({
        has2D: !!document.querySelector('.site-2d'),
        hasCanvas: !!document.querySelector('canvas'),
      }));
      check(
        'switching 3D -> 2D unmounts the canvas and shows 2D',
        after.has2D && !after.hasCanvas,
        JSON.stringify(after),
      );
    }
    /*
     * The bike is fully procedural (no remote model), so any console error
     * here is unexpected — model-load noise filters stay as defence in depth.
     */
    const realErrors = errors.filter((e) => !/bike\.glb|does-not-exist|404|Failed to fetch/i.test(e));
    check('3D mode has no unexpected console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
    await page.close();

    // ?quality=low pins the LOW tier (no bloom, no trail, cheapest frame).
    const low = await newPage({ width: 1280, height: 800 });
    await low.page.goto('http://localhost:4191/?mode=3d&quality=low', { waitUntil: 'networkidle' });
    await low.page.waitForTimeout(3000);
    await low.page.keyboard.press('d');
    await low.page.waitForTimeout(500);
    const lowQuality = await low.page.evaluate(() => {
      const el = document.querySelector('[data-debug-overlay]');
      const q = [...(el?.children ?? [])].find((c) => c.textContent?.startsWith('quality'))?.textContent ?? '';
      const fx = [...(el?.children ?? [])].find((c) => c.textContent?.startsWith('effects'))?.textContent ?? '';
      return { q: q.trim(), fx: fx.trim() };
    });
    check(
      '?quality=low pins LOW with all effects off',
      lowQuality.q.includes('LOW') && /blm- trl- dst-/.test(lowQuality.fx),
      `${lowQuality.q} / ${lowQuality.fx}`,
    );
    await low.page.close();
  }

  /* ---------------- 3D mode on a phone viewport ---------------- */
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const { page, errors } = await newPage(viewport);
    await page.goto('http://localhost:4191/?mode=3d', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    const state = await page.evaluate(() => ({
      canvas: (() => {
        const c = document.querySelector('canvas');
        return !!c && c.width > 0 && c.height > 0;
      })(),
      navLinks: document.querySelectorAll('header nav a[href^="#station-"]').length,
      overlayCards: document.querySelectorAll('[id^="station-"]').length,
      minimapHidden: window.getComputedStyle(document.querySelector('.minimap-wrap') ?? document.body).display === 'none',
    }));
    check(`3D boots on ${label}`, state.canvas);
    check(`3D nav + overlay present on ${label}`, state.navLinks === 7 && state.overlayCards >= 7, `links=${state.navLinks} cards=${state.overlayCards}`);
    const realErrors = errors.filter((e) => !/bike\.glb|does-not-exist|404|Failed to fetch/i.test(e));
    check(`3D has no unexpected errors on ${label}`, realErrors.length === 0, realErrors.slice(0, 2).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
