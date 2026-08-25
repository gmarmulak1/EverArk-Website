/**
 * Step 2 — pull every Weebly-hosted asset into the repository.
 *
 * The export loads its theme CSS, jQuery, icon fonts, web fonts and marketplace
 * widget assets from editmysite.com / weebly.com CDNs, most of them over plain
 * http://. That is the actual lock-in: the site cannot render without Weebly's
 * infrastructure, and it triggers mixed-content warnings wherever it is served
 * over https.
 *
 * We mirror host + path under assets/vendor/, which matters more than it looks:
 * because the directory shape is preserved, relative url() references inside
 * the downloaded stylesheets keep resolving with no rewriting at all. Only
 * protocol-relative and absolute URLs need touching.
 *
 * The downloaded bytes are unmodified, so this step is visually a no-op by
 * construction — it changes where files come from, never what they contain.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, pages, readPage, writePage, fetchBuffer, mapLimit } from '../lib/refs.mjs';

const VENDOR = 'assets/vendor';

/** Hosts we take over. Anything else stays remote (analytics, YouTube, app links). */
const VENDOR_HOSTS = new Set([
  'cdn1.editmysite.com',
  'cdn2.editmysite.com',
  'cdn11.editmysite.com',
  'marketplace.editmysite.com',
  'boocare.weebly.com',
  'ailabomay.baamboostudio.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

const absolutise = (u) => (u.startsWith('//') ? `https:${u}` : u.replace(/^http:\/\//, 'https://'));

/** Map a remote URL to its mirrored path inside the repo. */
function localPathFor(rawUrl) {
  const url = new URL(absolutise(rawUrl.split('#')[0]));
  if (!VENDOR_HOSTS.has(url.hostname)) return null;
  let p = url.pathname.replace(/^\/+/, '');
  // Google Fonts encodes the identity of the file in its query string.
  if (url.hostname === 'fonts.googleapis.com') {
    const hash = crypto.createHash('sha1').update(url.search).digest('hex').slice(0, 10);
    p = `css/${hash}.css`;
  }
  // A few Weebly asset URLs genuinely end in a dot; keep them addressable.
  p = p.replace(/\.$/, '.bin').replace(/\/$/, '/index');
  return `${VENDOR}/${url.hostname}/${p}`;
}

const queue = new Map(); // localPath -> absolute remote URL
function enqueue(rawUrl) {
  const local = localPathFor(rawUrl);
  if (!local) return null;
  if (!queue.has(local)) queue.set(local, absolutise(rawUrl.split('#')[0]));
  return local;
}

// ---------------------------------------------------------------- discovery
const URL_IN_ATTR = /(?:src|href)\s*=\s*["']((?:https?:)?\/\/[^"'\s]+)["']/g;
const URL_IN_CSS = /url\(\s*["']?((?:https?:)?\/\/[^)"'\s]+)["']?\s*\)/g;
const IMPORT_IN_CSS = /@import\s+url\(\s*["']?((?:https?:)?\/\/[^)"'\s]+)["']?\s*\)/g;

for (const name of pages()) {
  const html = readPage(name);
  for (const re of [URL_IN_ATTR, URL_IN_CSS, IMPORT_IN_CSS]) {
    for (const m of html.matchAll(re)) enqueue(m[1]);
  }
}
const mainCss = fs.readFileSync(path.join(ROOT, 'files/main_style.css'), 'utf8');
for (const re of [URL_IN_CSS, IMPORT_IN_CSS]) for (const m of mainCss.matchAll(re)) enqueue(m[1]);

console.log(`discovered ${queue.size} vendorable URLs in markup`);

// ------------------------------------------------------------------ download
const failures = [];
async function download(local, remote) {
  const abs = path.join(ROOT, local);
  if (fs.existsSync(abs)) return fs.readFileSync(abs);
  const buf = await fetchBuffer(remote);
  if (!buf) {
    failures.push(`${remote}`);
    return null;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return buf;
}

/**
 * Downloaded stylesheets reference more assets. Walk them until nothing new
 * appears — the font stylesheets in particular are two levels deep.
 */
let wave = [...queue.entries()];
let round = 0;
while (wave.length) {
  round++;
  console.log(`  round ${round}: ${wave.length} files`);
  const next = new Map();
  await mapLimit(wave, 10, async ([local, remote]) => {
    const buf = await download(local, remote);
    if (!buf || !/\.css$/.test(local)) return;
    const css = buf.toString('utf8');
    for (const re of [URL_IN_CSS, IMPORT_IN_CSS]) {
      for (const m of css.matchAll(re)) {
        const child = localPathFor(m[1]);
        if (child && !queue.has(child)) {
          queue.set(child, absolutise(m[1].split('#')[0]));
          next.set(child, absolutise(m[1].split('#')[0]));
        }
      }
    }
    // Relative url() inside a mirrored stylesheet resolves by directory shape,
    // but the file still has to exist locally — pull those too.
    for (const m of css.matchAll(/url\(\s*["']?(?!data:|https?:|\/\/)([^)"'\s]+)["']?\s*\)/g)) {
      const childRemote = new URL(m[1].split('#')[0], remote).toString();
      const childLocal = localPathFor(childRemote);
      if (childLocal && !queue.has(childLocal)) {
        queue.set(childLocal, childRemote);
        next.set(childLocal, childRemote);
      }
    }
  });
  wave = [...next.entries()];
}

console.log(`vendored ${queue.size - failures.length}/${queue.size} files`);
if (failures.length) {
  console.log(`${failures.length} could not be fetched:`);
  for (const f of failures) console.log(`  ${f}`);
}

// ------------------------------------------------------------------- rewrite
/** Rewrite one absolute/protocol-relative URL to its vendored path. */
function rewriteUrl(rawUrl, fromDir) {
  const local = localPathFor(rawUrl);
  if (!local || !fs.existsSync(path.join(ROOT, local))) return null;
  const frag = rawUrl.includes('#') ? `#${rawUrl.split('#').slice(1).join('#')}` : '';
  const rel = path.relative(fromDir, local).split(path.sep).join('/');
  return rel + frag;
}

function rewriteText(text, fromDir) {
  return text
    .replace(URL_IN_ATTR, (whole, u) => {
      const r = rewriteUrl(u, fromDir);
      return r ? whole.replace(u, r) : whole;
    })
    .replace(/url\(\s*(["']?)((?:https?:)?\/\/[^)"'\s]+)\1\s*\)/g, (whole, q, u) => {
      const r = rewriteUrl(u, fromDir);
      return r ? `url(${q}${r}${q})` : whole;
    });
}

let changedPages = 0;
for (const name of pages()) {
  const before = readPage(name);
  const after = rewriteText(before, '.');
  if (after !== before) {
    writePage(name, after);
    changedPages++;
  }
}
console.log(`rewrote references in ${changedPages} pages`);

const cssBefore = mainCss;
const cssAfter = rewriteText(cssBefore, 'files');
if (cssAfter !== cssBefore) {
  fs.writeFileSync(path.join(ROOT, 'files/main_style.css'), cssAfter);
  console.log('rewrote references in files/main_style.css');
}

// Vendored stylesheets may themselves point at other vendored hosts.
for (const local of queue.keys()) {
  if (!/\.css$/.test(local)) continue;
  const abs = path.join(ROOT, local);
  if (!fs.existsSync(abs)) continue;
  const before = fs.readFileSync(abs, 'utf8');
  const after = rewriteText(before, path.dirname(local));
  if (after !== before) fs.writeFileSync(abs, after);
}
console.log('rewrote cross-references inside vendored stylesheets');
