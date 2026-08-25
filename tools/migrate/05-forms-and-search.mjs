/**
 * Step 5 — point the forms and the search box at something that exists.
 *
 * Both were broken the moment the site left Weebly: the five contact forms
 * POST to ///weebly/apps/formSubmit.php (note the empty host - the export
 * mangled it), and the header search GETs /apps/search.
 *
 * The markup, classes and styling are left alone so nothing moves on screen.
 * What changes is where a submission goes, and the field names, which were
 * opaque Weebly ids like _u340361517753725975[first]; they become readable
 * names so submissions arrive legible whatever provider ends up receiving
 * them.
 *
 * Forms are set up for Netlify Forms by default - no backend, detected from
 * the markup at deploy time - and assets/js/site-config.js switches them to
 * any other provider with one line.
 */
import { transformPages } from '../lib/refs.mjs';

/** Weebly field id -> readable name, inferred from the field's own label. */
function renameFields(formHtml) {
  const renames = new Map();

  // Name fields arrive as _u<id>[first] / _u<id>[last].
  for (const m of formHtml.matchAll(/name="(_u\d+)\[(first|last)\]"/g)) {
    renames.set(`${m[1]}[${m[2]}]`, `${m[2]}-name`);
  }

  // Everything else: take the label sitting above the input.
  const fieldBlocks = formHtml.split(/(?=<div class="wsite-form-field)/);
  for (const block of fieldBlocks) {
    const nameMatch = block.match(/name="(_u\d+)"/);
    if (!nameMatch) continue;
    const labelMatch = block.match(/<label class="wsite-form-label"[^>]*>([\s\S]*?)<\/label>/);
    const label = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, '').replace(/\*/g, '').trim() : '';
    const slug =
      /email/i.test(label) ? 'email'
      : label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .split('-')
          .slice(0, 4)
          .join('-') || nameMatch[1];
    renames.set(nameMatch[1], slug);
  }
  return renames;
}

/** A stable, human-readable form name from its submit button label. */
function formNameFrom(formHtml, pageName, index) {
  const label = formHtml.match(/<span class="wsite-button-inner">([\s\S]*?)<\/span>/);
  const text = label ? label[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || `${pageName.replace(/\.html$/, '')}-${index + 1}`;
}

const HONEYPOT =
  '\n\t\t<p class="everark-hp" style="position:absolute;left:-9999px" aria-hidden="true">' +
  '<label>Do not fill this in: <input name="bot-field" tabindex="-1" autocomplete="off" /></label></p>';

transformPages('migrate forms and search', (html, pageName) => {
  let out = html;

  // ------------------------------------------------------------- search
  out = out.replace(
    /<form id="wsite-header-search-form" action="\/apps\/search" method="get">/g,
    '<form id="wsite-header-search-form" action="search.html" method="get">',
  );

  // -------------------------------------------------------------- forms
  if (out.includes('formSubmit.php')) {
    let index = 0;
    out = out.replace(/<form[^>]*formSubmit\.php[^>]*>[\s\S]*?<\/form>/g, (formHtml) => {
      const name = formNameFrom(formHtml, pageName, index++);
      let form = formHtml;

      for (const [from, to] of renameFields(formHtml)) {
        form = form.split(`name="${from}"`).join(`name="${to}"`);
      }

      // Weebly's own plumbing: a subject it filled server-side, a version
      // marker, an "approved" flag and the element id it posted back.
      form = form.replace(/\s*<input type="hidden" name="wsite_subject"[^>]*\/?>/g, '');
      form = form.replace(/\s*<input type="hidden" name="form_version"[^>]*\/?>/g, '');
      form = form.replace(/\s*<input type="hidden" name="wsite_approved"[^>]*\/?>/g, '');
      form = form.replace(/\s*<input type="hidden" name="ucfid"[^>]*\/?>/g, '');
      form = form.replace(/\s*<input type="hidden" name="recaptcha_token"[^>]*\/?>/g, '');

      form = form.replace(
        /<form[^>]*>/,
        `<form name="${name}" method="POST" action="form-thank-you.html"` +
          ` data-netlify="true" netlify-honeypot="bot-field" data-everark-form` +
          ` id="${(formHtml.match(/id="([^"]+)"/) || [, name])[1]}">` +
          `\n\t\t<input type="hidden" name="form-name" value="${name}" />` +
          HONEYPOT,
      );
      return form;
    });
  }

  return out;
});
