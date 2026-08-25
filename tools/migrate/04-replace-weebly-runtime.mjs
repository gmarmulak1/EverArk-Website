/**
 * Step 4 — swap Weebly's site runtime for assets/js/everark.js.
 *
 * main.js is 481 KB serving three purposes on this site: it relocates the
 * navigation submenus, it wires up the contact forms, and it powers a search
 * box whose endpoint no longer exists. Everything else in it - store,
 * membership, editor bridge, RPC client, gallery, dialogs - is dead here.
 * everark.js covers those three jobs in about 200 lines.
 *
 * The navigation definition Weebly passed to initFlyoutMenus is lifted out to
 * assets/nav.json before the inline bootstrap is dropped: it is the only
 * machine-readable description of the site's menu, and Phase 2 needs it to
 * generate navigation instead of repeating it in 139 files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, transformPages, readPage, pages } from '../lib/refs.mjs';
import { dropScriptContaining, tidyBlankLines, insertIntoHead } from '../lib/html.mjs';

// ------------------------------------------------- lift the nav definition
const sample = readPage('index.html');
const navMatch = sample.match(/initPublishedFlyoutMenus\(\s*(\[[\s\S]*?\]),\s*"/);
if (navMatch) {
  const nav = JSON.parse(navMatch[1]);
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets/nav.json'), `${JSON.stringify(nav, null, 2)}\n`);
  console.log(`extracted ${nav.length} top-level nav items to assets/nav.json`);
} else {
  console.warn('could not find the nav definition; assets/nav.json not written');
}

// --------------------------------------------------------------- rewrite
const RUNTIME_TAGS = [
  '\t\t<script src="assets/js/site-config.js"></script>',
  '\t\t<script src="assets/js/everark.js"></script>',
].join('\n');

transformPages('replace weebly runtime', (html) => {
  let out = html;

  // The runtime itself and its localisation bundle.
  out = out.replace(
    /<script[^>]*src=["'][^"']*cdn11\.editmysite\.com\/js\/site\/main\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    '',
  );
  out = out.replace(
    /<script[^>]*src=["'][^"']*lang\/en\/stl\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    '',
  );
  out = out.replace(
    /<script[^>]*src=["'][^"']*templateArtifacts\.js[^"']*["'][^>]*>\s*<\/script>/gi,
    '',
  );

  // The flyout bootstrap: nothing calls initFlyouts once main.js is gone, and
  // the menu it describes now lives in assets/nav.json.
  out = dropScriptContaining(out, 'initPublishedFlyoutMenus');

  // Globals that existed purely to configure main.js.
  out = dropScriptContaining(out, 'var STATIC_BASE');
  out = dropScriptContaining(out, '_W.securePrefix');
  out = dropScriptContaining(out, '_W.configDomain');
  out = dropScriptContaining(out, '_W.recaptchaUrl');

  // reCAPTCHA placeholders: Weebly loaded the widget on demand from main.js,
  // so these divs have always rendered as nothing. Spam protection for the
  // forms now comes from the form provider plus the honeypot field.
  out = out.replace(/<div id="g-recaptcha-\d+"[^>]*><\/div>/gi, '');

  return tidyBlankLines(insertIntoHead(out, RUNTIME_TAGS, 'assets/js/everark.js'));
});

// The runtime must load after jQuery, which the theme scripts also depend on.
const bad = pages().filter((name) => {
  const html = readPage(name);
  const jq = html.indexOf('jquery-1.8.3.min.js');
  const ev = html.indexOf('assets/js/everark.js');
  return jq === -1 || ev === -1 || ev < jq;
});
if (bad.length) {
  console.error(`runtime ordering wrong on ${bad.length} pages, e.g. ${bad[0]}`);
  process.exitCode = 1;
} else {
  console.log('runtime loads after jQuery on all pages');
}
