/**
 * Prove the build is lossless: every page rebuilt from src/ must match the
 * committed page byte for byte.
 *
 * This is the check that makes the template extraction safe. Moving 16 MB of
 * duplicated chrome into shared partials is only defensible if the output is
 * provably unchanged, and "provably" has to mean bytes — a pixel diff would
 * not notice a dropped meta tag or a mangled analytics snippet.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../lib/refs.mjs';
import { buildAll, pageFiles } from '../build/render.mjs';

const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'everark-build-'));
buildAll(dest);

const mismatches = [];
for (const file of pageFiles()) {
  const built = fs.readFileSync(path.join(dest, file), 'utf8');
  const committedPath = path.join(ROOT, file);
  if (!fs.existsSync(committedPath)) {
    mismatches.push({ file, note: 'no committed page to compare against' });
    continue;
  }
  const committed = fs.readFileSync(committedPath, 'utf8');
  if (built === committed) continue;

  let i = 0;
  while (i < built.length && i < committed.length && built[i] === committed[i]) i++;
  mismatches.push({
    file,
    note: `first difference at byte ${i} (built ${built.length} B, committed ${committed.length} B)`,
    built: JSON.stringify(built.slice(i, i + 120)),
    committed: JSON.stringify(committed.slice(i, i + 120)),
  });
}

fs.rmSync(dest, { recursive: true, force: true });

console.log(`round-trip: ${pageFiles().length - mismatches.length}/${pageFiles().length} pages rebuild byte-identically`);
for (const m of mismatches.slice(0, 8)) {
  console.log(`\n  ${m.file}: ${m.note}`);
  if (m.committed) {
    console.log(`    committed: ${m.committed}`);
    console.log(`    built    : ${m.built}`);
  }
}
if (mismatches.length > 8) console.log(`\n  ...and ${mismatches.length - 8} more`);
process.exit(mismatches.length ? 1 : 0);
