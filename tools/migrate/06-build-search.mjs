/**
 * Step 6 — build the search index and the two generated pages.
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
import { buildPage } from '../lib/page-template.mjs';

/** Pages that are chrome, redirects or fragments rather than real content. */
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

// -------------------------------------------------------- generated pages

// The site's h2 is 40px, which is right for a page heading and far too heavy
// for a list of results. These are the only pages with no prior appearance to
// preserve, so they get sizing of their own - built from the same typography.
const RESULTS_STYLE = `
<style>
	#everark-search-results .everark-search-result { margin: 0 0 28px; }
	#everark-search-results .wsite-content-title { font-size: 22px !important; line-height: 1.3 !important; margin: 0 0 6px !important; text-transform: none !important; }
	#everark-search-results .paragraph { font-size: 15px !important; line-height: 1.6 !important; }
	#everark-search-summary { margin-bottom: 24px; font-size: 15px !important; }
</style>`;

buildPage({
  file: 'search.html',
  title: 'Search - EVERARK',
  description: 'Search the EverArk site.',
  noindex: true,
  scripts: ['assets/js/everark-search.js'],
  content: `${RESULTS_STYLE}
<div class="wsite-spacer" style="height:40px;"></div>
<h2 class="wsite-content-title">Search</h2>
<form id="everark-search-page-form" action="search.html" method="get" style="margin-bottom:20px;">
	<div class="wsite-form-field" style="margin:5px 0;">
		<div class="wsite-form-input-container">
			<input type="text" id="everark-search-input" name="q" class="wsite-form-input wsite-input wsite-input-width-370px" placeholder="Search everark.io" />
		</div>
	</div>
</form>
<div class="paragraph" id="everark-search-summary"></div>
<div id="everark-search-results"></div>
<div class="wsite-spacer" style="height:60px;"></div>
`,
});
console.log('wrote search.html');

// The export already has a thank-you.html, but it confirms an account
// cancellation ("Your account will now be closed immediately, and your
// subscription cancelled"). Sending someone there after they request a demo
// would be alarming, so form submissions get their own confirmation page.
buildPage({
  file: 'form-thank-you.html',
  title: 'Thank You - EVERARK',
  description: 'Thanks for getting in touch with EverArk.',
  noindex: true,
  content: `
<div class="wsite-spacer" style="height:60px;"></div>
<h2 class="wsite-content-title" style="text-align:center;">Thank you</h2>
<div class="paragraph" style="text-align:center;">We have received your message and someone from the EverArk team will be in touch shortly.</div>
<div class="wsite-spacer" style="height:20px;"></div>
<div class="paragraph" style="text-align:center;">In the meantime you can <a href="cemetery-software-features.html">explore the features</a>, <a href="cemetery-software-pricing.html">see pricing</a>, or email us at <a href="mailto:hello@everark.io">hello@everark.io</a>.</div>
<div class="wsite-spacer" style="height:80px;"></div>
`,
});
console.log('wrote form-thank-you.html');
