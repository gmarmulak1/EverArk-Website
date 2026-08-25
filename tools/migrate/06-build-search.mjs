/**
 * Step 6 — build the search index and the results page.
 *
 * The index is derived from the pages themselves on every build, so it cannot
 * drift from the content. Only the body region is indexed: including the
 * header and footer would make every page match every query, since the same
 * navigation and mega-menu markup appears on all 139 of them.
 *
 * search.html is generated from an existing page so it inherits the exact
 * header, navigation and footer markup rather than an approximation of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pages, readPage } from '../lib/refs.mjs';

/** Pages that are chrome, redirects or fragments rather than real content. */
const EXCLUDE = new Set([
  '404.html',
  '500-server-error.html',
  'search.html',
  'thank-you.html',
  '_______________________.html',
  '_______________________1.html',
]);

function textOf(html) {
  const start = html.indexOf('<div id="wsite-content"');
  const end = html.indexOf('<div id="footer-wrap"');
  const body = start === -1 ? html : html.slice(start, end === -1 ? undefined : end);
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8203;|&#65279;/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : '';
}

const index = [];
for (const name of pages()) {
  if (EXCLUDE.has(name)) continue;
  const html = readPage(name);
  const text = textOf(html);
  if (text.length < 120) continue; // placeholder pages with no real content
  index.push({
    url: name,
    title: attr(html, /<title>([\s\S]*?)<\/title>/i) || name.replace(/\.html$/, ''),
    description: attr(html, /<meta name="description" content="([^"]*)"/i),
    text: text.slice(0, 12000),
  });
}

fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'assets/search-index.json'), JSON.stringify(index));
const kb = (fs.statSync(path.join(ROOT, 'assets/search-index.json')).size / 1024).toFixed(0);
console.log(`indexed ${index.length} pages (${kb} KB)`);

// ------------------------------------------------------------ search.html
const TEMPLATE = 'resources.html';
const template = readPage(TEMPLATE);

// The site's h2 is 40px, which is right for a page heading and far too heavy
// for a list of results. This is the one page with no prior appearance to
// preserve, so it gets sizing of its own - built from the same typography.
const RESULTS_STYLE = `
<style>
	#everark-search-results .everark-search-result { margin: 0 0 28px; }
	#everark-search-results .wsite-content-title { font-size: 22px !important; line-height: 1.3 !important; margin: 0 0 6px !important; text-transform: none !important; }
	#everark-search-results .paragraph { font-size: 15px !important; line-height: 1.6 !important; }
	#everark-search-summary { margin-bottom: 24px; font-size: 15px !important; }
</style>`;

const RESULTS_UI = RESULTS_STYLE + `
<div class="wsite-spacer" style="height:40px;"></div>
<h2 class="wsite-content-title">Search</h2>
<form id="everark-search-page-form" action="search.html" method="get" style="margin-bottom:20px;">
\t<div class="wsite-form-field" style="margin:5px 0;">
\t\t<div class="wsite-form-input-container">
\t\t\t<input type="text" id="everark-search-input" name="q" class="wsite-form-input wsite-input wsite-input-width-370px" placeholder="Search everark.io" />
\t\t</div>
\t</div>
</form>
<div class="paragraph" id="everark-search-summary"></div>
<div id="everark-search-results"></div>
<div class="wsite-spacer" style="height:60px;"></div>
`;

const contentStart = template.indexOf('<div id="wsite-content"');
const contentEnd = template.indexOf('<div id="footer-wrap"');
if (contentStart === -1 || contentEnd === -1) {
  throw new Error(`cannot locate the content region in ${TEMPLATE}`);
}

const region = template.slice(contentStart, contentEnd);
// The template page's body section is empty; drop the results UI into it.
const filled = region.replace(
  /(<div class="wsite-section-elements">)(\s*)(<\/div>)/,
  (whole, open, gap, close) => `${open}${RESULTS_UI}${close}`,
);
if (filled === region) throw new Error(`no empty section found in ${TEMPLATE} to host results`);

let search = template.slice(0, contentStart) + filled + template.slice(contentEnd);
search = search
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Search - EVERARK</title>')
  .replace(
    /<meta name="description" content="[^"]*"\s*\/?>/i,
    '<meta name="description" content="Search the EverArk site." />',
  )
  .replace(/<meta name="robots"[^>]*>/gi, '')
  .replace(/<\/head>/i, '\t\t<meta name="robots" content="noindex" />\n\t</head>')
  .replace(
    /<\/body>/i,
    '\t<script src="assets/js/everark-search.js"></script>\n\t</body>',
  );

fs.writeFileSync(path.join(ROOT, 'search.html'), search);
console.log(`wrote search.html from ${TEMPLATE}`);
