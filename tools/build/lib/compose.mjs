/**
 * Rebuild a page from src/.
 *
 * The inverse of decompose(). Everything it emits is either a shared partial
 * or a value from the page's front matter, so a page can only differ from its
 * neighbours in ways that are written down.
 */
import { applyActiveNav } from './page.mjs';
import { renderSeo } from './seo.mjs';

/** Whitespace between the <html> tag and <head>, identical on every page. */
const PRE_HEAD = '\n\t';

const SCHEMA_ATTRS = ' itemscope itemtype="https://schema.org/Webpage"';

/**
 * The title/description/keywords block.
 *
 * The odd trailing newline when there are no keywords is not decoration — it
 * is what the export emits, and reproducing it is what lets the round-trip
 * check compare bytes rather than something looser.
 */
export function renderHeadMeta({ title, description, keywords }) {
  let out = `\n\t\t<title>${title}</title>\n`;
  if (description != null) out += `<meta name="description" content="${description}" />\n`;
  if (keywords != null) out += `<meta name="keywords" content="${keywords}" />\n`;
  else out += '\n';
  return out;
}

export function compose({ data, content }, partials, site) {
  const pick = (name) => {
    const chosen = data.partials && data.partials[name];
    return partials[chosen || name];
  };

  const header = applyActiveNav(pick('header'), data);
  const head = partials.head.split('{{activeNavId}}').join(data.activeNavId);
  const bodyOpen = partials['body-open'].split('{{bodyClass}}').join(
    data.bodyClass.split('{slug}').join(data.slug),
  );

  return (
    '<!DOCTYPE html>\n' +
    `<html lang="en"${data.schemaWebpage ? SCHEMA_ATTRS : ''}>` +
    PRE_HEAD +
    '<head>' +
    renderHeadMeta(data) +
    head +
    renderSeo(data, site) +
    partials['head-tail'] +
    (data.robots || '') +
    data.canonical +
    '</head>' +
    bodyOpen +
    header +
    content +
    pick('footer') +
    pick('tail')
  );
}
