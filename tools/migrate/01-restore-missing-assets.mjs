/**
 * Step 1 — restore the assets the Weebly export dropped.
 *
 * The export shipped ~858 images flattened into the repository root while every
 * page still references them under uploads/1/0/7/5/107572223/{,editor/,published/}.
 * Rather than guess which flat file maps to which reference, we take the live
 * site as ground truth and download each missing path into the exact location
 * the markup already asks for. Nothing in the HTML has to change.
 *
 * Re-running only fetches what is still absent.
 */
import { localRefs, exists, fetchBuffer, writeFileEnsured, mapLimit, LIVE_ORIGIN } from '../lib/refs.mjs';

const missing = [...localRefs().keys()].filter((r) => !exists(r)).sort();
console.log(`${missing.length} referenced assets are missing from disk`);

let ok = 0;
const failed = [];
await mapLimit(missing, 12, async (rel) => {
  const buf = await fetchBuffer(`${LIVE_ORIGIN}/${rel}`);
  if (!buf || buf.length === 0) {
    failed.push(rel);
    return;
  }
  writeFileEnsured(rel, buf);
  ok++;
  if (ok % 50 === 0) console.log(`  restored ${ok}/${missing.length}`);
});

console.log(`restored ${ok}, still missing ${failed.length}`);
if (failed.length) {
  console.log('unresolved:');
  for (const f of failed) console.log(`  ${f}`);
}
