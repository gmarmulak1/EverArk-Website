/**
 * Build a new page from an existing one.
 *
 * New pages (search results, the form confirmation) have to carry the same
 * header, navigation, mega-menu and footer as everything else. Hand-writing
 * that chrome would mean 100 KB of duplicated markup that drifts the first
 * time the real pages change, so instead an existing page is used as the
 * template and only its content region is replaced.
 *
 * resources.html is the natural donor: it is one of the nav placeholder pages,
 * so its body section is empty and there is nothing to strip out.
 *
 * Phase 2 replaces this with real layout templates; until then it keeps the
 * generated pages honest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readPage } from './refs.mjs';

const DONOR = 'resources.html';

export function buildPage({ file, title, description, content, scripts = [], noindex = false }) {
  const donor = readPage(DONOR);

  const start = donor.indexOf('<div id="wsite-content"');
  const end = donor.indexOf('<div id="footer-wrap"');
  if (start === -1 || end === -1) throw new Error(`cannot locate the content region in ${DONOR}`);

  const region = donor.slice(start, end);
  const filled = region.replace(
    /(<div class="wsite-section-elements">)\s*(<\/div>)/,
    (whole, open, close) => `${open}${content}${close}`,
  );
  if (filled === region) throw new Error(`no empty section in ${DONOR} to host content`);

  let html = donor.slice(0, start) + filled + donor.slice(end);
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/?>/i,
      `<meta name="description" content="${description}" />`,
    )
    .replace(/<link rel="canonical"[^>]*>\s*/i, '');

  if (noindex) {
    html = html.replace(/<meta name="robots"[^>]*>\s*/gi, '');
    html = html.replace(/<\/head>/i, '\t\t<meta name="robots" content="noindex" />\n\t</head>');
  }
  if (scripts.length) {
    const tags = scripts.map((s) => `\t<script src="${s}"></script>`).join('\n');
    html = html.replace(/<\/body>/i, `${tags}\n\t</body>`);
  }

  fs.writeFileSync(path.join(ROOT, file), html);
  return file;
}
