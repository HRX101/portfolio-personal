/**
 * Visual capture: renders the ride at several scroll positions and writes PNGs
 * so the scene can be inspected without a GPU or a display.
 *
 * Also samples the framebuffer to catch the failure modes a check for "no crash"
 * would miss: a fully black frame, or a sky with no gradient in it.
 *
 * Run with:  node scripts/capture.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const OUT = process.argv[2] ?? 'captures';

const server = await createServer({ server: { port: 4190, strictPort: true }, logLevel: 'error' });
await server.listen();
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const SHOTS = [
  { name: '01-hero', ratio: 0.0 },
  { name: '02-about', ratio: 1 / 6 },
  { name: '03-experience', ratio: 2 / 6 },
  { name: '04-freelance', ratio: 3 / 6 },
  { name: '05-research', ratio: 4 / 6 },
  { name: '06-achievements', ratio: 5 / 6 },
  { name: '07-contact', ratio: 1.0 },
];

try {
  await page.goto('http://localhost:4190/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  for (const shot of SHOTS) {
    await page.evaluate((r) => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, limit * r);
      window.dispatchEvent(new Event('scroll'));
    }, shot.ratio);

    // Pump real wheel input so Lenis animates, then let the ride damping settle.
    for (let i = 0; i < 30; i++) {
      const current = await page.evaluate(() => {
        const limit = document.documentElement.scrollHeight - window.innerHeight;
        return limit > 0 ? window.scrollY / limit : 0;
      });
      if (Math.abs(current - shot.ratio) < 0.005) break;
      await page.mouse.wheel(0, (shot.ratio - current) * 2000);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(2600);

    const file = `${OUT}/${shot.name}.png`;

    // Measure the composited PNG, not the WebGL backbuffer: readPixels returns
    // zeros because the drawing buffer is not preserved, so it says nothing
    // about what was actually presented. The screenshot buffer is decoded in
    // the page, where Canvas 2D and createImageBitmap are already available.
    const buffer = await page.screenshot({ path: file });
    const stats = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const off = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = off.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      let sum = 0;
      let min = 255;
      let max = 0;
      const n = bitmap.width * bitmap.height;
      for (let i = 0; i < n; i++) {
        const luma = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
        sum += luma;
        if (luma < min) min = luma;
        if (luma > max) max = luma;
      }
      return { mean: sum / n, min, max, spread: max - min };
    }, buffer.toString('base64'));

    const ok = stats && stats.mean > 4 && stats.spread > 20;
    console.log(
      `${ok ? 'OK  ' : 'WARN'} ${file}  mean=${stats?.mean.toFixed(1)} spread=${stats?.spread.toFixed(1)}`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
