/**
 * Image loading hints, applied at build time.
 *
 * Measured across eight representative pages: a large share of the images the
 * browser downloads render at 0px — mega-menu entries and off-screen carousel
 * slides, invisible on arrival but paid for on every page load. Deferring them
 * cuts the homepage from 119 images and 0.57 MB to 13 and 0.25 MB.
 *
 * Applying it to everything, though, breaks the homepage: the carousel sizes
 * itself from its slides, and with their images unloaded the active slide
 * collapsed to nothing but its arrows — 361px of the mobile page vanished.
 * Widgets that measure or clone their contents need their images present, so
 * this walks the markup and skips anything inside one.
 *
 * The scan exists to *decide*; the edit is made at the exact offset of the img
 * tag. Everything else in the page keeps its original bytes, which matters
 * because the export's markup is not well-formed enough to re-emit safely.
 */

/**
 * Containers whose JavaScript reads its own contents' dimensions, or reveals
 * them later by a route the lazy heuristic does not see.
 */
const WIDGET_CLASSES = [
  'boo-slideset',      // UIkit carousel — sizes itself from its slides
  'uk-slideset',
  'uk-slider',
  'hide-box',          // shows and hides per breakpoint
  'codo-mega-menu',    // revealed on hover, after layout
  'wsite-menu',        // the navigation's own submenus
];

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

/**
 * Walk tags, tracking the class attribute of each open element, and return the
 * offsets of <img> tags that are not inside a widget.
 *
 * Deliberately tolerant: the export has unclosed tags and stray end tags, so a
 * close that does not match anything open is ignored rather than trusted.
 */
function lazyCandidates(html) {
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  const stack = [];
  const found = [];
  let inWidget = 0;
  let m;

  while ((m = tag.exec(html)) !== null) {
    const [whole, closing, rawName, attrs] = m;
    const name = rawName.toLowerCase();

    if (closing) {
      const at = stack.map((e) => e.name).lastIndexOf(name);
      if (at === -1) continue; // stray end tag
      for (let i = stack.length - 1; i >= at; i--) if (stack[i].widget) inWidget--;
      stack.length = at;
      continue;
    }

    if (name === 'img') {
      if (!inWidget) found.push({ start: m.index, end: m.index + whole.length, attrs });
      continue;
    }
    if (VOID.has(name) || /\/\s*$/.test(attrs)) continue;

    const cls = (attrs.match(/\sclass\s*=\s*"([^"]*)"/i) || attrs.match(/\sclass\s*=\s*'([^']*)'/i) || [, ''])[1];
    const widget = cls ? WIDGET_CLASSES.some((w) => cls.includes(w)) : false;
    if (widget) inWidget++;
    stack.push({ name, widget });
  }
  return found;
}

function addHints(html) {
  const candidates = lazyCandidates(html);
  let out = '';
  let cursor = 0;
  for (const { start, end, attrs } of candidates) {
    out += html.slice(cursor, start);
    cursor = end;
    if (/\bloading\s*=/i.test(attrs) || /\bsrc\s*=\s*["']data:/i.test(attrs)) {
      out += html.slice(start, end);
      continue;
    }
    out += `<img${attrs.replace(/\s*\/\s*$/, '').replace(/\s+$/, '')} loading="lazy" decoding="async" />`;
  }
  return out + html.slice(cursor);
}

/**
 * Split at the end of the banner so the hero stays eager: deferring the first
 * thing on screen trades bandwidth for a slower render of the one image that
 * matters. Pages without a banner start at #main-container.
 */
export function withLoadingHints(content) {
  const mainAt = content.indexOf('<div id="main-container"');
  if (mainAt < 0) return addHints(content);
  return content.slice(0, mainAt) + addHints(content.slice(mainAt));
}
