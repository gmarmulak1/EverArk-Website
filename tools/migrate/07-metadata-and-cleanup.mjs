/**
 * Step 7 — site metadata, and the defects the export left in the markup.
 *
 * Nothing here changes the design. It fixes markup that is malformed or points
 * at Weebly, and adds the metadata a standalone site is expected to serve and
 * this one never had: a favicon, canonical URLs, robots.txt and a sitemap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pages, transformPages, readPage } from '../lib/refs.mjs';
import { dropLinkContaining, tidyBlankLines } from '../lib/html.mjs';

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.everark.io';

/** Weebly routes that have no matching file in the export. */
const LINK_FIXES = new Map([
  ['blog/everark-is-revolutionizing-the-cemetery-industry', 'everark-is-revolutionizing-the-cemetery-industry.html'],
  ['blog/top-five-tips-for-a-smooth-transition-to-digital-cemetery-management', 'top-five-tips-for-a-smooth-transition-to-digital-cemetery-management.html'],
  ['features.html', 'cemetery-software-features.html'],
  ['request-a-demo.html', 'cemetery-software-request-a-demo.html'],
  ['blog', 'blog.html'],
]);

const HEAD_LINKS = [
  '\t\t<link rel="icon" href="assets/favicon/favicon-32.png" sizes="32x32" type="image/png" />',
  '\t\t<link rel="icon" href="assets/favicon/favicon-192.png" sizes="192x192" type="image/png" />',
  '\t\t<link rel="apple-touch-icon" href="assets/favicon/apple-touch-icon.png" />',
].join('\n');

transformPages('metadata and cleanup', (html, pageName) => {
  let out = html;

  // A stray <html itemscope itemtype="..."> sits inside <head> on 42 pages.
  // The intent - marking the document as a schema.org Webpage - belongs on the
  // real <html> element, so move it there and drop the stray tag.
  const stray = out.match(/\n?<html itemscope itemtype="[^"]*">\n?/);
  if (stray) {
    out = out.replace(stray[0], '\n');
    const type = stray[0].match(/itemtype="([^"]*)"/)[1].replace(/^http:/, 'https:');
    if (!/<html[^>]*itemscope/.test(out)) {
      out = out.replace(/<html lang="en">/, `<html lang="en" itemscope itemtype="${type}">`);
    }
  }

  // The logo linked to href="", which reloads the current page rather than
  // going home.
  out = out.replace(
    /(<span class="wsite-logo">[\s\S]{0,80}?)<a href="">/,
    '$1<a href="index.html">',
  );

  // Weebly's own CDN 404s this stylesheet; it has never loaded.
  out = dropLinkContaining(out, 'fonts/Muli/font.css');

  // Absolute self-links: relative ones survive a domain change and work on a
  // preview deploy. Canonical, og: and JSON-LD URLs stay absolute on purpose.
  out = out.replace(/href="https?:\/\/(?:www\.)?everark\.io\/([^"]*)"/g, (whole, rest) => {
    const [pathPart, fragment] = rest.split(/(?=#)/);
    if (pathPart === '' ) return 'href="index.html"';
    if (pathPart.startsWith('apps/')) return whole; // Weebly member routes, handled below
    const mapped = LINK_FIXES.get(pathPart.replace(/\/$/, ''));
    if (mapped) return `href="${mapped}${fragment || ''}"`;
    if (fs.existsSync(path.join(ROOT, pathPart))) return `href="${rest}"`;
    if (fs.existsSync(path.join(ROOT, `${pathPart}.html`))) return `href="${pathPart}.html${fragment || ''}"`;
    return whole;
  });

  // The member login route was Weebly's; the product's own sign-in is at
  // everark.app, which the header button already points to.
  out = out.replace(
    /href="https?:\/\/(?:www\.)?everark\.io\/apps\/member\/login"/g,
    'href="https://everark.app/signup"',
  );

  // The promo video embed builds an iframe pointing at http:///weebly/... -
  // an empty host the export mangled. It renders nothing and the source video
  // is gone from Weebly, so the dead embed goes; see MIGRATION.md.
  out = out.replace(
    /<div class="wsite-video">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/,
    (block) => (block.includes('generateVideo.php') ? '' : block),
  );

  // gtag for UA-224885944-1 is injected twice per page; the second is a no-op
  // that costs a request.
  const gtagBlocks = [...out.matchAll(/<!--[^>]*(?:Global site tag|Google tag)[^>]*-->\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=UA-224885944-1">\s*<\/script>\s*<script>[\s\S]*?<\/script>/g)];
  if (gtagBlocks.length > 1) {
    out = out.replace(gtagBlocks[gtagBlocks.length - 1][0], '');
  }

  // YouTube embeds use http://, which every browser blocks as mixed content
  // once the site is served over https - so these 22 videos render as an empty
  // box today. Same video, same embed, secure scheme.
  out = out.replace(/src="http:\/\/www\.youtube\.com\//g, 'src="https://www.youtube.com/');

  // The privacy policy's "Your Choices" links point at Weebly's editor - the
  // editor rewrote what should have been a same-page anchor. The anchor it
  // meant is on the page already.
  out = out.replace(
    /href="https:\/\/[0-9-]+\.preview\.editmysite\.com\/editor\/main\.php[^"]*"/g,
    'href="#yourchoices"',
  );

  // Raleway's stylesheet is linked six times per page and Open Sans twice -
  // an artefact of the theme's font pickers. Identical links, so all but the
  // first are pure round-trips.
  const seenFontLinks = new Set();
  out = out.replace(/[ \t]*<link [^>]*fonts\/[A-Za-z_]+\/font\.css[^>]*>\n?/g, (tag) => {
    const family = tag.match(/fonts\/([A-Za-z_]+)\/font\.css/)[1];
    if (seenFontLinks.has(family)) return '';
    seenFontLinks.add(family);
    return tag;
  });

  // Curly quotes made this meta tag unparseable as an attribute.
  out = out.replace(
    /<meta name=[”"]google-site-verification[”"]\s*\ncontent=[”"]([^”"]*)[”"]\s*\/>/,
    '<meta name="google-site-verification" content="$1" />',
  );

  // Favicon and canonical.
  if (!out.includes('assets/favicon/favicon-32.png')) {
    out = out.replace(/<\/head>/i, `${HEAD_LINKS}\n\t</head>`);
  }
  if (!/<link rel="canonical"/.test(out)) {
    const canonical =
      pageName === 'index.html' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${pageName}`;
    out = out.replace(/<\/head>/i, `\t\t<link rel="canonical" href="${canonical}" />\n\t</head>`);
  }

  return tidyBlankLines(out);
});

// -------------------------------------------------------- robots + sitemap
const SKIP_FROM_SITEMAP = new Set([
  '404.html',
  '500-server-error.html',
  'search.html',
  'form-thank-you.html',
  'thank-you.html',
  '_______________________.html',
  '_______________________1.html',
]);

const urls = pages()
  .filter((p) => !SKIP_FROM_SITEMAP.has(p))
  .map((p) => (p === 'index.html' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${p}`));

fs.writeFileSync(
  path.join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `\t<url><loc>${u}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
console.log(`sitemap.xml: ${urls.length} urls`);

fs.writeFileSync(
  path.join(ROOT, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /_archive/\nDisallow: /search.html\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
);
console.log('robots.txt written');
