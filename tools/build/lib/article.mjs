/**
 * Articles written in Markdown.
 *
 * The 61 posts carried over from Weebly are page sources like any other — they
 * keep the markup they were exported with, and nothing here touches them.
 * What this adds is a way to write the *next* one: a Markdown file with a
 * short front matter block, rendered into the same layout.
 *
 * The difference in weight is the point. A legacy post inlines roughly 8 KB of
 * font declarations per heading widget — 40 font families, of which the site
 * uses two. A Markdown article is its own text plus one shared stylesheet.
 */
import { marked } from 'marked';

const FENCE = '---';

/**
 * Flat front matter: `key: value` per line, and `key: [a, b]` for lists.
 * Deliberately not a YAML parser — article front matter is half a dozen
 * strings, and a dependency that can execute is not worth it for that.
 */
export function parseFrontMatter(text) {
  if (!text.startsWith(`${FENCE}\n`)) {
    throw new Error('article is missing its --- front matter block');
  }
  const end = text.indexOf(`\n${FENCE}\n`, FENCE.length);
  if (end < 0) throw new Error('article front matter is not terminated');

  const data = {};
  for (const line of text.slice(FENCE.length + 1, end).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf(':');
    if (at < 0) throw new Error(`article front matter line is not "key: value": ${trimmed}`);
    const key = trimmed.slice(0, at).trim();
    let value = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, '');
    data[key] = value.startsWith('[')
      ? value.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean)
      : value;
  }
  return { data, body: text.slice(end + FENCE.length + 2) };
}

/** 2026-08-25 -> 8/25/2026, matching how the existing posts print their date. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

const DEFAULTS = {
  banner: 'Our Blog Chatter',
  bannerImage: 'uploads/1/0/7/5/107572223/background-images/504267743.png',
  // The Blog item, so the navigation highlights it the way the old posts do.
  activeNavId: '268383861935122927',
  bodyClass:
    'header  wsite-theme-light  wsite-page-{slug} header-title-off phone-number-on location-on time-open-off top-header-sticky-on sticky-nav-on custom-option-on menu-style-3 sticky-button-on ToTop-on section-6-off section-7-off section-26-off section-27-off section-36-off section-37-off slide-24-off slide-25-off ',
};

/** Turn one Markdown article into the {data, content} shape compose() takes. */
export function renderArticle(file, text, layout, site) {
  const slug = file.replace(/\.md$/, '');
  const { data, body } = parseFrontMatter(text);

  for (const required of ['title', 'date', 'description']) {
    if (!data[required]) throw new Error(`${file}: front matter is missing "${required}"`);
  }

  const html = marked.parse(body.trim(), { mangle: false, headerIds: false });
  const content = layout
    .split('{{bannerImage}}').join(data.bannerImage || DEFAULTS.bannerImage)
    .split('{{banner}}').join(data.banner || DEFAULTS.banner)
    .split('{{date}}').join(formatDate(data.date))
    .split('{{title}}').join(data.title)
    .split('{{body}}').join(html.trimEnd());

  return {
    data: {
      slug,
      title: data.seoTitle || `${data.title}${site.titleSuffix}`,
      description: data.description,
      keywords: data.keywords || undefined,
      schemaWebpage: true,
      activeNavId: DEFAULTS.activeNavId,
      bodyClass: DEFAULTS.bodyClass,
      canonical: `\t\t\t<link rel="canonical" href="${site.origin}/${slug}.html" />\n\t`,
      social: data.image ? { title: data.title, image: `${site.origin}/${data.image}` } : { title: data.title },
      extraHead: ['<link rel="stylesheet" href="assets/css/article.css" />'],
      jsonLd: [articleJsonLd(data, slug, site)],
      article: { date: data.date, tags: data.tags || [] },
      draft: data.draft,
    },
    content,
  };
}

function articleJsonLd(data, slug, site) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: data.title,
      description: data.description,
      datePublished: data.date,
      dateModified: data.updated || data.date,
      author: { '@type': 'Organization', name: site.name },
      publisher: { '@type': 'Organization', name: site.name },
      mainEntityOfPage: `${site.origin}/${slug}.html`,
      ...(data.image ? { image: `${site.origin}/${data.image}` } : {}),
    },
    null,
    2,
  );
}
