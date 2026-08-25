/**
 * Byte-level HTML surgery.
 *
 * The export's markup is not well-formed (a stray <html> inside <head>, an
 * unclosed <hr>, duplicated element ids), so it is never parsed and re-emitted
 * here - a parser would silently "fix" those and change what the browser
 * renders. Every helper below finds an exact span and removes or replaces it,
 * leaving the remaining bytes identical.
 */

/** Remove each <script>...</script> whose body or attributes contain `marker`. */
export function dropScriptContaining(html, marker) {
  const re = /<script\b[^>]*>[\s\S]*?<\/script>|<script\b[^>]*\/>/gi;
  return html.replace(re, (block) => (block.includes(marker) ? '' : block));
}

/** Remove each <link ...> whose tag text contains `marker`. */
export function dropLinkContaining(html, marker) {
  return html.replace(/<link\b[^>]*>/gi, (tag) => (tag.includes(marker) ? '' : tag));
}

/** Remove an empty <div id="..."></div> placeholder. */
export function dropEmptyDiv(html, id) {
  const re = new RegExp(`<div\\s+id=["']${id}["']\\s*>\\s*</div>`, 'gi');
  return html.replace(re, '');
}

/**
 * Replace one JS statement inside inline scripts, e.g. dropping a single
 * assignment out of a larger config block without touching its neighbours.
 */
export function dropStatement(html, pattern) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (block, attrs, body) => {
    if (/\bsrc\s*=/i.test(attrs)) return block;
    const stripped = body.replace(pattern, '');
    return stripped === body ? block : `<script${attrs}>${stripped}</script>`;
  });
}

/** Collapse runs of blank lines left behind by removals. */
export function tidyBlankLines(html) {
  return html.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
}

/** Insert `snippet` immediately before </head>. Idempotent via `marker`. */
export function insertIntoHead(html, snippet, marker) {
  if (html.includes(marker)) return html;
  return html.replace(/<\/head>/i, `${snippet}\n\t</head>`);
}

/** Insert `snippet` immediately before </body>. Idempotent via `marker`. */
export function insertBeforeBodyEnd(html, snippet, marker) {
  if (html.includes(marker)) return html;
  return html.replace(/<\/body>/i, `${snippet}\n\t</body>`);
}
