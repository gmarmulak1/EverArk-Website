/**
 * Generate each page's Open Graph, Twitter and structured-data tags.
 *
 * The export left this in a bad state, which is the reason this exists at all:
 * 81 of 141 pages had no social tags whatsoever, and of the 42 that did, 40
 * carried an og:url pointing at a different page — 32 of them all claiming to
 * be the features page. Sharing any of those to Facebook or LinkedIn resolved
 * to the wrong content. twitter:description was emitted twice per page.
 *
 * Deriving the tags from the same front matter that drives the rest of the
 * <head> means a page cannot disagree with itself, and a new page gets correct
 * tags without anyone remembering to add them.
 */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page's own URL, taken from the canonical tag it already carries. */
export function canonicalUrlOf(data, site) {
  const m = (data.canonical || '').match(/href="([^"]*)"/);
  if (m) return m[1];
  return data.slug === 'index' ? `${site.origin}/` : `${site.origin}/${data.slug}.html`;
}

/** A social card title: the page title without the site suffix repeated on it. */
export function socialTitleOf(data, site) {
  if (data.social && data.social.title) return data.social.title;
  const title = data.title || site.name;
  return site.titleSuffix && title.endsWith(site.titleSuffix)
    ? title.slice(0, -site.titleSuffix.length)
    : title;
}

export function renderSeo(data, site) {
  const url = canonicalUrlOf(data, site);
  const title = socialTitleOf(data, site);
  const description =
    (data.social && data.social.description) || data.description || '';
  const image = (data.social && data.social.image) || site.defaultImage;

  const tags = [
    '<!-- Open Graph -->',
    `<meta property="og:type" content="${esc((data.social && data.social.type) || 'website')}" />`,
    `<meta property="og:site_name" content="${esc(site.name)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
  ];
  if (description) tags.push(`<meta property="og:description" content="${esc(description)}" />`);
  tags.push(`<meta property="og:image" content="${esc(image)}" />`);

  tags.push(
    '<!-- Twitter -->',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:site" content="${esc(site.twitter)}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
  );
  if (description) tags.push(`<meta name="twitter:description" content="${esc(description)}" />`);
  tags.push(`<meta name="twitter:image" content="${esc(image)}" />`);

  // Page-specific structured data (SoftwareApplication, BreadcrumbList, FAQ)
  // is carried through as authored — it is content, not boilerplate.
  const extra = (data.jsonLd || []).map(
    (block) => `<script type="application/ld+json">\n${block}\n</script>`,
  );
  const head = (data.extraHead || []).slice();

  // The shared head ends with an indent and head-tail begins with a newline,
  // so this block supplies neither.
  return [...head, ...tags, ...extra].join('\n\t\t');
}
