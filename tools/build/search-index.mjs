/**
 * Build assets/search-index.json from the pages themselves, so the index can
 * never drift from the content.
 *
 * Only the body region is indexed. Including the header and footer would make
 * every page match every query, since the same navigation and mega-menu markup
 * appears on all of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pages, readPage } from '../lib/refs.mjs';

/** Chrome, redirects and fragments rather than real content. */
const EXCLUDE = new Set([
  '404.html',
  '500-server-error.html',
  'search.html',
  'thank-you.html',
  'form-thank-you.html',
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

const attr = (html, re) => (html.match(re) || [, ''])[1].trim();

export function buildSearchIndex() {
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
  return index.length;
}

if (import.meta.filename === process.argv[1]) {
  const n = buildSearchIndex();
  const kb = (fs.statSync(path.join(ROOT, 'assets/search-index.json')).size / 1024).toFixed(0);
  console.log(`search index: ${n} pages (${kb} KB)`);
}
