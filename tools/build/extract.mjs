/**
 * One-shot: take the 141 built pages apart into src/.
 *
 * This is kept in the repository rather than deleted after use, because it is
 * the record of how src/ was derived from the export. Re-running it against
 * the built pages should be a no-op.
 *
 * Pass --dry to report what it would write without touching anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pages, readPage } from '../lib/refs.mjs';
import { splitHeads } from './lib/decompose.mjs';
import { decompose, writeFrontMatter } from './lib/page.mjs';

const DRY = process.argv.includes('--dry');
const SRC = path.join(ROOT, 'src');

const { shared, sharedTail, parts } = splitHeads();

const decomposed = new Map();
for (const name of pages()) {
  decomposed.set(name, decompose(readPage(name), name, parts.get(name)));
}

/** Group a shared region by its exact text so variants are visible, not assumed. */
function variantsOf(key) {
  const groups = new Map();
  for (const [name, page] of decomposed) {
    const text = page[key];
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(name);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

const REGIONS = ['bodyOpen', 'header', 'footer', 'tail'];
const chosen = new Map();

console.log('region      variants   sizes');
for (const key of REGIONS) {
  const v = variantsOf(key);
  chosen.set(key, v);
  console.log(
    `${key.padEnd(12)}${String(v.length).padStart(6)}   ` +
      v.map(([t, ns]) => `${ns.length}x${t.length}B`).join('  '),
  );
  if (v.length > 1) {
    const [a] = v[0];
    const [b, names] = v[1];
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    let j = 0; while (j < a.length - i && j < b.length - i && a[a.length-1-j] === b[b.length-1-j]) j++;
    console.log(`   variant 2 (${names.length} pages, e.g. ${names[0]}) differs:`);
    console.log(`     base : ${JSON.stringify(a.slice(i, a.length - j)).slice(0, 150)}`);
    console.log(`     other: ${JSON.stringify(b.slice(i, b.length - j)).slice(0, 150)}`);
  }
}

if (DRY) {
  const perPage = [...decomposed.values()].reduce((s, p) => s + p.content.length + p.social.length, 0);
  const sharedBytes = shared.length + sharedTail.length +
    REGIONS.reduce((s, k) => s + chosen.get(k).reduce((t, [text]) => t + text.length, 0), 0);
  const built = pages().reduce((s, n) => s + readPage(n).length, 0);
  console.log(`\nbuilt pages     ${(built / 1e6).toFixed(1)} MB`);
  console.log(`src content     ${(perPage / 1e6).toFixed(1)} MB per-page + ${(sharedBytes / 1024).toFixed(0)} KB shared`);
  console.log(`duplication removed ~${((built - perPage - sharedBytes) / 1e6).toFixed(1)} MB`);
  process.exit(0);
}

// ---------------------------------------------------------------- write src
fs.rmSync(SRC, { recursive: true, force: true });
fs.mkdirSync(path.join(SRC, 'partials'), { recursive: true });
fs.mkdirSync(path.join(SRC, 'pages'), { recursive: true });

const write = (rel, text) => fs.writeFileSync(path.join(SRC, rel), text);

write('partials/head.html', shared);
write('partials/head-tail.html', sharedTail);

/** Variant names, chosen for what actually differs rather than by index. */
const VARIANT_NAMES = {
  bodyOpen: ['body-open'],
  header: ['header', 'header-no-banner'],
  footer: ['footer'],
  tail: ['tail', 'tail-search'],
};

const variantFor = new Map();
for (const key of REGIONS) {
  const list = chosen.get(key);
  const names = VARIANT_NAMES[key];
  if (list.length > names.length) {
    throw new Error(`${key}: ${list.length} variants but only ${names.length} names — inspect before extracting`);
  }
  list.forEach(([text, pageNames], i) => {
    write(`partials/${names[i]}.html`, text);
    for (const n of pageNames) {
      if (!variantFor.has(n)) variantFor.set(n, {});
      if (i > 0) variantFor.get(n)[key] = names[i];
    }
  });
}

for (const [name, page] of decomposed) {
  const data = { ...page.data };
  const v = variantFor.get(name) || {};
  if (Object.keys(v).length) data.partials = v;
  if (page.social.trim()) data.socialRaw = true;
  const body = (page.social.trim() ? `<!--everark:social\n${page.social}\n-->\n` : '') + page.content;
  write(`pages/${name}`, writeFrontMatter(data, body));
}

console.log(`\nwrote src/: ${decomposed.size} pages, ${fs.readdirSync(path.join(SRC, 'partials')).length} partials`);
