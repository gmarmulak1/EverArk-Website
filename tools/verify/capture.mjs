/**
 * Screenshot every page at three widths, either from the live Weebly site or
 * from the local build, so the two can be diffed pixel-for-pixel.
 *
 * Both sides get identical treatment: the same third-party overlays are
 * blocked, animations are frozen, and lazy images are forced in. Without that
 * the consent banner, the chat bubble and the hero animations alone would
 * produce more diff than a real regression ever would.
 *
 *   node tools/verify/capture.mjs live      -> shots/live/
 *   node tools/verify/capture.mjs local     -> shots/local/
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { pages, ROOT } from '../lib/refs.mjs';

const SIDE = process.argv[2];
if (!SIDE) {
  console.error('usage: capture.mjs <label>   (label names the snapshot dir under tools/verify/shots/)');
  process.exit(1);
}

// Snapshots are always taken from the local build. Comparing against the live
// Weebly site is not an option here: this sandbox cannot open everark.io in a
// browser. Instead each migration step is diffed against the snapshot taken
// immediately before it, which is the stricter test anyway - it catches drift
// the moment it is introduced rather than at the end.
const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT || 8080}`;
const OUT = path.join(ROOT, 'tools/verify/shots', SIDE);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'mobile', width: 390, height: 900 },
];

/** Hosts whose output is nondeterministic or irrelevant to layout. */
const BLOCKED = [
  'googletagmanager.com', 'google-analytics.com', 'doubleclick.net',
  'app.termly.io', 'getgobot.com', 'rlets.com', 'marketingautomation.services',
  'diffuser-cdn.app-us1.com', 'sc.lfeeder.com', 'static.elfsight.com',
  'assets.calendly.com', 'calendly.com', 'google.com/recaptcha', 'gstatic.com/recaptcha',
  'facebook.com/tr', 'clarity.ms', 'hotjar',
];

// Freeze anything that moves and neutralise the widgets that survive blocking.
const STABILISE = `
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  .termly-styles-root, #termly-code-snippet-support, [id^="gobot"], .gobot-widget,
  iframe[src*="calendly"], iframe[src*="termly"], .grecaptcha-badge,
  [class*="elfsight"], iframe[title*="chat" i] { display: none !important; }
  html { scroll-behavior: auto !important; }
`;

const list = (ONLY || pages()).map((p) => p.replace(/\.html$/, ''));
fs.mkdirSync(OUT, { recursive: true });

// The image ships Chromium at a fixed path; never let Playwright try to download one.
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// Outbound HTTPS in this environment is tunnelled through the agent proxy,
// which re-terminates TLS — hence the proxy arg plus ignoreHTTPSErrors below.
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  proxy: /^https:/.test(ORIGIN) && PROXY ? { server: PROXY, bypass: 'localhost,127.0.0.1' } : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--force-color-profile=srgb'],
});
const context = await browser.newContext({
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  // The export is full of http:// subresources; don't let a cert warning stop us.
  ignoreHTTPSErrors: true,
});
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (BLOCKED.some((b) => url.includes(b))) return route.abort();
  return route.continue();
});

let done = 0;
const failures = [];

for (const slug of list) {
  const url = slug === 'index' ? `${ORIGIN}/` : `${ORIGIN}/${slug}.html`;
  for (const vp of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.addStyleTag({ content: STABILISE });
      // Scroll the full height so lazy/in-view content commits, then return.
      await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 150));
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((i) =>
            i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }),
          ),
        );
      });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(OUT, `${slug}--${vp.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    } catch (err) {
      failures.push(`${slug} ${vp.name}: ${err.message.split('\n')[0]}`);
    }
    await page.close();
  }
  done++;
  if (done % 10 === 0) console.log(`  ${done}/${list.length}`);
}

await browser.close();
console.log(`${SIDE}: captured ${done} pages x ${VIEWPORTS.length} viewports -> ${path.relative(ROOT, OUT)}`);
if (failures.length) {
  console.log(`${failures.length} failures:`);
  for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
}
