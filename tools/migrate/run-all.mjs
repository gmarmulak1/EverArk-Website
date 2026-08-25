/**
 * The one-time conversion of the Weebly export into this repository's shape.
 *
 * This is history, not the build. `npm run build` is tools/build/, which
 * renders src/ into the flat pages at the root. These steps ran once, against
 * the raw export, and are kept because they are the record of what was changed
 * and why — every step's header explains a decision that is otherwise
 * invisible in the result.
 *
 * Running them again would operate on the built output, which the next build
 * overwrites from src/. Don't, unless you are re-deriving the migration.
 *
 * Re-run the whole migration in order.
 *
 * Every step is idempotent, so this is safe to run against an already-migrated
 * tree: steps 1 and 2 only fetch what is missing, and the page rewrites detect
 * work they have already done. The derived files - search index, sitemap,
 * robots.txt, favicons - are regenerated from the pages every time, which is
 * why this doubles as the build command.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from '../lib/refs.mjs';

const STEPS = [
  ['01-restore-missing-assets.mjs', 'restore assets the export dropped'],
  ['02-vendor-external-assets.mjs', 'vendor Weebly-hosted assets'],
  ['03-remove-weebly-backend.mjs', 'remove the Weebly backend bootstrap'],
  ['04-trim-weebly-runtime.mjs', 'trim the Weebly runtime, layer on everark.js'],
  ['05-forms-and-search.mjs', 'repoint forms and search'],
  ['06-build-search.mjs', 'build the search index and page'],
  ['07-metadata-and-cleanup.mjs', 'metadata, sitemap, markup fixes'],
  ['08-build-favicon.mjs', 'generate favicons'],
];

for (const [script, label] of STEPS) {
  console.log(`\n### ${script} — ${label}`);
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'tools/migrate', script)], {
      stdio: 'inherit',
    });
  } catch (err) {
    // The favicon step needs Chromium, which a plain deploy container may not
    // have. The icons are committed, so carry on without them.
    if (script === '08-build-favicon.mjs') {
      console.warn('  skipped: no browser available; using the committed icons');
      continue;
    }
    throw err;
  }
}
console.log('\nmigration complete');
