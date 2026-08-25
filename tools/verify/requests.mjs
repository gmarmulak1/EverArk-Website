/**
 * Load every page in a browser and record where it sends requests.
 *
 * Grepping the markup is not enough: Weebly base paths survive inside
 * JavaScript strings (main.js's webpack publicPath, each platform element's
 * assets_path), and whether those ever turn into a real request can only be
 * answered by running the pages. This is the check that "the site no longer
 * depends on Weebly" is a fact rather than a hope.
 *
 * Off-origin requests are recorded and then aborted: the observation is the
 * whole point, and actually connecting to them is what makes the run
 * impossible to finish here (see the route handler below).
 *
 * Still a pre-deploy check rather than a per-edit one. FROM and PAGES slice
 * the run when you want a quick read.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { pages } from '../lib/refs.mjs';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT || 8080}`;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const WEEBLY = /(editmysite|weebly)\.com/;

// FROM/PAGES slice the run, for a quick read or to bisect a page that misbehaves.
const FROM = Number(process.env.FROM || 0);
const all = pages();
const list = process.env.PAGES ? all.slice(FROM, FROM + Number(process.env.PAGES)) : all.slice(FROM);
if (FROM || process.env.PAGES) console.log(`pages ${FROM}..${FROM + list.length - 1} of ${all.length}`);

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext();

const weeblyHits = new Map(); // url -> pages that requested it
const localFailures = new Map();
let scanned = 0;

/**
 * One page for the whole run, not one per URL. Closing a page whose
 * third-party requests are still in flight blocks, and 141 of those in
 * sequence never finishes. The listeners read `current` instead, so each
 * request is still attributed to the page that made it.
 */
let current = '';
const page = await context.newPage();

/**
 * Record every off-origin request, then abort it.
 *
 * Aborting costs nothing in coverage - the request has already been observed,
 * which is the entire question this script answers - and it is what makes the
 * run finish. Left to connect, each page's dozen or so requests to analytics
 * and widget hosts that are unreachable from a sandbox sit there occupying
 * sockets; after twenty-odd pages Chromium's connection pool is full and every
 * subsequent navigation blocks. Same-origin requests are always let through,
 * so the page itself loads exactly as it would in the wild.
 */
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN) || url.startsWith('data:') || url === 'about:blank') {
    return route.continue();
  }
  return route.abort();
});

page.on('request', (request) => {
  const url = request.url();
  if (WEEBLY.test(url) && !url.includes('/assets/vendor/')) {
    if (!weeblyHits.has(url)) weeblyHits.set(url, new Set());
    weeblyHits.get(url).add(current);
  }
});
page.on('response', (response) => {
  if (response.status() >= 400 && response.url().startsWith(ORIGIN)) {
    const key = `${response.status()} ${response.url().slice(ORIGIN.length)}`;
    if (!localFailures.has(key)) localFailures.set(key, new Set());
    localFailures.get(key).add(current);
  }
});

for (const name of list) {
  current = name;
  try {
    await page.goto(`${ORIGIN}/${name === 'index.html' ? '' : name}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2500);
  } catch (err) {
    console.log(`  nav failed ${name}: ${err.message.split('\n')[0]}`);
  }
  scanned++;
  if (scanned % 20 === 0) console.log(`  ${scanned}/${list.length}`);
}

await browser.close();

console.log(`\nscanned ${scanned} pages`);
console.log(`requests to Weebly hosts: ${weeblyHits.size}`);
for (const [url, from] of [...weeblyHits].slice(0, 15)) {
  console.log(`  ${url}\n      from ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ` (+${from.size - 3})` : ''}`);
}
console.log(`local requests returning 4xx/5xx: ${localFailures.size}`);
for (const [key, from] of [...localFailures].slice(0, 15)) {
  console.log(`  ${key}\n      on ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ` (+${from.size - 3})` : ''}`);
}

const failed = weeblyHits.size > 0 || localFailures.size > 0;
console.log(failed ? '\nFAIL' : '\nno Weebly requests, no failing local requests');
process.exit(failed ? 1 : 0);
