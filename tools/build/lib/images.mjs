/**
 * Image loading hints, applied at build time.
 *
 * Measured across eight representative pages: of the images the browser
 * downloads, a large share render at 0px — they sit inside the mega-menu and
 * the hidden slider slides, invisible on arrival but paid for anyway. Marking
 * them lazy lets the browser skip them entirely until they are shown.
 *
 * Anything in the banner keeps loading eagerly: it is the first thing on
 * screen, and deferring it would trade bandwidth for a slower render of the
 * one image that matters.
 */

const IMG = /<img\b([^>]*?)\s*\/?>/gi;

function addHints(html) {
  return html.replace(IMG, (tag, attrs) => {
    if (/\bloading\s*=/i.test(attrs)) return tag;
    // data: URIs cost nothing to fetch and gain nothing from deferral.
    if (/\bsrc\s*=\s*["']data:/i.test(attrs)) return tag;
    const trimmed = attrs.replace(/\s+$/, '');
    return `<img${trimmed} loading="lazy" decoding="async" />`;
  });
}

/**
 * Split the page content at the end of the banner so the hero stays eager.
 * Pages without a banner start at #main-container, and everything below it
 * can be deferred.
 */
export function withLoadingHints(content) {
  const mainAt = content.indexOf('<div id="main-container"');
  if (mainAt < 0) return addHints(content);
  return content.slice(0, mainAt) + addHints(content.slice(mainAt));
}
