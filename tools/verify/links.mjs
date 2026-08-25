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

// Anything still pointing at Weebly is a migration miss, not a broken link.
const weebly = new Set();
for (const name of pages()) {
  for (const m of readPage(name).matchAll(/["'](?:https?:)?\/\/([^/"']*(?:editmysite|weebly)\.com)[^"']*["']/g)) {
    weebly.add(m[1]);
  }
}
console.log(`markup references to Weebly hosts: ${weebly.size}${weebly.size ? ` (${[...weebly].join(', ')})` : ''}`);

const failed = missing.length > 0 || weebly.size > 0;
console.log(failed ? '\nFAIL' : '\nall local references resolve, nothing points at Weebly');
process.exit(failed ? 1 : 0);
