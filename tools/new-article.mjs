/**
 * Scaffold a new article.
 *
 *   npm run new-article "How to map a cemetery without losing a weekend"
 *
 * Writes src/articles/<slug>.md with today's date and a draft flag, so the
 * next build ignores it until it is ready. Publishing is then: fill it in,
 * remove `draft: true`, commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/refs.mjs';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('usage: npm run new-article "Article title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .split('-')
  .slice(0, 10)
  .join('-');

const file = path.join(ROOT, 'src/articles', `${slug}.md`);
if (fs.existsSync(file)) {
  console.error(`already exists: ${path.relative(ROOT, file)}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(
  file,
  `---
title: ${title}
date: ${today}
description: One or two sentences. This is the meta description and the social card text, so write it for someone deciding whether to click.
keywords: cemetery software
draft: true
---

Opening paragraph.

## A subheading

Body copy.
`,
);

console.log(`created ${path.relative(ROOT, file)}`);
console.log('remove `draft: true` when it is ready, then: npm run build');
