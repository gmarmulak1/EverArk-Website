/**
 * Build assets/articles.json: one entry per article, newest first.
 *
 * Both kinds are included — the 61 posts carried over from Weebly, whose date
 * and headline are read back out of the built page, and any written in
 * Markdown. Nothing consumes this yet; the blog index and archive pages are
 * still the hand-built ones from the export, and replacing their card layout
 * is a visible change rather than a refactor. This is the data that work
 * needs, kept accurate from now on so it does not have to be reconstructed
 * later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pages, readPage } from '../lib/refs.mjs';
import { articleFiles, loadArticle, loadSite } from './render.mjs';

const DATE = /<div class="paragraph">\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*<br/;
const H1 = /<h1[^>]*>([\s\S]*?)<\/h1>/;

const toIso = (us) => {
  const [m, d, y] = us.split('/');
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Headlines come out of built HTML, so entities have to be decoded. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#8203': '', '#39': "'" };
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-z]+|#\d+);/gi, (whole, name) => (name in ENTITIES ? ENTITIES[name] : whole))
    .replace(/\s+/g, ' ')
    .trim();

export function buildArticlesIndex() {
  const site = loadSite();
  const fromMarkdown = new Set();
  const entries = [];

  for (const file of articleFiles()) {
    const { data } = loadArticle(file, site);
    if (String(data.draft) === 'true') continue;
    fromMarkdown.add(`${data.slug}.html`);
    entries.push({
      url: `${data.slug}.html`,
      title: (data.social && data.social.title) || data.title,
      date: data.article.date,
      description: data.description,
      tags: data.article.tags,
      source: 'markdown',
    });
  }

  for (const name of pages()) {
    if (fromMarkdown.has(name)) continue;
    const html = readPage(name);
    const date = html.match(DATE);
    const heading = html.match(H1);
    if (!date || !heading) continue;
    entries.push({
      url: name,
      title: text(heading[1]),
      date: toIso(date[1]),
      description: (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1],
      tags: [],
      source: 'legacy',
    });
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  fs.writeFileSync(path.join(ROOT, 'assets/articles.json'), JSON.stringify(entries, null, 2));
  return entries;
}

if (import.meta.filename === process.argv[1]) {
  const e = buildArticlesIndex();
  const md = e.filter((x) => x.source === 'markdown').length;
  console.log(`articles: ${e.length} (${md} markdown, ${e.length - md} legacy), newest ${e[0].date}`);
}
