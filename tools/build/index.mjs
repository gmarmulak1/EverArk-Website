/**
 * The site build.
 *
 * src/ is the source; the flat .html pages at the repository root, the search
 * index, the sitemap and robots.txt are all outputs. Everything here is
 * derived, so the build is safe to run at any time and is what CI and the host
 * run on deploy.
 *
 * tools/migrate/ is a different thing: the one-time conversion of the Weebly
 * export into this shape, kept for provenance. It is not part of the build.
 */
import { buildAll } from './render.mjs';
import { buildSearchIndex } from './search-index.mjs';
import { buildSitemap } from './sitemap.mjs';

const pagesBuilt = buildAll();
console.log(`pages        ${pagesBuilt.length}`);
console.log(`search index ${buildSearchIndex()} entries`);
console.log(`sitemap      ${buildSitemap()} urls`);
