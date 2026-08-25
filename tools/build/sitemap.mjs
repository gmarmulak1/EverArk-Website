/**
 * Generate sitemap.xml and robots.txt from the pages that exist.
 *
 * SITE_ORIGIN overrides the canonical host, which is what a preview deploy or
 * a domain change needs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pages } from '../lib/refs.mjs';

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.everark.io';

/** Utility and error pages that should not be advertised. */
const SKIP = new Set([
  '404.html',
  '500-server-error.html',
  'search.html',
  'form-thank-you.html',
  'thank-you.html',
  '_______________________.html',
  '_______________________1.html',
]);

export function buildSitemap() {
  const urls = pages()
    .filter((p) => !SKIP.has(p))
    .map((p) => (p === 'index.html' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${p}`));

  fs.writeFileSync(
    path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `\t<url><loc>${u}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );

  fs.writeFileSync(
    path.join(ROOT, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /_archive/\nDisallow: /search.html\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  );
  return urls.length;
}

if (import.meta.filename === process.argv[1]) {
  console.log(`sitemap.xml: ${buildSitemap()} urls, robots.txt written`);
}
