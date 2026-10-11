/**
 * Memory and leak check (Phase 7).
 *
 * Opens the site in 3D, scrolls end to end, then switches modes five times,
 * sampling JS heap after each switch. A healthy run shows the heap returning
 * to roughly the same level after every 3D unmount: the canvas, geometries and
 * textures are disposed on teardown, so repeated switching must not ratchet.
 *
 * GC is forced before each sample (`--expose-gc` + `window.gc()`) so the
 * numbers reflect retained memory, not collection timing.
 *
 * Run with:  node scripts/leak-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const server = await createServer({ server: { port: 4195, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'],
});

const MB = (bytes) => (bytes / 1024 / 1024).toFixed(1);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  // The bike is fully procedural (no remote model fetch), and rapid remounts
  // can catch Vite's dev-time dep optimizer mid-rewrite (504 Outdated Optimize
  // Dep). The latter is harness noise, not an app leak — anything else fails
  // the run.
  const harnessNoise = /bike\.glb|404|Failed to fetch|Outdated Optimize Dep|504/;
  page.on('pageerror', (e) => {
    if (!harnessNoise.test(e.message)) errors.push(e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !harnessNoise.test(m.text())) errors.push(m.text());
  });

  const heap = async () => {
    // --expose-gc is passed at launch, so window.gc forces a full collection
    // and the sample reflects retained memory rather than collection timing.
    await page.evaluate(() => (window.gc ? window.gc() : undefined));
    await page.waitForTimeout(500);
    return page.evaluate(() => performance.memory.usedJSHeapSize);
  };

  await page.goto('http://localhost:4195/?mode=3d', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // End-to-end scroll in 3D.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);

  const settled3D = await heap();
  console.log(`INFO  settled 3D heap: ${MB(settled3D)} MB (${settled3D} bytes)`);

  // Five full round-trips: 3D -> 2D -> 3D.
  const gpu = () => page.evaluate(() => {
    const s = window.__RENDER_STATS__;
    return s ? { geo: s.geometries, tex: s.textures } : null;
  });
  await page.waitForFunction(() => !!window.__RENDER_STATS__, null, { timeout: 20000 });
  const settledGpu = await gpu();
  console.log(`INFO  settled 3D gpu: geo=${settledGpu.geo} tex=${settledGpu.tex}`);
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => document.querySelector('header button.mode-switch')?.click());
    await page.waitForTimeout(2000);
    const in2D = await page.evaluate(() => !!document.querySelector('.site-2d') && !document.querySelector('canvas'));
    if (!in2D) {
      check(`round-trip ${i + 1}: reaches 2D`, false);
      break;
    }
    const heap2D = await heap();
    await page.evaluate(() => document.querySelector('.mode-toggle')?.click());
    await page.waitForTimeout(3500);
    const backIn3D = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return !!c && c.width > 0;
    });
    if (!backIn3D) {
      check(`round-trip ${i + 1}: returns to 3D`, false);
      break;
    }
    const heap3D = await heap();
    // The remount uploads asynchronously; sample GPU after it settles.
    await page.waitForTimeout(1500);
    const gpu3D = await gpu();
    samples.push({ heap2D, heap3D, gpu3D });
    console.log(`INFO  trip ${i + 1}: 2D ${MB(heap2D)} MB (${heap2D}B) -> 3D ${MB(heap3D)} MB (${heap3D}B) geo=${gpu3D?.geo} tex=${gpu3D?.tex}`);
  }
  check('five 3D -> 2D -> 3D round-trips complete', samples.length === 5, `${samples.length}/5`);

  if (samples.length === 5) {
    const last = samples[samples.length - 1].heap3D;
    const growth = (last - settled3D) / settled3D;
    check(
      'heap does not ratchet across mode switches',
      growth < 0.25,
      `${MB(settled3D)} MB -> ${MB(last)} MB (${(growth * 100).toFixed(1)}%)`,
    );
    /*
     * Unmounting must not retain the scene: allow 1% of slack for allocator
     * noise, but anything beyond that means the teardown left geometry,
     * textures or listeners behind.
     */
    const unmountFrees = samples.every((s) => s.heap2D < s.heap3D * 1.01);
    check('unmounting 3D frees heap every trip', unmountFrees);

    /*
     * GPU-side: geometries/textures must return to the settled baseline, not
     * climb once per remount. ±2 of slack for shared/derived buffers that
     * upload lazily (shadow maps, post targets) and may or may not be resident
     * at sample time.
     */
    const gpuStable = samples.every(
      (s) =>
        s.gpu3D !== null &&
        Math.abs(s.gpu3D.geo - settledGpu.geo) <= 2 &&
        Math.abs(s.gpu3D.tex - settledGpu.tex) <= 2,
    );
    const lastGpu = samples[samples.length - 1].gpu3D;
    check(
      'GPU allocations return to baseline every trip',
      gpuStable,
      `baseline geo=${settledGpu.geo} tex=${settledGpu.tex} / last geo=${lastGpu?.geo} tex=${lastGpu?.tex}`,
    );
  }

  check('no console errors during the leak run', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
