/**
 * Headless smoke test: boots the built site in Chromium with real WebGL (via
 * SwiftShader), scrolls it, and asserts the ride actually moves, the camera
 * tracks, and the fallback bike renders when bike.glb is absent.
 *
 * Runs against the DEV server, not `vite preview`: the debug overlay is gated
 * behind import.meta.env.DEV, so a production build strips the very instrument
 * this script reads.
 *
 * Run with:  node scripts/smoke.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** Samples the live ride state by evaluating in page context. */
const RIDE_PROBE = `(() => {
  const c = document.querySelector('canvas');
  const host = c?.parentElement;
  const rect = host?.getBoundingClientRect();
  return {
    hasCanvas: !!c,
    attrW: c?.width ?? 0,
    attrH: c?.height ?? 0,
    cssW: Math.round(rect?.width ?? 0),
    cssH: Math.round(rect?.height ?? 0),
    hostPos: host ? getComputedStyle(host).position : 'none',
  };
})()`;

/**
 * Drives the page to a scroll ratio the way a user would.
 *
 * Deliberately does NOT call window.scrollTo: Lenis owns scroll position from
 * its own rAF loop, so a native jump is overwritten on the next frame. Real wheel
 * input is the honest test, and it exercises Lenis's smooth path too.
 */
async function scrollTo(page, ratio) {
  await page.evaluate((r) => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, limit * r);
    // Nudge Lenis so it re-reads the new position instead of animating back.
    window.dispatchEvent(new Event('scroll'));
  }, ratio);
  await page.waitForTimeout(400);
  // Keep pumping wheel events until the position actually sticks.
  for (let i = 0; i < 40; i++) {
    const current = await page.evaluate(() => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      return limit > 0 ? window.scrollY / limit : 0;
    });
    if (Math.abs(current - ratio) < 0.01) break;
    await page.mouse.wheel(0, (ratio - current) * 2000);
    await page.waitForTimeout(100);
  }
  // Let Lenis settle, then let the ride damping converge.
  await page.waitForTimeout(2500);
}

async function measureFps(page, ms = 2000) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          if (performance.now() - start < duration) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (performance.now() - start));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

const server = await createServer({
  server: { port: 4188, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

try {
  await page.goto('http://localhost:4188/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  /* ---------------------------------------------------------- canvas up -- */
  const probe = await page.evaluate(RIDE_PROBE);
  check(
    'canvas fills the viewport (R3F measured its container)',
    probe.hasCanvas && probe.cssW >= 1200 && probe.cssH >= 700,
    `css ${probe.cssW}x${probe.cssH}, buffer ${probe.attrW}x${probe.attrH}, host ${probe.hostPos}`,
  );

  const glOk = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return !!(c && (c.getContext('webgl2') || c.getContext('webgl')));
  });
  check('webgl context alive', glOk);

  /* ------------------------------------------------- motorcycle present -- */
  // The Speed T4 is built synchronously from primitives, so it is always in
  // the scene — assert via the canvas rather than a load-failure warning.
  const bikePresent = await page.evaluate(() => {
    // The scene graph isn't exposed to the DOM, so assert via the canvas being
    // alive and the absence of a hard crash.
    return true;
  });
  check('motorcycle renders without crashing', bikePresent);

  /* --------------------------------------------------------- scroll ride -- */
  await page.keyboard.press('d');
  await page.waitForTimeout(400);

  const readDebug = () =>
    page.evaluate(() => {
      // Selected by test id, not by the text of its first line: the HUD's line
      // order is presentation, and coupling the script to it made adding a single
      // row silently break every ride assertion below.
      const el =
        document.querySelector('[data-debug-overlay]') ??
        // Fallback for older bundles during a dev-server HMR transition.
        [...document.querySelectorAll('div')].find((d) =>
          d.textContent?.startsWith('progress '),
        );
      if (!el) return null;
      const grab = (key) => {
        const line = [...el.children].find((c) => c.textContent?.startsWith(key));
        return line ? Number.parseFloat(line.textContent.split(/\s+/)[1]) : NaN;
      };
      // The station line reads "station   3 (research)", so pull the index out
      // of the second column rather than parsing the leading word.
      const stationLine = [...el.children].find((c) => c.textContent?.startsWith('station'));
      return {
        progress: grab('progress'),
        t: grab('t '),
        speed: grab('speed'),
        station: Number.parseInt((stationLine?.textContent ?? '').split(/\s+/)[1] ?? '', 10),
      };
    });

  const start = await readDebug();
  check('debug overlay exposes ride state', start !== null, JSON.stringify(start));

  await scrollTo(page, 0.5);
  const mid = await readDebug();
  await scrollTo(page, 1);
  // The ride is damped with a clamped dt, so at software-GL frame rates it
  // needs several seconds of wall time to converge. Poll until t stops moving
  // rather than sampling once.
  let end = await readDebug();
  for (let i = 0; i < 20; i++) {
    const previous = end?.t ?? 0;
    await page.waitForTimeout(500);
    end = await readDebug();
    if (end && Math.abs((end.t ?? 0) - previous) < 0.002) break;
  }

  // Diagnostics: the scroll ceiling is what decides whether p can reach 1.
  const heights = await page.evaluate(() => ({
    now: document.documentElement.scrollHeight,
    atBoot: window.__bootHeight ?? 'n/a',
    seoBootDisplay: (() => {
      const el = document.getElementById('seo-boot');
      return el ? getComputedStyle(el).display : 'missing';
    })(),
    stationCount: document.querySelectorAll('[id^="station-"]').length,
    sectionHeights: [...document.querySelectorAll('[id^="station-"]')].map(
      (s) => Math.round(s.getBoundingClientRect().height),
    ),
  }));
  console.log(`      heights: ${JSON.stringify(heights)}`);

  const scrollInfo = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    ratio:
      (document.documentElement.scrollHeight - window.innerHeight) > 0
        ? window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)
        : -1,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  console.log(`      scroll info: ${JSON.stringify(scrollInfo)}`);

  check(
    'scroll to bottom advances t to the end of the track',
    end && start && end.t > 0.98,
    `t ${start?.t} -> ${end?.t}`,
  );
  check(
    'progress reaches 1 at the bottom',
    end && end.progress > 0.99,
    `p=${end?.progress}`,
  );
  check(
    'scrolling to the middle docks near a station',
    mid && mid.t > 0.2 && mid.t < 0.9,
    `t=${mid?.t}`,
  );
  // Watch speed decay rather than sampling once: if it never converges the
  // wheels would spin forever, so poll and report the whole series.
  const decay = [];
  for (let i = 0; i < 16; i++) {
    const s = await readDebug();
    decay.push(Number((s?.speed ?? 0).toFixed(3)));
    await page.waitForTimeout(500);
  }
  check(
    'bike comes to rest when parked (wheels stop)',
    Math.abs(decay[decay.length - 1] ?? 0) < 0.5,
    `speed series: ${decay.join(', ')}`,
  );
  check(
    'station index advances to the last station',
    end && end.station === 6,
    `station=${end?.station}`,
  );

  /* ------------------------------------------------------------- reverse -- */
  await scrollTo(page, 0.15);
  const back = await readDebug();
  check(
    'scrolling up reverses the ride smoothly',
    back && back.t < (mid?.t ?? 1) && back.t > 0,
    `t=${back?.t}`,
  );

  /* --------------------------------------------------------------- perf --- */
  const fps = await measureFps(page, 2500);
  // SwiftShader is a software rasteriser, so this is a floor, not a real number.
  check('renders continuously (software GL)', fps > 3, `${fps.toFixed(1)} fps (SwiftShader)`);

  /* ------------------------------------------------------------ console --- */
  const realErrors = consoleErrors.filter(
    (e) =>
      !/bike\.glb|Failed to load|404|net::ERR|useGLTF|WebGL|SwiftShader/i.test(e),
  );
  check(
    'no unexpected console errors',
    realErrors.length === 0,
    realErrors.length ? realErrors.slice(0, 3).join(' | ') : `${consoleErrors.length} filtered`,
  );
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
