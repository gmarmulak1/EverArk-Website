/**
 * One-time: lift each page's hand-written social block into front matter.
 *
 * The values are worth keeping — many pages have a shorter, better social
 * title than their <title> — but the markup around them is not: duplicated
 * twitter:description tags, og:url pointing at other pages, and 81 pages with
 * no tags at all. This reads the values out, records anything it does not
 * recognise rather than dropping it, and lets tools/build/lib/seo.mjs generate
 * the markup from then on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/refs.mjs';
import { pageFiles } from '../build/render.mjs';
import { readFrontMatter, writeFrontMatter } from '../build/lib/page.mjs';
import { socialTitleOf } from '../build/lib/seo.mjs';

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/site.json'), 'utf8'));

/**
 * The block extract.mjs parks the page's original social markup in. The build
 * no longer reads it — that is the point of this script — so it is parsed here
 * rather than through loadPage().
 */
const SOCIAL_OPEN = '<!--everark:social\n';
const SOCIAL_CLOSE = '\n-->\n';

function readSource(file) {
  const { data, body } = readFrontMatter(fs.readFileSync(path.join(ROOT, 'src/pages', file), 'utf8'));
  if (!body.startsWith(SOCIAL_OPEN)) return { data, social: '', content: body };
  const end = body.indexOf(SOCIAL_CLOSE);
  return {
    data,
    social: body.slice(SOCIAL_OPEN.length, end),
    content: body.slice(end + SOCIAL_CLOSE.length),
  };
}

/** Tags the generator produces itself; their values are captured, not the markup. */
const KNOWN = new Set([
  'og:url', 'og:type', 'og:title', 'og:description', 'og:image', 'og:site_name',
  'twitter:card', 'twitter:site', 'twitter:title', 'twitter:description',
  'twitter:image', 'twitter:image:src', 'twitter:creator',
]);

const unrecognised = new Map();
const leftovers = [];
let changed = 0;

for (const file of pageFiles()) {
  const { data, social, content } = readSource(file);
  if (!social.trim()) {
    // Nothing to lift, but the page still gains generated tags at build time.
    delete data.socialRaw;
    fs.writeFileSync(path.join(ROOT, 'src/pages', file), writeFrontMatter(data, content));
    changed++;
    continue;
  }

  const value = (name) => {
    const m = social.match(
      new RegExp(`<meta\\s+(?:name|property)="${name.replace(/[:]/g, ':')}"\\s+content="([^"]*)"`),
    );
    return m ? m[1].trim() : undefined;
  };

  const jsonLdBlocks = [...social.matchAll(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g)]
    .map((m) => m[0]);
  const jsonLd = jsonLdBlocks.map(
    (b) => b.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '').trim(),
  );

  /**
   * Whatever is left after the recognised tags come out is kept verbatim.
   *
   * This is not defensive coding for its own sake: one page's "social" block
   * turned out to contain a <style> rule hiding its form's required-field
   * label, and a stray line of text. Matching only <meta> dropped both, and
   * the page grew 27px. Subtracting what is understood and keeping the
   * remainder means a surprise survives instead of vanishing.
   */
  let leftover = social;
  for (const m of social.matchAll(/<meta\s+(?:name|property)="([^"]+)"[^>]*>/g)) {
    if (KNOWN.has(m[1])) {
      leftover = leftover.replace(m[0], '');
      continue;
    }
    unrecognised.set(m[1], (unrecognised.get(m[1]) || 0) + 1);
  }
  for (const block of jsonLdBlocks) leftover = leftover.replace(block, '');
  leftover = leftover
    .replace(/<!--[^>]*(?:Twitter|Open Graph|itemscope|structured data)[^>]*-->/gi, '')
    .replace(/^[ \t]*\n/gm, '')
    .trim();

  const extraHead = leftover ? [leftover] : [];

  const socialData = {};
  const ogTitle = value('og:title') || value('twitter:title');

  /**
   * og: and twitter: descriptions are meant to say the same thing, and where
   * they disagree it is because one of them was mistyped — one page's
   * og:description is its own description with a stray "D" on the front.
   * Prefer whichever matches the page's own description.
   */
  const ogRaw = value('og:description');
  const twRaw = value('twitter:description');
  const pageDescription = (data.description || '').trim();
  const ogDescription =
    ogRaw && twRaw && ogRaw !== twRaw
      ? [ogRaw, twRaw].find((v) => pageDescription.startsWith(v.trim().slice(0, 40))) || twRaw
      : ogRaw || twRaw;
  const ogImage = value('og:image') || value('twitter:image:src');
  const ogType = value('og:type');

  // Only record a value when it differs from what the generator would derive,
  // so front matter stays about the page rather than restating defaults.
  if (ogTitle && ogTitle.trim() !== socialTitleOf(data, site)) socialData.title = ogTitle.trim();
  if (ogDescription && ogDescription.trim() !== (data.description || '')) {
    socialData.description = ogDescription.trim();
  }
  if (ogImage && ogImage !== site.defaultImage) socialData.image = ogImage;
  if (ogType && ogType !== 'website') socialData.type = ogType;

  if (Object.keys(socialData).length) data.social = socialData;
  if (jsonLd.length) data.jsonLd = jsonLd;
  if (extraHead.length) {
    data.extraHead = extraHead;
    leftovers.push([file, leftover]);
  }
  delete data.socialRaw;

  fs.writeFileSync(path.join(ROOT, 'src/pages', file), writeFrontMatter(data, content));
  changed++;
}

console.log(`rewrote ${changed} page sources`);
if (unrecognised.size) {
  console.log('unrecognised meta names (kept verbatim):');
  for (const [t, c] of unrecognised) console.log(`  ${t} (${c})`);
}
if (leftovers.length) {
  console.log(`\npages with non-meta content in their social block (kept verbatim): ${leftovers.length}`);
  for (const [name, text] of leftovers) console.log(`  ${name}: ${JSON.stringify(text.slice(0, 90))}`);
}
