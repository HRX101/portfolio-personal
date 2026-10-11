/**
 * Probes what is actually on screen at each scroll stop: which DOM element sits
 * at the centre of the viewport, the canvas rect, and the ride state.
 *
 * Screenshots cannot be reviewed in CI, so this answers "is the bike visible and
 * is the copy on top of it" as text.
 *
 * Run with:  node scripts/inspect.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 4191, strictPort: true }, logLevel: 'error' });
await server.listen();

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.goto('http://localhost:4191/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c?.getBoundingClientRect();
    return {
      css: r ? `${Math.round(r.width)}x${Math.round(r.height)} at y=${Math.round(r.y)}` : 'none',
      buffer: c ? `${c.width}x${c.height}` : 'none',
      zIndex: c ? getComputedStyle(c.parentElement).zIndex : 'none',
    };
  });
  console.log(`canvas: ${JSON.stringify(canvas)}\n`);

  for (const ratio of [0, 1 / 6, 3 / 6, 5 / 6, 1]) {
    await page.evaluate((r) => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, limit * r);
      window.dispatchEvent(new Event('scroll'));
    }, ratio);
    for (let i = 0; i < 30; i++) {
      const current = await page.evaluate(() => {
        const limit = document.documentElement.scrollHeight - window.innerHeight;
        return limit > 0 ? window.scrollY / limit : 0;
      });
      if (Math.abs(current - ratio) < 0.005) break;
      await page.mouse.wheel(0, (ratio - current) * 2000);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(2600);

    const info = await page.evaluate(() => {
      const sections = [...document.querySelectorAll('[id^="station-"]')].map((s) => ({
        id: s.id.replace('station-', ''),
        opacity: Number(getComputedStyle(s).opacity).toFixed(2),
        visible: getComputedStyle(s).visibility,
        heading: s.querySelector('h2')?.textContent?.slice(0, 40) ?? '',
      }));
      const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return {
        sections,
        centreElement: centre
          ? `${centre.tagName}${centre.id ? '#' + centre.id : ''}`
          : 'none',
        headingVisible: [...document.querySelectorAll('h2')].some((h) => {
          const r = h.getBoundingClientRect();
          return r.top > 0 && r.bottom < innerHeight && getComputedStyle(h).opacity !== '0';
        }),
      };
    });

    console.log(`--- progress ${ratio.toFixed(3)} ---`);
    console.log(
      `centre element: ${info.centreElement}   heading on screen: ${info.headingVisible}`,
    );
    for (const s of info.sections) {
      const mark = Number(s.opacity) > 0.5 ? ' <-- active' : '';
      console.log(`  ${s.id.padEnd(13)} opacity=${s.opacity} ${s.visible}${mark}`);
    }
    console.log('');
  }
} finally {
  await browser.close();
  await server.close();
}
