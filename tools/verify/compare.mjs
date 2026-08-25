/**
 * Pixel-diff the local build against the live Weebly site and write an HTML
 * report. This is the evidence for "no visible difference" — every claim about
 * the migration being visually neutral is checked here rather than by eye.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ROOT } from '../lib/refs.mjs';

const SHOTS = path.join(ROOT, 'tools/verify/shots');
const OUT = path.join(ROOT, 'tools/verify/report');
const THRESHOLD = Number(process.env.THRESHOLD || 0.05);
const [BEFORE, AFTER] = process.argv.slice(2, 4);

if (!BEFORE || !AFTER) {
  console.error('usage: compare.mjs <before-label> <after-label>');
  process.exit(1);
}
for (const label of [BEFORE, AFTER]) {
  if (!fs.existsSync(path.join(SHOTS, label))) {
    console.error(`missing snapshot: tools/verify/shots/${label} - run capture.mjs ${label} first`);
    process.exit(1);
  }
}

fs.mkdirSync(OUT, { recursive: true });
const names = fs
  .readdirSync(path.join(SHOTS, BEFORE))
  .filter((f) => f.endsWith('.png') && fs.existsSync(path.join(SHOTS, AFTER, f)))
  .sort();

/** Pad both images to a common canvas so a height change is a diff, not a crash. */
function pad(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  out.data.fill(255);
  PNG.bitblt(png, out, 0, 0, Math.min(png.width, width), Math.min(png.height, height), 0, 0);
  return out;
}

const rows = [];
for (const name of names) {
  const a = PNG.sync.read(fs.readFileSync(path.join(SHOTS, BEFORE, name)));
  const b = PNG.sync.read(fs.readFileSync(path.join(SHOTS, AFTER, name)));
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const pa = pad(a, width, height);
  const pb = pad(b, width, height);
  const diff = new PNG({ width, height });
  const changed = pixelmatch(pa.data, pb.data, diff.data, width, height, {
    threshold: 0.18,
    includeAA: false,
    alpha: 0.2,
  });
  const pct = (changed / (width * height)) * 100;
  if (pct > THRESHOLD) fs.writeFileSync(path.join(OUT, `diff--${name}`), PNG.sync.write(diff));
  rows.push({
    name,
    pct,
    heightDelta: b.height - a.height,
    pass: pct <= THRESHOLD,
  });
}

rows.sort((x, y) => y.pct - x.pct);
const failed = rows.filter((r) => !r.pass);

console.log(`compared ${rows.length} screenshots — ${rows.length - failed.length} within ${THRESHOLD}%, ${failed.length} over`);
for (const r of rows.slice(0, 25)) {
  console.log(`  ${r.pass ? 'ok  ' : 'DIFF'} ${r.pct.toFixed(3).padStart(8)}%  h${r.heightDelta >= 0 ? '+' : ''}${r.heightDelta}  ${r.name}`);
}

fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>EverArk visual diff</title>
<style>body{font:14px/1.5 system-ui;margin:2rem;background:#111;color:#eee}
table{border-collapse:collapse;width:100%}td,th{padding:.4rem .6rem;border-bottom:1px solid #333;text-align:left}
.bad{color:#ff8080}.good{color:#7ddc7d}img{max-width:100%;border:1px solid #444}</style>
<h1>${BEFORE} &rarr; ${AFTER}</h1>
<p>${rows.length} screenshots, threshold ${THRESHOLD}% changed pixels. ${failed.length} over.</p>
<table><tr><th>screenshot</th><th>changed</th><th>height delta</th></tr>
${rows.map((r) => `<tr><td>${r.name}</td><td class="${r.pass ? 'good' : 'bad'}">${r.pct.toFixed(3)}%</td><td>${r.heightDelta}</td></tr>`).join('\n')}
</table>
${failed.map((r) => `<h2>${r.name} — ${r.pct.toFixed(3)}%</h2><img src="diff--${r.name}">`).join('\n')}`,
);
console.log(`report: ${path.relative(ROOT, path.join(OUT, 'index.html'))}`);
process.exit(failed.length ? 1 : 0);
