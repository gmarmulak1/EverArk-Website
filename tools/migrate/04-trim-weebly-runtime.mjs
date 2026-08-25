/**
 * Step 4 — trim Weebly's runtime, but keep it.
 *
 * The obvious move is to delete main.js: 481 KB of Weebly, most of it dead
 * here. It is also the wrong move for Phase 1, and it took a full audit to see
 * why. Every one of the ~28 marketplace "platform elements" embedded in each
 * page is gated on an `appReady` event that only main.js dispatches, and one
 * of those elements is the site's mega-menu - the visible dropdown navigation,
 * on all 139 pages. Others draw SVG section dividers, size the full-width
 * hero, drive the feature tabs, the FAQ accordion and the carousel. Remove
 * main.js and they all silently never run.
 *
 * Reimplementing Weebly's PlatformElement framework to host them is a
 * component overhaul, which is Phase 2 work. So main.js stays, now served from
 * this repository rather than Weebly's CDN, and everark.js is layered on top
 * for the two things main.js can no longer do: submit a form and run a search.
 *
 * What this step does remove is the theme's license enforcer, the reCAPTCHA
 * placeholders whose widget Weebly loaded from a backend that is gone, and the
 * flyout bootstrap's duplicated menu data - lifted once to assets/nav.json,
 * which Phase 2 needs in order to generate navigation instead of repeating it
 * across 139 files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, transformPages, readPage, pages } from '../lib/refs.mjs';
import { tidyBlankLines, insertIntoHead } from '../lib/html.mjs';

/**
 * files/theme/baambooLicense.js is the theme vendor's licence enforcer. It
 * reads location.host, and unless the host contains editmysite.com, preview.
 * or checkout.weebly.com it fetches /files/theme/key.lic and, on anything but
 * a 200 with a valid signature, appends a full-screen "Please Verify Your
 * Purchase License!" overlay to the page.
 *
 * key.lic is not in the export and 404s on the live site too, so the check
 * would fail on any domain this site is moved to. It is dormant only because
 * nothing ever calls baambooLicense() - the theme's call site was in a Weebly
 * template the export did not include. That makes it a loaded gun pointed at
 * exactly the migration being performed here, so it goes, along with aes.js,
 * which exists solely to decrypt its licence file (Aes.* has no other
 * reference anywhere in the export).
 */
const DEAD_THEME_SCRIPTS = ['files/theme/baambooLicense.js', 'files/theme/aes.js'];

// ------------------------------------------------- lift the nav definition
const navMatch = readPage('index.html').match(/initPublishedFlyoutMenus\(\s*(\[[\s\S]*?\]),\s*"/);
if (navMatch) {
  const nav = JSON.parse(navMatch[1]);
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets/nav.json'), `${JSON.stringify(nav, null, 2)}\n`);
  console.log(`extracted ${nav.length} top-level nav items to assets/nav.json`);
} else {
  console.warn('could not find the nav definition; assets/nav.json not written');
}

const RUNTIME_TAGS = [
  '\t\t<script src="assets/js/site-config.js"></script>',
  '\t\t<script src="assets/js/everark.js"></script>',
].join('\n');

transformPages('trim weebly runtime', (html) => {
  let out = html;

  for (const script of DEAD_THEME_SCRIPTS) {
    out = out.replace(
      new RegExp(`[ \\t]*<script[^>]*src=["']${script.replace(/[.]/g, '\\.')}[^"']*["'][^>]*>\\s*</script>\\n?`, 'gi'),
      '',
    );
  }

  // Weebly loaded the reCAPTCHA widget on demand from main.js against its own
  // backend, so these placeholders have always rendered as nothing. Spam
  // protection for the forms now comes from the form provider and a honeypot.
  out = out.replace(/<div id="g-recaptcha-\d+"[^>]*><\/div>/gi, '');

  // everark.js must load after main.js so its handlers can take precedence
  // over Weebly's delegated form and search bindings.
  const anchor = out.match(
    /<script[^>]*src=["'][^"']*cdn11\.editmysite\.com\/js\/site\/main\.js[^"']*["'][^>]*>\s*<\/script>/i,
  );
  if (anchor && !out.includes('assets/js/everark.js')) {
    out = out.replace(anchor[0], `${anchor[0]}\n${RUNTIME_TAGS}`);
  } else {
    out = insertIntoHead(out, RUNTIME_TAGS, 'assets/js/everark.js');
  }

  return tidyBlankLines(out);
});

for (const script of DEAD_THEME_SCRIPTS) {
  const abs = path.join(ROOT, script);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs);
    console.log(`removed ${script}`);
  }
}

// Ordering is the whole point of the anchor above; assert it rather than hope.
const bad = pages().filter((name) => {
  const html = readPage(name);
  const main = html.indexOf('cdn11.editmysite.com/js/site/main.js');
  const ours = html.indexOf('assets/js/everark.js');
  return ours === -1 || (main !== -1 && ours < main);
});
if (bad.length) {
  console.error(`everark.js loads before main.js on ${bad.length} pages, e.g. ${bad[0]}`);
  process.exitCode = 1;
} else {
  console.log('everark.js loads after main.js on all pages');
}
