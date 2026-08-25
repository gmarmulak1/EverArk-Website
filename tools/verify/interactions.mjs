/**
 * Behavioural checks for the pieces that replaced Weebly's runtime.
 *
 * The pixel diff proves nothing moved; this proves the things that were
 * broken now work. Run against the local build: node tools/verify/interactions.mjs
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT || 8080}`;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Third-party widgets are unreachable from CI and irrelevant to these checks.
await context.route('**/*', (route) =>
  /googletagmanager|termly|getgobot|rlets|marketingautomation|app-us1|lfeeder|elfsight|calendly/.test(
    route.request().url(),
  )
    ? route.abort()
    : route.continue(),
);

async function open(path) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  return { page, errors };
}

// ------------------------------------------------------------- navigation
{
  const { page, errors } = await open('/');
  check('home page raises no JS errors', errors.length === 0, errors[0] || '');

  const nav = await page.evaluate(() => ({
    hostExists: !!document.getElementById('wsite-menus'),
    relocated: document.querySelectorAll('#wsite-menus > .wsite-menu-wrap').length,
    relocatedTotal: document.querySelectorAll('#wsite-menus .wsite-menu-wrap').length,
    leftInDesktopNav: document.querySelectorAll('.menu-hidden .wsite-menu-wrap').length,
    desktopCarets: document.querySelectorAll('.menu-hidden .icon-caret').length,
    mobileSubmenus: document.querySelectorAll('.mobile-nav .wsite-menu-wrap').length,
    mobileCarets: document.querySelectorAll('.mobile-nav .icon-caret').length,
    topLevel: document.querySelectorAll('.menu-hidden .wsite-menu-default > li').length,
    sticky: !!document.querySelector('.sticky-wrapper'),
    toTop: !!document.getElementById('toTop'),
  }));
  // Four top-level submenus move; the fifth is nested inside one of them and
  // travels with its parent. This matches what Weebly's runtime produced.
  check(
    'submenus relocated out of the desktop nav',
    nav.relocated === 4 && nav.relocatedTotal === 5 && nav.leftInDesktopNav === 0,
    JSON.stringify(nav),
  );
  check('desktop nav shows no carets', nav.desktopCarets === 0);
  check('mobile nav keeps its 5 accordion submenus', nav.mobileSubmenus === 5 && nav.mobileCarets === 5);
  check('9 top-level nav items', nav.topLevel === 9);
  check('theme sticky header and back-to-top still initialise', nav.sticky && nav.toTop);

  const logo = await page.getAttribute('.wsite-logo a', 'href');
  check('logo links home', logo === 'index.html', String(logo));
  await page.close();
}

// ---------------------------------------------------------------- search
{
  const { page } = await open('/');
  await page.fill('#wsite-header-search-form .wsite-search-input', 'green burial');
  await page.press('#wsite-header-search-form .wsite-search-input', 'Enter');
  await page.waitForURL(/search\.html\?q=/, { timeout: 15000 }).catch(() => {});
  check('header search navigates to the results page', /search\.html\?q=green\+burial/.test(page.url()), page.url());
  await page.waitForTimeout(2500);
  const count = await page.evaluate(() => document.querySelectorAll('.everark-search-result').length);
  check('search returns results', count > 0, `${count} results`);
  await page.close();
}

{
  const { page } = await open('/search.html?q=zzzzqqqnothing');
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.getElementById('everark-search-summary').textContent);
  check('search reports no matches gracefully', /No results/.test(text), text);
  await page.close();
}

// ----------------------------------------------------------------- forms
{
  const { page, errors } = await open('/cemetery-software-get-started-videos.html');
  check('form page raises no JS errors', errors.length === 0, errors[0] || '');

  await page.click('form[data-everark-form] a.wsite-button');
  await page.waitForTimeout(400);
  const invalid = await page.evaluate(() => ({
    flagged: document.querySelectorAll('form[data-everark-form] .form-input-error').length,
    stillHere: window.location.pathname.includes('get-started-videos'),
  }));
  check('empty submit is blocked and flags every required field', invalid.flagged === 4 && invalid.stillHere, JSON.stringify(invalid));

  await page.fill('input[name="first-name"]', 'Ada');
  await page.fill('input[name="last-name"]', 'Lovelace');
  await page.fill('input[name="email"]', 'not-an-email');
  await page.fill('textarea[name="describe-the-training-video"]', 'A walkthrough of plot mapping.');
  await page.click('form[data-everark-form] a.wsite-button');
  await page.waitForTimeout(400);
  const emailBad = await page.evaluate(
    () => document.querySelector('input[name="email"]').classList.contains('form-input-error'),
  );
  check('an invalid email is rejected', emailBad === true);

  await page.fill('input[name="email"]', 'ada@example.com');
  await page.click('form[data-everark-form] a.wsite-button');
  await page.waitForTimeout(1200);
  check('a complete form submits', /thank-you/.test(page.url()) || page.url().includes('get-started-videos') === false, page.url());
  await page.close();
}

// ------------------------------------------------------------- no weebly
{
  const { page } = await open('/');
  const leftovers = await page.evaluate(() => ({
    weeblyScripts: [...document.scripts]
      .map((s) => s.src)
      .filter((s) => /editmysite\.com\/js\/site\/main|templateArtifacts|stl\.js/.test(s)),
    remoteWeebly: [...document.querySelectorAll('[src],[href]')]
      .map((e) => e.getAttribute('src') || e.getAttribute('href'))
      .filter((u) => u && /^(https?:)?\/\/[^/]*(editmysite|weebly)\.com/.test(u)),
  }));
  check('no Weebly runtime scripts remain', leftovers.weeblyScripts.length === 0, leftovers.weeblyScripts.join(', '));
  check('no page asset still loads from a Weebly host', leftovers.remoteWeebly.length === 0, leftovers.remoteWeebly.slice(0, 3).join(', '));
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
