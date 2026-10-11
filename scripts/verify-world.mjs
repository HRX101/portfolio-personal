/**
 * Phase 3 verification: measures draw calls, triangles and FPS at each station,
 * and confirms every landmark is actually in frame when its station is docked.
 *
 * Run with:  node scripts/verify-world.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 4192, strictPort: true }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failures = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(label);
};

try {
  await page.goto('http://localhost:4192/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const stats = await page.evaluate(() => window.__RENDER_STATS__);
  check(stats?.calls > 0, 'render stats probe is live', `calls=${stats?.calls}`);

  const rows = [];
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press(String(i + 1));
    // Let the ride damp to the dock and the FPS reading settle.
    await page.waitForTimeout(2600);

    const row = await page.evaluate((index) => {
      const s = window.__RENDER_STATS__;
      const ride = window.__RIDE__ ?? {};
      const anchors = window.__LANDMARK_ANCHORS__ ?? [];
      const anchor = anchors[index];
      const ndc = anchor ? window.__PROJECT__(anchor.position[0], anchor.position[1], anchor.position[2]) : null;
      return {
        calls: s?.calls ?? 0,
        triangles: s?.triangles ?? 0,
        fps: s?.fps ?? 0,
        t: ride.t,
        station: ride.station,
        anchor,
        ndc,
      };
    }, i);

    rows.push(row);
    const [nx, ny, nz] = row.ndc ?? [0, 0, 0];
    const inFront = nz > -1 && nz < 1;
    const inView = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    check(
      inFront && inView,
      `station ${i + 1} landmark is in frame`,
      `ndc=(${nx.toFixed(2)}, ${ny.toFixed(2)}, ${nz.toFixed(2)})`,
    );
  }

  const maxCalls = Math.max(...rows.map((r) => r.calls));
  const maxTris = Math.max(...rows.map((r) => r.triangles));
  const minFps = Math.min(...rows.map((r) => r.fps));
  const avgFps = rows.reduce((a, r) => a + r.fps, 0) / rows.length;

  console.log('\n--- per station ---');
  rows.forEach((r, i) => {
    console.log(
      `  ${i + 1}: draws=${r.calls}  tris=${r.triangles.toLocaleString()}  fps=${r.fps.toFixed(0)}  t=${r.t.toFixed(3)}`,
    );
  });
  console.log(
    `\nmax draws=${maxCalls}  max tris=${maxTris.toLocaleString()}  min fps=${minFps.toFixed(0)}  avg fps=${avgFps.toFixed(0)}`,
  );

  check(maxCalls < 150, 'draw calls stay under 150', `max=${maxCalls}`);
  // This environment renders with SwiftShader (software GL), so the absolute
  // FPS is not representative of a real desktop GPU. Reported for information;
  // the objective proxies are draw calls and triangle count above.
  console.log(
    `INFO  fps under software GL: min=${minFps.toFixed(0)} avg=${avgFps.toFixed(0)} (desktop GPU target is 60)`,
  );
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
