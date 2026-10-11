/**
 * Phase 4 acceptance test.
 *
 * Boots the dev server in Chromium and checks the content layer against the
 * brief: exactly one card visible at a time, no flicker at a station boundary,
 * every content.ts item present in the DOM, no phone number anywhere, nav and
 * mini-map jumps actually riding the bike, wheel scrolling over a card, tab order
 * and the phone-number audit.
 *
 * Run with:  node scripts/phase4.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const server = await createServer({ server: { port: 4191, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const consoleWarnings = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
  if (m.type() === 'warning') consoleWarnings.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

/**
 * Drives Lenis the way a user would: real wheel input, then wait for the ride.
 *
 * `expectedT` is the station's track position, passed so `settle` can confirm
 * arrival instead of guessing from frame-to-frame stillness.
 */
async function scrollTo(pageRef, ratio, expectedT = null) {
  await pageRef.evaluate((r) => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, limit * r);
    window.dispatchEvent(new Event('scroll'));
  }, ratio);
  for (let i = 0; i < 40; i++) {
    const current = await pageRef.evaluate(() => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      return limit > 0 ? window.scrollY / limit : 0;
    });
    if (Math.abs(current - ratio) < 0.01) break;
    await pageRef.mouse.wheel(0, (ratio - current) * 2000);
    await pageRef.waitForTimeout(100);
  }
  await settle(pageRef, expectedT);
}

/**
 * Damped ride `t`, read from the live mutable object the render loop writes.
 * Far more reliable than scraping the debug HUD's rendered text, which is
 * itself only refreshed on a rAF tick.
 */
const readT = () => page.evaluate(() => window.__RIDE__?.t ?? null);

const readProgress = () =>
  page.evaluate(() => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    return limit > 0 ? window.scrollY / limit : 0;
  });

/**
 * Waits for the ride damping to actually reach its target.
 *
 * Damping runs inside the render loop, and SwiftShader renders at roughly 4fps,
 * so each frame only advances `t` by ~18% of the remaining gap. Two samples
 * 300ms apart can easily land on the same frame and read as "no movement", which
 * is how the first version of this helper concluded the bike had arrived while it
 * was still halfway. The only reliable signal is `t` approaching the target
 * implied by the scroll position.
 */
async function settle(pageRef, expectedT = null, tries = 80) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await pageRef.waitForTimeout(200);
    const t = await pageRef.evaluate(() => window.__RIDE__?.t ?? null);
    const value = t ?? -1;
    if (expectedT !== null && t !== null && Math.abs(t - expectedT) < 0.005) return t;
    stable = Math.abs(value - last) < 0.0015 ? stable + 1 : 0;
    last = value;
    // Arrived: close enough to the target, or no measurable movement across
    // several consecutive samples (i.e. the damping has come to rest).
    if (stable >= 5) return t;
  }
  return last;
}

/** Opacity of every station card, in ride order. */
const readCards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[id^="station-"]')].map((section) => ({
      id: section.id,
      opacity: Number.parseFloat(getComputedStyle(section).opacity),
      visibility: getComputedStyle(section).visibility,
      text: (section.textContent ?? '').length,
    })),
  );

try {
  await page.goto('http://localhost:4191/', { waitUntil: 'networkidle' });
  // Wait for the Phase 5 loader sequence to complete (minLoaderMs + fadeMs ≈ 770ms on LOW).
  await page.waitForSelector('[data-loader]', { state: 'detached', timeout: 10_000 });
  await page.waitForTimeout(3000);
  await page.keyboard.press('d');
  await page.waitForTimeout(300);

  /* ------------------------------------------------ scroll range is exact */
  const range = await page.evaluate(() => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    return { limit, screens: limit / window.innerHeight };
  });
  check(
    'scroll ceiling is exactly six viewports (7 stations, 6 gaps)',
    Math.abs(range.screens - 6) < 0.02,
    `${range.screens.toFixed(3)} screens`,
  );

  /* ------------------------------------------------------- one card at a time */
  // Station track positions from src/config/scene.ts, and their scroll ratios.
  const stations = [
    ['hero', 0, 0],
    ['about', 1 / 6, 0.15],
    ['experience', 2 / 6, 0.32],
    ['freelance', 3 / 6, 0.48],
    ['research', 4 / 6, 0.62],
    ['achievements', 5 / 6, 0.8],
    ['contact', 1, 1],
  ];
  let maxVisible = 0;
  for (const [i, [id, ratio, expectedT]] of stations.entries()) {
    await scrollTo(page, ratio, expectedT);
    const cards = await readCards();
    const visible = cards.filter((c) => c.opacity > 0.5);
    maxVisible = Math.max(maxVisible, visible.length);
    const active = visible[0]?.id ?? 'none';
    check(
      `station ${i + 1} shows exactly one card, the right one`,
      visible.length === 1 && active === `station-${id}`,
      `visible: ${active}`,
    );
  }
  check('never more than one card over the whole ride', maxVisible <= 1, `max ${maxVisible}`);

  /* ------------------------------------------------- no flicker at a boundary */
  // Park exactly on the about/experience midpoint, let the damping settle, then
  // sample. This is where hysteresis earns its keep: without a dead band, the
  // damped value settling a hair either side of the midpoint would flip the
  // active card back and forth indefinitely.
  const boundary = (1 / 6 + 2 / 6) / 2;
  await page.evaluate((r) => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, limit * r);
    window.dispatchEvent(new Event('scroll'));
  }, boundary);
  await settle(page);
  const samples = [];
  for (let i = 0; i < 14; i++) {
    samples.push(
      (await readCards())
        .filter((c) => c.opacity > 0.5)
        .map((c) => c.id)
        .join(',') || 'none',
    );
    await page.waitForTimeout(150);
  }
  check(
    'no flicker while parked on a station boundary',
    new Set(samples).size === 1,
    samples.join(' | '),
  );

  /* --------------------------------------------- every section in the DOM/AT */
  const presence = await page.evaluate(() => {
    const ids = ['hero', 'about', 'experience', 'freelance', 'research', 'achievements', 'contact'];
    return ids.map((id) => {
      const section = document.getElementById(`station-${id}`);
      return {
        id,
        exists: !!section,
        tag: section?.tagName ?? '',
        heading: section?.querySelector('h1, h2')?.textContent?.trim() ?? '',
        // Hidden only by opacity: the text is still in the accessibility tree.
        ariaHidden: section?.getAttribute('aria-hidden'),
        inert: section?.hasAttribute('inert'),
        chars: (section?.textContent ?? '').replace(/\s+/g, ' ').trim().length,
      };
    });
  });
  check(
    'all seven sections are real <section> elements in the DOM',
    presence.every((p) => p.exists && p.tag === 'SECTION'),
    presence.map((p) => `${p.id}:${p.tag}`).join(' '),
  );
  check(
    'every section has an h1/h2 and substantial copy',
    presence.every((p) => p.heading.length > 2 && p.chars > 200),
    presence.map((p) => `${p.id}=${p.chars}`).join(' '),
  );
  check(
    'inactive sections are not aria-hidden or inert (readable by screen readers)',
    presence.every((p) => p.ariaHidden === null && p.inert === false),
  );

  /* ----------------------------------------------- content.ts completeness */
  // `textContent`, not `innerText`: inactive cards are faded with opacity, which
  // innerText treats as unrendered. The brief requires them to stay in the DOM.
  const body = await page.evaluate(() => document.body.textContent ?? '');
  const must = [
    'Hrithik Paul',
    'West Bengal, India',
    'Download Resume',
    'Scroll to ride',
    'Node.js',
    'RAG',
    'Telaverge',
    'Dec 2023',
    'Persistent Systems',
    'Jun 2023',
    'Aug 2023',
    'Luvia',
    'Nexarise',
    'Google Play',
    'ZAI-Cortex',
    'DocGen-TestGen',
    'IEEE Access',
    'Springer',
    'Google Scholar',
    'Toycathon',
    'JIS Samman',
    '9.32',
    '92.8%',
    '86.4%',
    'Bengali',
    'hrithikpaul2001@gmail.com',
    'Ride again',
  ];
  const missing = must.filter((needle) => !body.includes(needle));
  check('every content.ts item renders', missing.length === 0, missing.join(', ') || 'all present');

  // Socials show a label plus an icon; the destination only lives in the href,
  // so assert against attributes rather than visible text.
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  );
  const wantHrefs = [
    'https://github.com/HRX101',
    'https://linkedin.com/in/hrithik-paul',
    '/resume.pdf',
  ];
  const missingHrefs = wantHrefs.filter((href) => !hrefs.includes(href));
  check('social and resume links point at the right URLs', missingHrefs.length === 0, missingHrefs.join(', '));

  const labelled = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="http"]')].every(
      (a) => (a.textContent ?? '').trim().length > 0 || (a.getAttribute('aria-label') ?? '').length > 0,
    ),
  );
  check('every outbound link has an accessible name', labelled);

  const publications = [
    'AI-Based Medical Chatbot Model for Infectious Disease Prediction',
    'Deep Learning Based Potato Leaf Disease Detection Using Explainable AI',
    'Perception Analysis of Social Network Tweets Using Genetic Algorithm',
    'Voicebot for Mental Disease Prediction and Treatment Recommendation',
    'Explainable AI for Bird Sound Species Recognition',
    'Shape-Focused Autoencoder for Ear Biometrics',
  ];
  const missingPubs = publications.filter((needle) => !body.includes(needle));
  check('all six publications render', missingPubs.length === 0, missingPubs.join(' | ') || '6/6');

  const skillCount = await page.evaluate(
    () => document.querySelectorAll('.skill-tile').length,
  );
  check('skill tiles render for every skill', skillCount >= 50, `${skillCount} tiles`);

  /* ---------------------------------------------------------- phone audit */
  // Scans rendered text and every attribute value, not innerHTML: SVG path data
  // is a long run of digits and would swamp a naive search. A phone number
  // reaches the page as text or as a tel: link, so those are what matter.
  const phoneish = await page.evaluate(() => {
    const runs = [];
    const text = document.body.textContent ?? '';
    for (const m of text.matchAll(/(?:\+?\d[\d\s().-]{8,}\d)/g)) {
      if ((m[0].match(/\d/g) ?? []).length >= 10) runs.push(`text: ${m[0].trim()}`);
    }
    const nodes = document.querySelectorAll('[href], [src], [alt], [title], [aria-label], [content]');
    for (const node of nodes) {
      for (const attr of node.attributes) {
        if (!/(?:\+?\d[\d\s().-]{8,}\d)/.test(attr.value)) continue;
        if ((attr.value.match(/\d/g) ?? []).length >= 10) runs.push(`${attr.name}: ${attr.value}`);
      }
    }
    return runs;
  });
  check(
    'no phone-number-shaped text or attribute anywhere in the DOM',
    phoneish.length === 0,
    phoneish.join(' | '),
  );
  const telLinks = await page.evaluate(() => document.querySelectorAll('a[href^="tel:"]').length);
  check('no tel: link exists', telLinks === 0, `${telLinks} found`);


  /* --------------------------------------------------- nav link rides there */
  await scrollTo(page, 0);
  const startT = await readT();
  await page.click('nav a[href="#station-research"]');
  await page.waitForTimeout(500);
  const midT = await readT();
  const midProgress = await readProgress();
  // Sample again shortly after: a teleport would already be parked and identical
  // twice, whereas an animation is still moving.
  await page.waitForTimeout(250);
  const laterProgress = await readProgress();
  const landedT = await settle(page, 0.62);
  check(
    'nav link scrolls rather than teleports',
    midT > startT + 0.02 && laterProgress > midProgress && laterProgress < 1,
    `t ${startT.toFixed(4)} -> ${midT.toFixed(4)} (0.5s) -> ${landedT.toFixed(4)}; ` +
      `progress ${midProgress.toFixed(3)} -> ${laterProgress.toFixed(3)}`,
  );
  check('nav link lands on the right station', Math.abs(landedT - 0.62) < 0.02, `t=${landedT}`);

  const activeNav = await page.evaluate(
    () => document.querySelector('nav a[aria-current="true"]')?.getAttribute('href'),
  );
  check('active nav link follows the ride', activeNav === '#station-research', String(activeNav));

  /* ------------------------------------------------------ minimap click jump */
  const dots = await page.$$('.minimap-dot');
  check('mini-map has one control per station', dots.length === 7, `${dots.length} dots`);
  await dots[1].click();
  await page.waitForTimeout(500);
  const midDotProgress = await readProgress();
  const afterDot = await settle(page, 0.15);
  check(
    'mini-map station click animates rather than jumps',
    midDotProgress > 0.1,
    `progress mid-flight ${midDotProgress.toFixed(3)}`,
  );
  check('mini-map station click rides to that station', Math.abs(afterDot - 0.15) < 0.02, `t=${afterDot}`);

  const rider = await page.evaluate(() => {
    const circle = document.querySelectorAll('svg circle');
    const last = circle[circle.length - 1];
    return { cx: last?.getAttribute('cx'), cy: last?.getAttribute('cy') };
  });
  check('mini-map rider dot has moved off its mount position', rider.cx !== '80.00', JSON.stringify(rider));

  /* ------------------------------------------- wheel works over a card */
  await scrollTo(page, 4 / 6, 0.62);
  const cardBox = await page.evaluate(() => {
    const section = document.getElementById('station-research');
    const card = section?.querySelector('.station-card');
    const r = card?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  check('a visible card is on screen', cardBox !== null, JSON.stringify(cardBox));
  const before = await page.evaluate(() => window.scrollY);
  if (cardBox) {
    await page.mouse.move(cardBox.x, cardBox.y);
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 240);
  }
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.scrollY);
  check('wheel over a card still scrolls the page', after > before + 200, `${before} -> ${after}`);

  const overflow = await page.evaluate(() => {
    const card = document.querySelector('#station-research .station-card');
    return card ? getComputedStyle(card).overflowY : 'none';
  });
  check('cards do not capture scroll with their own overflow', overflow === 'visible', overflow);

  /* ------------------------------------------------------- copy-email toast */
  await scrollTo(page, 1, 1);
  await page.click('#station-contact button[aria-label]');
  await page.waitForTimeout(400);
  const toast = await page.evaluate(() => {
    const status = document.querySelector('#station-contact [role="status"]');
    return (status?.textContent ?? '').trim();
  });
  check(
    'copy-email button reports a result through a live region',
    toast === 'Copied' || toast.startsWith('Copy failed'),
    toast || '(empty)',
  );

  /* ------------------------------------------ tab order skips hidden cards */
  // Park on the freelance station so there is one plainly visible card to
  // compare the hidden ones against.
  await scrollTo(page, 3 / 6, 0.48);
  await settle(page, 0.48);
  const tabbable = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('[id^="station-"]')];
    return sections.map((s) => {
      const focusables = [...s.querySelectorAll('a[href], button:not([disabled]), [tabindex]')];
      return {
        id: s.id,
        opacity: Number.parseFloat(getComputedStyle(s).opacity),
        tabbable: focusables.filter((f) => f.getAttribute('tabindex') !== '-1' && f.tabIndex >= 0)
          .length,
      };
    });
  });
  const inactiveTabbable = tabbable.filter((s) => s.opacity < 0.5 && s.tabbable > 0);
  check(
    'invisible cards hold no tab stops, the visible one does',
    inactiveTabbable.length === 0 && tabbable.some((s) => s.opacity > 0.5 && s.tabbable > 0),
    JSON.stringify(inactiveTabbable),
  );

  /* --------------------------------------------------- focus rings visible */
  // :focus-visible only matches on real keyboard input, so Tab into the page
  // rather than calling focus(), then read the outline the user would actually see.
  await page.evaluate(() => document.body.focus());
  let focusRing = null;
  for (let i = 0; i < 12 && !focusRing; i++) {
    await page.keyboard.press('Tab');
    focusRing = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const width = Number.parseFloat(style.outlineWidth);
      return {
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 24),
        width,
        style: style.outlineStyle,
        visible: style.outlineStyle !== 'none' && width >= 1,
      };
    });
  }
  check(
    'keyboard focus draws a visible outline',
    focusRing !== null && focusRing.visible,
    JSON.stringify(focusRing),
  );

  /* --------------------------------------------------- hero cue + progress */
  await scrollTo(page, 0);
  const cueAtTop = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-cue')),
  );
  await scrollTo(page, 0.05);
  const cueLater = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hero-cue')),
  );
  check('hero scroll cue fades out within the first 3% of scroll', cueAtTop > 0.9 && cueLater < 0.1,
    `${cueAtTop} -> ${cueLater}`);

  // Read the journey bar at the end of the ride, which is where it should be
  // reporting full completion.
  await scrollTo(page, 1, 1);
  const bar = await page.evaluate(() => {
    const el = document.querySelector('[role="progressbar"]');
    return {
      now: el?.getAttribute('aria-valuenow'),
      min: el?.getAttribute('aria-valuemin'),
      max: el?.getAttribute('aria-valuemax'),
      label: el?.getAttribute('aria-label'),
    };
  });
  check(
    'progress bar reports the journey, labelled and bounded 0-100',
    Number(bar.now) >= 95 && bar.min === '0' && bar.max === '100' && !!bar.label,
    JSON.stringify(bar),
  );

  /* ------------------------------------------------------------- console */
  const real = consoleErrors.filter(
    (e) => !/bike\.glb|Failed to load|404|net::ERR|useGLTF|WebGL|SwiftShader|GLB unavailable/i.test(e),
  );
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | ') || `${consoleErrors.length} filtered`);
  if (consoleWarnings.length) console.log(`      warnings: ${consoleWarnings.slice(0, 4).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
