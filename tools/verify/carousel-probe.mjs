/**
 * Record what the carousel actually does, in the browser, as numbers.
 *
 * Replacing a widget whose only specification is 69 KB of minified UIkit is
 * not a reading exercise — the questions that matter (how many slides show at
 * 900px? what are their exact widths? how long until autoplay advances?) are
 * only answerable by running it. This writes that answer to JSON so the
 * before and after can be compared field by field rather than by eye.
 *
 *   node tools/verify/carousel-probe.mjs before
 *   node tools/verify/carousel-probe.mjs after
 *   node tools/verify/carousel-probe.mjs --diff before after
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../lib/refs.mjs';

const OUT_DIR = path.join(ROOT, 'tools/verify/report');
const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT || 8080}`;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** The two pages that carry a slideset, and the widths that change its layout. */
const PAGES = ['/', '/cemetery-software-features.html'];
const WIDTHS = [1440, 1000, 900, 800, 600, 390];

if (process.argv[2] === '--diff') {
  const [a, b] = process.argv.slice(3);
  const load = (n) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `carousel-${n}.json`), 'utf8'));
  diff(load(a), load(b), a, b);
  process.exit(0);
}

const LABEL = process.argv[2];
if (!LABEL) {
  console.error('usage: carousel-probe.mjs <label> | --diff <a> <b>');
  process.exit(1);
}

/**
 * Runs in the page. Everything it reports is measured from the live DOM: no
 * assumption about which implementation put it there, so the same probe reads
 * the UIkit original and the replacement identically.
 */
const MEASURE = () => {
  const round = (n) => Math.round(n * 100) / 100;
  const out = [];
  for (const wrap of document.querySelectorAll('.boo-slideset-wrapper')) {
    const list = wrap.querySelector('ul.uk-slideset');
    const nav = wrap.querySelector('ul.uk-slideset-nav');
    if (!list) continue;
    const items = [...list.children];
    const shown = items.filter((li) => getComputedStyle(li).display !== 'none');
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { w: round(r.width), h: round(r.height), x: round(r.left), y: round(r.top + window.scrollY) };
    };
    out.push({
      element: wrap.closest('[id^="element-"]')?.id || null,
      // The transition clamps the body's horizontal overflow while both sets
      // are in flight. If a run ever leaves it clamped, or toggles it on a
      // timer, that is a whole-page side effect and belongs in the report.
      bodyOverflowX: document.body.style.overflowX,
      rendered: wrap.offsetParent !== null,
      wrapper: {
        ...box(wrap),
        paddingBottom: getComputedStyle(wrap).paddingBottom,
        position: getComputedStyle(wrap).position,
        left: wrap.style.left || '',
        width: wrap.style.width || '',
      },
      list: { classes: list.className.split(/\s+/).sort().join(' '), ...box(list) },
      itemCount: items.length,
      visibleCount: shown.length,
      activeIndexes: items.map((li, i) => (li.classList.contains('uk-active') ? i : -1)).filter((i) => i >= 0),
      visible: shown.map((li) => ({ item: li.dataset.item ?? null, ...box(li) })),
      dots: nav ? nav.children.length : 0,
      activeDot: nav ? [...nav.children].findIndex((d) => d.classList.contains('uk-active')) : -1,
      dotsHidden: nav ? nav.classList.contains('uk-invisible') : null,
      arrows: [...wrap.querySelectorAll('[data-uk-slideset-item]')].map((a) => ({
        dir: a.getAttribute('data-uk-slideset-item'),
        visible: getComputedStyle(a).display !== 'none',
        ...box(a),
      })),
    });
  }
  return out;
};

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ deviceScaleFactor: 1 });
// Off-origin requests are aborted for the same reason as in capture.mjs: left
// to connect they exhaust the connection pool and the run stops progressing.
await context.route('**/*', (route) => {
  const url = route.request().url();
  const local = url.startsWith(ORIGIN) || url.startsWith('data:') || url === 'about:blank';
  return local ? route.continue() : route.abort();
});

const page = await context.newPage();
const report = {};

for (const slug of PAGES) {
  report[slug] = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(ORIGIN + slug, { waitUntil: 'load', timeout: 60000 });
    // The widget initialises off appReady and then lays itself out on the next
    // resize tick; give it both before reading anything.
    await page.waitForTimeout(1500);

    const initial = await page.evaluate(MEASURE);
    const entry = { initial };

    if (initial.length) {
      // Clicking next is the one interaction every variant of this widget has.
      await page.evaluate(() => {
        const a = document.querySelector('[data-uk-slideset-item="next"]');
        if (a) a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(1200);
      entry.afterNext = await page.evaluate(MEASURE);

      await page.evaluate(() => {
        const a = document.querySelector('[data-uk-slideset-item="previous"]');
        if (a) a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(1200);
      entry.afterPrevious = await page.evaluate(MEASURE);

      // Autoplay: watch the active dot for slightly longer than one interval.
      // Only at the widest viewport — it is a per-element setting, not a
      // per-breakpoint one, and the wait dominates the run.
      entry.autoplay = width !== WIDTHS[0] ? undefined : await page.evaluate(async () => {
        const nav = document.querySelector('ul.uk-slideset-nav');
        if (!nav) return null;
        const at = () => [...nav.children].findIndex((d) => d.classList.contains('uk-active'));
        const start = at();
        const t0 = performance.now();
        for (let i = 0; i < 130; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (at() !== start) return { advanced: true, afterMs: Math.round((performance.now() - t0) / 100) * 100 };
        }
        return { advanced: false, afterMs: null };
      });
    }
    report[slug][width] = entry;
    process.stdout.write(`  ${slug} @${width}: ${initial.length ? `${initial[0].visibleCount}/${initial[0].itemCount} visible, ${initial[0].dots} dots` : 'no carousel'}\n`);
  }

  // Resizing is not the same test as loading at a width. The set size changes
  // with the breakpoint, so the dot list has to be rebuilt rather than topped
  // up, and a carousel that only ever grows it looks right on every fresh
  // load and wrong the moment a window is dragged narrower.
  await page.setViewportSize({ width: WIDTHS[0], height: 900 });
  await page.goto(ORIGIN + slug, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  report[slug].resized = {};
  for (const width of WIDTHS.slice(1)) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(600);
    report[slug].resized[width] = await page.evaluate(MEASURE);
  }
  const dots = Object.entries(report[slug].resized)
    .map(([w, m]) => `${w}:${m.length ? m[0].dots : '-'}`)
    .join(' ');
  process.stdout.write(`  ${slug} after resize from ${WIDTHS[0]}: ${dots}\n`);
}

await browser.close();
fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, `carousel-${LABEL}.json`);
fs.writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`wrote ${path.relative(ROOT, file)}`);

/** Field-by-field comparison, with the geometry given a one-pixel tolerance. */
function diff(a, b, na, nb) {
  const problems = [];
  const walk = (x, y, trail) => {
    if (typeof x === 'number' && typeof y === 'number') {
      if (Math.abs(x - y) > 1) problems.push(`${trail}: ${na}=${x} ${nb}=${y}`);
      return;
    }
    if (x === null || y === null || typeof x !== 'object' || typeof y !== 'object') {
      if (JSON.stringify(x) !== JSON.stringify(y)) problems.push(`${trail}: ${na}=${JSON.stringify(x)} ${nb}=${JSON.stringify(y)}`);
      return;
    }
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) walk(x[k], y[k], trail ? `${trail}.${k}` : k);
  };
  walk(a, b, '');
  if (!problems.length) {
    console.log(`carousel behaviour identical between ${na} and ${nb}`);
    return;
  }
  console.log(`${problems.length} differences between ${na} and ${nb}:`);
  for (const p of problems.slice(0, 60)) console.log(`  ${p}`);
  if (problems.length > 60) console.log(`  ... and ${problems.length - 60} more`);
}
