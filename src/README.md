# src/ — the source of the site

The `.html` files at the repository root are **build output**. Edit them here
instead, then run `npm run build`.

```
src/
  site.json             site-wide values: name, origin, social handle, default image
  pages/<slug>.html     one file per page: front matter, then its content
  partials/             the chrome every page shares
```

## Pages

Each page starts with a front matter block — an HTML comment, so the file is
still valid HTML and editors highlight it normally:

```html
<!--everark
{
  "slug": "about-us",
  "title": "About Our Team | Cemetery Software - EVERARK",
  "description": "...",
  "activeNavId": "853345144352077819"
}
-->
<div id="banner">…the page's own content…</div>
```

Everything after the front matter is the page's own markup: its banner and its
body, from the end of the header to the start of the footer. The header, the
footer, the `<head>` boilerplate and the end-of-body scripts all come from
`partials/`.

### Front matter

| Field | What it does |
| --- | --- |
| `slug` | the output filename, and substituted into `bodyClass` |
| `title`, `description`, `keywords` | the `<head>` meta block |
| `canonical` | the canonical URL |
| `robots` | optional; only the generated utility pages set it |
| `schemaWebpage` | adds `itemscope itemtype` to `<html>` |
| `activeNavId` | which top-level nav item is marked current |
| `currentSubnavId` | which submenu item is marked current, when the page is one |
| `bodyClass` | the body classes, with `{slug}` substituted |
| `partials` | overrides, e.g. `{"header": "header-no-banner"}` |
| `social` | overrides for the social card: `title`, `description`, `image`, `type` |
| `jsonLd` | structured-data blocks for this page, as authored |
| `extraHead` | anything else this page needs in `<head>`, verbatim |

### Social and structured data

Open Graph, Twitter and structured-data tags are **generated** by
`tools/build/lib/seo.mjs` — a page does not write its own. In the export, 81 of
141 pages had no social tags at all, and of the 42 that did, 40 carried an
`og:url` pointing at a different page. Deriving the tags from the same front
matter that drives the rest of the `<head>` means a page cannot disagree with
itself, and a new page gets correct tags without anyone remembering to add
them.

Set `social.title` only when a page wants a shorter card title than its
`<title>`; everything else falls back to the page's own description and the
site image.

`extraHead` exists because one page's social block turned out to contain a
`<style>` rule hiding its form's required-field label. Anything the extractor
did not recognise is kept verbatim rather than dropped.

## Partials

| File | Size | Notes |
| --- | --- | --- |
| `footer.html` | 74 KB | identical on all 141 pages |
| `head.html` | 17 KB | everything between the meta block and the social tags; `{{activeNavId}}` is substituted |
| `header.html` | 16 KB | the header and both navigation copies |
| `header-no-banner.html` | 16 KB | same, with the `clearfix` the nine banner-less pages use |
| `tail.html` | 6 KB | end-of-body scripts |
| `tail-search.html` | 6 KB | same, plus the search page's own script |
| `head-tail.html` | 370 B | chat widget and favicon links |
| `body-open.html` | 55 B | the `<body>` tag and wrapper |

## Why this is safe

`npm run verify` rebuilds every page and compares it to the committed output
**byte for byte**. Splitting 16 MB of duplicated chrome out of 141 pages is
only defensible if the result is provably unchanged, and a pixel diff would not
catch a dropped meta tag or a mangled analytics snippet.

When a change to the templates is *meant* to alter the output — the SEO tags
were — the round-trip check fails until the rebuilt pages are committed. Verify
those with the screenshot harness first.

`tools/build/extract.mjs` is the script that produced `pages/` and `partials/`
from the built pages, and `tools/migrate/09-extract-social.mjs` lifted the
social values into front matter. Both are kept as the record of how this
directory was derived.
