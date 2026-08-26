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
    appReady: document.documentElement.appReady,
    megaMenus: document.querySelectorAll('.codo-mega-menu-style').length,
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
  check('platform elements initialise (appReady fired)', nav.appReady === 1, String(nav.appReady));
  check('the mega-menu element is present on the page', nav.megaMenus === 9, String(nav.megaMenus));

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
  check('a complete form submits to the confirmation page', /form-thank-you/.test(page.url()), page.url());
  await page.close();
}

// -------------------------------------------------------------- carousel
{
  // Two instances, and the checks are split between them on purpose.
  //
  // The features tour has autoplay off and its bullets on, so it is the one
  // that can be driven deterministically — a homepage click sequence would be
  // racing a five-second autoplay timer, and its bullets are hidden by the
  // theme, so Playwright will not click them.
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.goto(`${ORIGIN}/cemetery-software-features.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  const state = () =>
    page.evaluate(() => {
      const wrap = document.querySelector('[data-everark-carousel]');
      const items = [...wrap.querySelector('ul.uk-slideset').children];
      const nav = wrap.querySelector('ul.uk-slideset-nav');
      return {
        items: items.length,
        total: Number(wrap.dataset.total),
        shown: items.filter((li) => getComputedStyle(li).display !== 'none').map((li) => li.dataset.item),
        dots: nav.children.length,
        activeDot: [...nav.children].findIndex((d) => d.classList.contains('uk-active')),
        bodyOverflowX: document.body.style.overflowX,
        minHeight: wrap.style.minHeight,
      };
    });

  const click = async (selector) => {
    await page.click(selector);
    await page.waitForTimeout(1400);
    return state();
  };

  check('carousel page raises no JS errors', errors.length === 0, errors[0] || '');

  const start = await state();
  check(
    'the markup carries exactly the slides that are configured',
    start.items === start.total && start.items === 4,
    JSON.stringify({ items: start.items, total: start.total }),
  );
  check(
    'one slide shows at a time, with a dot each',
    start.shown.join(',') === '0' && start.dots === 4 && start.activeDot === 0,
    JSON.stringify(start),
  );

  const next = await click('[data-uk-slideset-item="next"]');
  check('next advances one set', next.shown.join(',') === '1' && next.activeDot === 1, JSON.stringify(next));

  const back = await click('[data-uk-slideset-item="previous"]');
  check('previous returns to the set before', back.shown.join(',') === '0' && back.activeDot === 0, JSON.stringify(back));

  const wrapped = await click('[data-uk-slideset-item="previous"]');
  check('previous from the first set wraps to the last', wrapped.shown.join(',') === '3' && wrapped.activeDot === 3, JSON.stringify(wrapped));

  const jumped = await click('ul.uk-slideset-nav > li:nth-child(2)');
  check('a bullet jumps straight to its set', jumped.shown.join(',') === '1' && jumped.activeDot === 1, JSON.stringify(jumped));

  check(
    'a finished transition leaves nothing pinned',
    jumped.bodyOverflowX === '' && jumped.minHeight === '',
    JSON.stringify({ overflowX: jumped.bodyOverflowX, minHeight: jumped.minHeight }),
  );

  const runtime = await page.evaluate(() => ({
    uikit: typeof window.UIkit2,
    inlineSlideset: [...document.querySelectorAll('script:not([src])')].some((s) => /uk\.slideset|UIkit 2\./.test(s.textContent)),
  }));
  check(
    'no UIkit is loaded or inlined any more',
    runtime.uikit === 'undefined' && !runtime.inlineSlideset,
    JSON.stringify(runtime),
  );
  await page.close();
}

{
  // The homepage strip is the responsive one, and it is hidden above 960px by
  // the FlexiBox around it — so everything here runs at tablet width. Loading
  // at a width and resizing to it are different code paths: the set size
  // follows the breakpoint, so the dot list has to shrink as well as grow.
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2000);

  const state = () =>
    page.evaluate(() => {
      const wrap = document.querySelector('[data-everark-carousel]');
      const items = [...wrap.querySelector('ul.uk-slideset').children];
      const nav = wrap.querySelector('ul.uk-slideset-nav');
      return {
        items: items.length,
        total: Number(wrap.dataset.total),
        shown: items.filter((li) => getComputedStyle(li).display !== 'none').length,
        dots: nav.children.length,
        activeDot: [...nav.children].findIndex((d) => d.classList.contains('uk-active')),
        left: wrap.style.left,
      };
    });

  check('home page raises no carousel errors', errors.length === 0, errors[0] || '');

  const tablet = await state();
  check(
    'thirteen slides become two per set and seven dots at tablet width',
    tablet.items === 13 && tablet.total === 13 && tablet.shown === 2 && tablet.dots === 7,
    JSON.stringify(tablet),
  );

  // Autoplay is on with a five second interval; watch one turn of it.
  const before = (await state()).activeDot;
  await page.waitForTimeout(6500);
  const later = await state();
  check('autoplay advances on its own', later.activeDot !== before, `dot ${before} -> ${later.activeDot}`);

  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(1200);
  const narrow = await state();
  check(
    'resizing narrower rebuilds the dots for the new set size',
    narrow.dots === 13 && narrow.shown === 1,
    JSON.stringify(narrow),
  );

  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(1200);
  const wide = await state();
  check(
    'resizing back restores the wider sets',
    wide.dots === 7 && wide.shown === 2,
    JSON.stringify(wide),
  );
  await page.close();
}

// ---------------------------------------------------- no Weebly at runtime
// Phase 1's bar is that nothing is fetched from Weebly and nothing calls a
// Weebly service - not that main.js is gone. It still runs, from this repo,
// because it hosts the page's marketplace widgets. See MIGRATION.md.
{
  const page = await context.newPage();
  const weeblyRequests = [];
  page.on('request', (r) => {
    if (/(editmysite|weebly)\.com|\/apps\/|formSubmit\.php|ajax\/api\/JsonRPC/.test(r.url()) && !r.url().includes('/assets/vendor/')) {
      weeblyRequests.push(r.url());
    }
  });
  const failures = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes(ORIGIN)) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  check('no request goes to a Weebly host or service', weeblyRequests.length === 0, weeblyRequests.slice(0, 3).join(', '));
  check('no local request 404s', failures.length === 0, failures.slice(0, 3).join(', '));

  const markup = await page.evaluate(() => ({
    remoteWeebly: [...document.querySelectorAll('[src],[href]')]
      .map((e) => e.getAttribute('src') || e.getAttribute('href'))
      .filter((u) => u && /^(https?:)?\/\/[^/]*(editmysite|weebly)\.com/.test(u)),
  }));
  check('no markup still points at a Weebly host', markup.remoteWeebly.length === 0, markup.remoteWeebly.slice(0, 3).join(', '));
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
