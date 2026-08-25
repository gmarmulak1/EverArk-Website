/**
 * Split a page into the parts that are shared with every other page and the
 * parts that are its own.
 *
 * The boundaries are computed, not guessed. Hand-picked anchors would be a
 * standing invitation for a page to drift out of the template unnoticed; here
 * the shared head block is grown character by character until the pages
 * actually disagree, and the build round-trips every page back to its
 * committed bytes, so a wrong split fails loudly instead of silently.
 */
import { pages, readPage } from '../../lib/refs.mjs';

/** Anchor that begins the shared region of <head> on all 141 pages. */
const HEAD_ANCHOR = '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />';

export const ACTIVE_NAV_TOKEN = '{{activeNavId}}';

export function headOf(html) {
  return html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
}

/** The page's own Weebly navigation id, which marks the current nav item. */
export function activeNavIdOf(html) {
  const m = html.match(/initPublishedFlyoutMenus\([\s\S]*?\],\s*"([^"]*)"/);
  return m ? m[1] : '';
}

/** Where the header region ends: the banner if there is one, else the content. */
export function headerBoundsOf(html) {
  const start = html.indexOf('<div id="wrapper_header">');
  const banner = html.indexOf('<div id="banner"');
  const main = html.indexOf('<div id="main-container"');
  const end = banner >= 0 && (main < 0 || banner < main) ? banner : main;
  return [start, end];
}

/**
 * Grow the shared head block outwards from the anchor until the pages diverge.
 * Returns { shared, pre, post } keyed by page name.
 */
export function splitHeads() {
  const names = pages();
  const normalised = new Map();

  for (const name of names) {
    const html = readPage(name);
    let head = headOf(html);
    // Replace only the current-page id argument, not every occurrence: the
    // same id also appears inside the menu JSON as one of the nav entries, and
    // blanking that would make the pages look different where they are not.
    head = head.replace(
      /(initPublishedFlyoutMenus\([\s\S]*?\],\s*)"[^"]*"/,
      `$1"${ACTIVE_NAV_TOKEN}"`,
    );
    normalised.set(name, head);
  }

  const anchors = new Map();
  for (const [name, head] of normalised) {
    const at = head.indexOf(HEAD_ANCHOR);
    if (at < 0) throw new Error(`${name}: head anchor not found`);
    anchors.set(name, at);
  }

  // Extend forwards from the anchor while every page still agrees.
  const first = names[0];
  const base = normalised.get(first);
  let length = base.length - anchors.get(first);
  for (const name of names.slice(1)) {
    const head = normalised.get(name);
    const at = anchors.get(name);
    let i = 0;
    while (i < length && at + i < head.length && base[anchors.get(first) + i] === head[at + i]) i++;
    length = i;
  }

  const sharedStart = anchors.get(first);
  const shared = base.slice(sharedStart, sharedStart + length);

  // The head also ends with a shared run — the chat widget and the favicon
  // links sit between the social tags and the canonical, and are the same
  // everywhere. Grow that one backwards from the end of the canonical tag.
  const remainders = new Map();
  for (const name of names) {
    const head = normalised.get(name);
    remainders.set(name, head.slice(anchors.get(name) + length));
  }
  /**
   * Peel the trailing per-page tags off: the canonical, and the robots
   * directive that only the two generated utility pages carry. Left in place
   * the robots tag would break the shared suffix for every other page.
   */
  const peel = (text) => {
    let rest = text;
    let canonical = '';
    let robots = '';
    const c = rest.match(/[ \t]*<link rel="canonical"[^>]*>\s*$/);
    if (c) {
      canonical = c[0];
      rest = rest.slice(0, c.index);
    }
    const r = rest.match(/[ \t]*<meta name="robots"[^>]*>\s*$/);
    if (r) {
      robots = r[0];
      rest = rest.slice(0, r.index);
    }
    return [rest, canonical, robots];
  };

  const trimmed = new Map();
  for (const [name, text] of remainders) trimmed.set(name, peel(text));

  const baseBody = trimmed.get(first)[0];
  let suffix = baseBody.length;
  for (const name of names.slice(1)) {
    const body = trimmed.get(name)[0];
    let i = 0;
    while (i < suffix && i < body.length && baseBody[baseBody.length - 1 - i] === body[body.length - 1 - i]) i++;
    suffix = i;
  }
  const sharedTail = baseBody.slice(baseBody.length - suffix);

  const parts = new Map();
  for (const name of names) {
    const head = normalised.get(name);
    const [body, canonical, robots] = trimmed.get(name);
    parts.set(name, {
      pre: head.slice(0, anchors.get(name)),
      social: body.slice(0, body.length - suffix),
      robots,
      canonical,
    });
  }
  return { shared, sharedTail, parts };
}
