/**
 * One-time: swap Weebly's UIkit slideset for assets/js/everark-carousel.js.
 *
 * Two pages carry a slideset, and each paid dearly for it: a platform-element
 * script that inlines UIkit 2.27.4 whole, plus a 71 KB settings blob, plus
 * forty authored slides of which only the first thirteen (homepage) and four
 * (features) are real — the rest say "Add Your Title" and were deleted by
 * JavaScript after the page had already shipped them to the browser, and to
 * the site's own search index.
 *
 * This script does three things, all by byte surgery on the source pages:
 *
 *   1. records the element's settings as data attributes on the wrapper,
 *   2. deletes the placeholder slides the widget would have deleted anyway,
 *   3. replaces the element script with a tag for the new carousel.
 *
 * Everything else — the wrapper, the slide markup, the four vendored
 * stylesheets, the arrows, the dot list — is left exactly as it was, because
 * the replacement is written against that markup rather than around it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/refs.mjs';
import { pageFiles } from '../build/render.mjs';

const SCRIPT_OPEN = '<script type="text/javascript" class="element-script">';
const WRAPPER_OPEN = '<div class="boo-slideset-wrapper';
const CAROUSEL_TAG = '<script src="assets/js/everark-carousel.js" defer></script>';

/**
 * The element's settings arrive as one enormous JSON literal, most of it
 * `*_each` arrays the editor used to render its own form. Only these thirteen
 * values ever reached the widget, so only these are read — parsing the whole
 * blob to throw 99% of it away would be the slower and more fragile way round.
 */
function setting(body, key) {
  const m = body.match(new RegExp(`"${key}":(true|false|"[^"]*"|-?\\d+(?:\\.\\d+)?)`));
  if (!m) return null;
  return m[1].startsWith('"') ? m[1].slice(1, -1) : m[1];
}

/** data-* attributes, in the order they read best in the markup. */
function attributesFor(body) {
  const perView = {
    'per-view': setting(body, 'noc_large'),
    'per-view-xlarge': setting(body, 'noc_large'),
    'per-view-large': setting(body, 'noc_medium'),
    'per-view-medium': setting(body, 'noc_small'),
    'per-view-small': setting(body, 'noc_extra_small'),
  };
  const attrs = {
    'everark-carousel': '',
    total: setting(body, 'total'),
    animation: setting(body, 'animation'),
    duration: setting(body, 'animation_duration'),
    delay: setting(body, 'animation_delay'),
    autoplay: setting(body, 'autoplay'),
    'autoplay-interval': setting(body, 'animation_speed'),
    'pause-on-hover': setting(body, 'pause_on_hover'),
    'filter-tags': setting(body, 'array_filter_tags'),
    alphabetical: setting(body, 'alphabetical_order'),
    ...perView,
  };

  return Object.entries(attrs)
    .filter(([, value]) => value !== null)
    .map(([name, value]) => (name === 'everark-carousel' ? ' data-everark-carousel' : ` data-${name}="${value}"`))
    .join('');
}

/**
 * Drop the slides the widget removed at runtime.
 *
 * Bounded by the authoring comments rather than by counting `</div>`s. The
 * slide bodies nest six deep and the export's markup is not reliably
 * balanced; a brace-counting version of this got the homepage wrong by 180 px
 * once already.
 */
function dropPlaceholderSlides(html, total) {
  let out = html;
  let dropped = 0;
  for (let slide = Number(total) + 1; slide <= 40; slide++) {
    const start = out.indexOf(`<!-- Begin Slideset ${slide} -->`);
    const endMarker = `<!-- End Slideset ${slide} -->`;
    const end = out.indexOf(endMarker, start);
    if (start < 0 || end < 0) continue;
    // Take the indentation before the opening comment with it, so the
    // surviving markup keeps its shape.
    let from = start;
    while (from > 0 && (out[from - 1] === '\t' || out[from - 1] === ' ')) from--;
    out = out.slice(0, from) + out.slice(end + endMarker.length + 1);
    dropped++;
  }
  return { html: out, dropped };
}

let changed = 0;

for (const name of pageFiles()) {
  const file = path.join(ROOT, 'src/pages', name);
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes(WRAPPER_OPEN)) continue;
  // Idempotent, like every other step here: a page already carrying the
  // carousel has no element script left to find, and re-running should be a
  // no-op rather than an error.
  if (original.includes('data-everark-carousel')) {
    console.log(`  ${name}: already replaced`);
    continue;
  }

  // Find the element script by what it defines, not by where it sits: a page
  // carries up to 28 of these and they are otherwise identical boilerplate.
  let scriptStart = -1;
  let scriptEnd = -1;
  for (let at = original.indexOf(SCRIPT_OPEN); at >= 0; at = original.indexOf(SCRIPT_OPEN, at + 1)) {
    // The first `</script>` really is the end — a script that contained the
    // literal string would have been terminated there by the HTML parser too.
    const end = original.indexOf('</script>', at) + '</script>'.length;
    if (!/var\s+booslideset\s*=/.test(original.slice(at, end))) continue;
    scriptStart = at;
    scriptEnd = end;
    break;
  }
  if (scriptStart < 0) throw new Error(`${name}: slideset markup with no slideset element script`);

  const body = original.slice(scriptStart, scriptEnd);
  const total = setting(body, 'total');
  if (total === null) throw new Error(`${name}: slideset element has no total setting`);

  const wrapperStart = original.lastIndexOf(WRAPPER_OPEN, scriptStart);
  const wrapperEnd = original.indexOf('>', wrapperStart);
  if (wrapperStart < 0) throw new Error(`${name}: slideset element script with no wrapper before it`);

  let html =
    original.slice(0, wrapperEnd) +
    attributesFor(body) +
    original.slice(wrapperEnd, scriptStart) +
    CAROUSEL_TAG +
    original.slice(scriptEnd);

  const trimmed = dropPlaceholderSlides(html, total);
  html = trimmed.html;

  fs.writeFileSync(file, html);
  changed++;
  const saved = original.length - html.length;
  console.log(
    `  ${name}: ${trimmed.dropped} placeholder slides dropped, ` +
      `${(saved / 1024).toFixed(0)} KB smaller`,
  );
}

console.log(`slideset replaced on ${changed} page${changed === 1 ? '' : 's'}`);
