# src/ — the source of the site

The `.html` files at the repository root are **build output**. Edit them here
instead, then run `npm run build`.

```
src/
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
  "activeNavId": "853345144352077819",
  ...
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

A page's social tags currently live in a second comment block
(`<!--everark:social … -->`) directly after the front matter, carried over
verbatim from the export.

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

`tools/build/extract.mjs` is the script that produced this directory from the
built pages. It is kept as the record of how the split was derived.
