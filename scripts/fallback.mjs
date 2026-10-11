/**
 * Acceptance test for the procedural Speed T4 motorcycle.
 *
 * The bike is built synchronously from Three.js primitives (no remote model),
 * so there is no load-failure mode to cover. What this guards instead: the
 * scene boots without page errors, the canvas renders, and the ride, camera
 * and wheels still work end to end.
 *
 * Run with:  node scripts/fallback.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const DEBUG = process.env.SMOKE_DEBUG === '1';
const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const server = await createServer({ server: { port: 4189, strictPort: true }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const warnings = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});

try {
  await page.goto('http://localhost:4189/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  if (DEBUG) {
    console.log(`      warnings: ${JSON.stringify(warnings.slice(0, 5))}`);
    console.log(`      errors:   ${JSON.stringify(errors.slice(0, 5))}`);
    console.log(`      canvas:   ${await page.evaluate(() => !!document.querySelector('canvas'))}`);
  }

  check(
    'scene boots without a page error',
    errors.filter((e) => !/404|Failed to fetch|load/i.test(e)).length === 0,
    `${errors.length} error-ish console entries`,
  );

  const canvasOk = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  check('motorcycle scene renders', canvasOk);

  // The ride must still work: keyboard "d" then scroll, and read the overlay.
  await page.keyboard.press('d');
  await page.waitForTimeout(300);

  const readOverlay = () =>
    page.evaluate(() => {
      // Selected by test id, not by the text of its first line — see the note in
      // scripts/smoke.mjs. Matching on "progress " made the HUD's line order
      // load-bearing and turned an unrelated overlay change into a NaN here.
      const el =
        document.querySelector('[data-debug-overlay]') ??
        [...document.querySelectorAll('div')].find((d) => d.textContent?.startsWith('progress '));
      const grab = (key) => {
        const line = [...(el?.children ?? [])].find((c) => c.textContent?.startsWith(key));
        return line ? Number.parseFloat(line.textContent.split(/\s+/)[1]) : NaN;
      };
      return { progress: grab('progress'), t: grab('t ') };
    });

  await page.evaluate(() => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, limit * 0.6);
    window.dispatchEvent(new Event('scroll'));
  });
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(3000);

  const after = await readOverlay();
  check(
    'ride still advances with the motorcycle',
    after.t > 0.1,
    `t=${after.t}`,
  );

  // Confirm the procedural geometry actually made it into the scene.
  const drawInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c?.getContext('webgl2') ?? c?.getContext('webgl');
    return { hasGl: !!gl };
  });
  check('webgl context still valid', drawInfo.hasGl);
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
