/**
 * Take a built page apart, and put it back together.
 *
 * decompose() and compose() are inverses, and tools/verify/roundtrip.mjs holds
 * them to it: every page must rebuild to the exact bytes it was extracted
 * from. That is what makes it safe to move 13 MB of duplicated chrome into
 * shared templates — the proof is mechanical rather than a careful reading.
 */
import { headOf, activeNavIdOf, headerBoundsOf, ACTIVE_NAV_TOKEN } from './decompose.mjs';

const HEADER_START = '<div id="wrapper_header">';
const FOOTER_START = '<div id="footer-wrap">';
const TAIL_START = '<!-- JavaScript -->';

/** Front matter is a leading HTML comment, so pages stay valid HTML on disk. */
const FM_OPEN = '<!--everark\n';
const FM_CLOSE = '\n-->\n';

export function readFrontMatter(text) {
  if (!text.startsWith(FM_OPEN)) throw new Error('page is missing its front matter block');
  const end = text.indexOf(FM_CLOSE);
  if (end < 0) throw new Error('page front matter is not terminated');
  return {
    data: JSON.parse(text.slice(FM_OPEN.length, end)),
    body: text.slice(end + FM_CLOSE.length),
  };
}

export function writeFrontMatter(data, body) {
  return FM_OPEN + JSON.stringify(data, null, 2) + FM_CLOSE + body;
}

/**
 * The current page is marked in the navigation two ways depending on where it
 * sits: a top-level item becomes id="active", a submenu item gains the
 * wsite-nav-current class. Both are keyed off ids that are recorded per page
 * rather than re-derived from hrefs, so applying them is exact. This is what
 * turns 24 near-identical navigation copies into one template.
 */
export function applyActiveNav(header, { activeNavId, currentSubnavId }) {
  let out = header;
  if (activeNavId) {
    out = out
      .split(`<li id="pg${activeNavId}" class="wsite-menu-item-wrap">`)
      .join('<li id="active" class="wsite-menu-item-wrap">');
  }
  if (currentSubnavId) {
    out = out
      .split(`<li id="${currentSubnavId}"\n\tclass="wsite-menu-subitem-wrap "`)
      .join(`<li id="${currentSubnavId}"\n\tclass="wsite-menu-subitem-wrap wsite-nav-current"`);
  }
  return out;
}

export function neutraliseActiveNav(header, activeNavId) {
  const current = header.match(/<li id="(wsite-nav-\d+)"\n\tclass="wsite-menu-subitem-wrap wsite-nav-current"/);
  const neutral = header
    .split('<li id="active" class="wsite-menu-item-wrap">')
    .join(`<li id="pg${activeNavId}" class="wsite-menu-item-wrap">`)
    .split('class="wsite-menu-subitem-wrap wsite-nav-current"')
    .join('class="wsite-menu-subitem-wrap "');
  return { neutral, currentSubnavId: current ? current[1] : undefined };
}

/** Split one built page into per-page data plus the regions it shares. */
export function decompose(html, name, headParts) {
  const slug = name.replace(/\.html$/, '');
  const htmlOpen = html.slice(0, html.indexOf('>', html.indexOf('<html')) + 1);
  const afterHead = html.indexOf('</head>');
  const bodyOpen = html.slice(afterHead + '</head>'.length, html.indexOf(HEADER_START));
  const [hStart, hEnd] = headerBoundsOf(html);
  const header = html.slice(hStart, hEnd);
  const footerAt = html.indexOf(FOOTER_START);
  const tailAt = html.indexOf(TAIL_START);
  const activeNavId = activeNavIdOf(html);

  const bodyClassMatch = bodyOpen.match(/<body class="([^"]*)"/);
  const bodyClass = bodyClassMatch ? bodyClassMatch[1] : '';
  const { neutral, currentSubnavId } = neutraliseActiveNav(header, activeNavId);

  return {
    data: {
      slug,
      title: (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1],
      description: (headParts.pre.match(/<meta name="description" content="([^"]*)"/) || [, null])[1],
      keywords: (headParts.pre.match(/<meta name="keywords" content="([^"]*)"/) || [, null])[1],
      schemaWebpage: /itemscope/.test(htmlOpen),
      activeNavId,
      currentSubnavId,
      bodyClass: bodyClass.replace(new RegExp(`wsite-page-${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`), 'wsite-page-{slug}'),
      robots: headParts.robots || undefined,
      canonical: headParts.canonical,
    },
    // Regions kept verbatim for now; the SEO step replaces `social` with
    // generated tags, and the article step replaces `content` with Markdown.
    social: headParts.social,
    bodyOpen: bodyOpen.replace(`class="${bodyClass}"`, 'class="{{bodyClass}}"'),
    header: neutral,
    content: html.slice(hEnd, footerAt),
    footer: html.slice(footerAt, tailAt),
    tail: html.slice(tailAt),
  };
}
