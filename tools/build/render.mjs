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

const SRC = path.join(ROOT, 'src');
const DEST = process.env.DEST ? path.resolve(process.env.DEST) : ROOT;

/** Per-page social tags travel in their own comment block, after the front matter. */
const SOCIAL_OPEN = '<!--everark:social\n';
const SOCIAL_CLOSE = '\n-->\n';

export function loadPartials() {
  const dir = path.join(SRC, 'partials');
  return Object.fromEntries(
    fs.readdirSync(dir).map((f) => [f.replace(/\.html$/, ''), fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
}

export function loadPage(file) {
  const raw = fs.readFileSync(path.join(SRC, 'pages', file), 'utf8');
  const { data, body } = readFrontMatter(raw);
  let social = '';
  let content = body;
  if (body.startsWith(SOCIAL_OPEN)) {
    const end = body.indexOf(SOCIAL_CLOSE);
    social = body.slice(SOCIAL_OPEN.length, end);
    content = body.slice(end + SOCIAL_CLOSE.length);
  }
  return { data, social, content };
}

export function pageFiles() {
  return fs.readdirSync(path.join(SRC, 'pages')).filter((f) => f.endsWith('.html')).sort();
}

export function buildAll(dest = DEST) {
  const partials = loadPartials();
  fs.mkdirSync(dest, { recursive: true });
  const written = [];
  for (const file of pageFiles()) {
    fs.writeFileSync(path.join(dest, file), compose(loadPage(file), partials));
    written.push(file);
  }
  return written;
}

if (import.meta.filename === process.argv[1]) {
  const written = buildAll();
  console.log(`built ${written.length} pages -> ${path.relative(ROOT, DEST) || '.'}`);
}
