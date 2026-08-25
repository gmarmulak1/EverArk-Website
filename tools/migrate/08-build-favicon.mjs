/**
 * Step 8 — generate the favicon set.
 *
 * The Weebly site never had one, so browsers show a blank page icon. The
 * square lockup already in the media library is the natural source; it is a
 * .webp, which no browser accepts as an icon, so it is rendered and re-encoded
 * as PNG at the sizes browsers ask for. Chromium does the conversion because
 * it is the only image toolchain this environment has.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../lib/refs.mjs';

const SOURCE = 'uploads/1/0/7/5/107572223/everark-stacked-square-01_orig.webp';
const SIZES = { 'favicon-32.png': 32, 'favicon-192.png': 192, 'apple-touch-icon.png': 180 };
const OUT = path.join(ROOT, 'assets/favicon');

const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

fs.mkdirSync(OUT, { recursive: true });
const dataUri = `data:image/webp;base64,${fs.readFileSync(path.join(ROOT, SOURCE)).toString('base64')}`;

for (const [name, size] of Object.entries(SIZES)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:#fff">
       <img src="${dataUri}" style="width:${size}px;height:${size}px;object-fit:contain;display:block">
     </body></html>`,
  );
  await page.waitForFunction(() => {
    const img = document.querySelector('img');
    return img && img.complete && img.naturalWidth > 0;
  });
  await page.screenshot({ path: path.join(OUT, name), omitBackground: false });
  await page.close();
  console.log(`  ${name} (${size}x${size})`);
}

await browser.close();
console.log(`favicons written from ${SOURCE}`);
