/**
 * Build the site: src/ in, the flat .html pages at the repository root out.
 *
 * DEST=<dir> writes elsewhere, which is how the round-trip check compares a
 * fresh build against the committed pages without disturbing them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/refs.mjs';
import { readFrontMatter } from './lib/page.mjs';
import { compose } from './lib/compose.mjs';
import { renderArticle } from './lib/article.mjs';

const SRC = path.join(ROOT, 'src');
const DEST = process.env.DEST ? path.resolve(process.env.DEST) : ROOT;

export function loadPartials() {
  const dir = path.join(SRC, 'partials');
  return Object.fromEntries(
    fs.readdirSync(dir).map((f) => [f.replace(/\.html$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
}

export function loadSite() {
  return JSON.parse(fs.readFileSync(path.join(SRC, 'site.json'), 'utf8'));
}

export function loadPage(file) {
  const raw = fs.readFileSync(path.join(SRC, 'pages', file), 'utf8');
  const { data, body } = readFrontMatter(raw);
  return { data, content: body };
}

export function pageFiles() {
  return fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html')).sort();
}

/**
 * Markdown articles. Names starting with _ and anything marked `draft: true`
 * are skipped, so an unfinished post can sit in the repository without being
 * published by the next deploy.
 */
export function articleFiles() {
  const dir = path.join(SRC, 'articles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
}

export function loadArticle(file, site) {
  const layout = fs.readFileSync(path.join(SRC, 'layouts/article.html'), 'utf8');
  const text = fs.readFileSync(path.join(SRC, 'articles', file), 'utf8');
  return renderArticle(file, text, layout, site);
}

export function buildAll(dest = DEST) {
  const partials = loadPartials();
  const site = loadSite();
  fs.mkdirSync(dest, { recursive: true });
  const written = [];
  for (const file of pageFiles()) {
    fs.writeFileSync(path.join(dest, file), compose(loadPage(file), partials, site));
    written.push(file);
  }
  for (const file of articleFiles()) {
    const article = loadArticle(file, site);
    if (String(article.data.draft) === 'true') continue;
    const out = `${article.data.slug}.html`;
    fs.writeFileSync(path.join(dest, out), compose(article, partials, site));
    written.push(out);
  }
  return written;
}

if (import.meta.filename === process.argv[1]) {
  const written = buildAll();
  console.log(`built ${written.length} pages -> ${path.relative(ROOT, DEST) || '.'}`);
}
