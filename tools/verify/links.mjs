/**
 * Check that every local reference resolves.
 *
 * The export shipped with 731 broken image paths and nine broken script paths,
 * which is exactly the kind of rot that is invisible until someone loads the
 * page. This is the cheap, offline guard against it coming back: it walks every
 * href, src and url() in every page - including the ones hidden in inline
 * styles and &quot;-escaped background rules - and reports anything with no
 * file behind it.
 *
 * External URLs are listed by host but not fetched; that is a network check,
 * not a repository check.
 */
import { pages, readPage, localRefs, exists } from '../lib/refs.mjs';

const refs = localRefs();
const missing = [...refs.entries()].filter(([target]) => !exists(target));

console.log(`${refs.size} distinct local references across ${pages().length} pages`);

if (missing.length) {
  console.log(`\n${missing.length} do not resolve:`);
  for (const [target, usedBy] of missing.slice(0, 40)) {
    const where = [...usedBy].slice(0, 3).join(', ');
    console.log(`  ${target}\n      used by ${where}${usedBy.size > 3 ? ` (+${usedBy.size - 3} more)` : ''}`);
  }
}

// Internal page-to-page links deserve their own line: a broken image is a
// blemish, a broken link is a dead end.
const brokenPageLinks = missing.filter(([t]) => t.endsWith('.html'));
console.log(`\nbroken page links: ${brokenPageLinks.length}`);

/**
 * Anything still pointing at Weebly is a migration miss - except two base
 * paths that survive inside JavaScript string literals rather than markup:
 *
 *   ASSETS_BASE  - Weebly's webpack publicPath, used only to lazy-load chunks
 *                  this site never reaches (and it builds a malformed URL
 *                  anyway: "https://" + "//cdn11.editmysite.com/" + "/js/").
 *   assets_path  - each platform element's own asset base.
 *
 * Neither is rewritable safely: only four of the twelve element asset
 * directories exist upstream to vendor, so pointing them locally would swap a
 * dead reference for a 404. tools/verify/requests.mjs is the check that
 * matters here - it loads every page and proves neither ever becomes a real
 * request. They go when main.js goes, in Phase 2.
 */
const INERT = [/var ASSETS_BASE/, /prototype\.assets_path/];

const weebly = new Map();
for (const name of pages()) {
  const html = readPage(name);
  for (const m of html.matchAll(/["'](?:https?:)?\/\/([^/"']*(?:editmysite|weebly)\.com)[^"']*["']/g)) {
    const context = html.slice(Math.max(0, m.index - 60), m.index);
    if (INERT.some((re) => re.test(context))) continue;
    if (!weebly.has(m[1])) weebly.set(m[1], new Set());
    weebly.get(m[1]).add(name);
  }
}
console.log(`live markup references to Weebly hosts: ${weebly.size}`);
for (const [host, from] of weebly) {
  console.log(`  ${host} — ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ` (+${from.size - 3})` : ''}`);
}

const failed = missing.length > 0 || weebly.size > 0;
console.log(failed ? '\nFAIL' : '\nall local references resolve, nothing live points at Weebly');
process.exit(failed ? 1 : 0);
