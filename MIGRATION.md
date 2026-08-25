# Migrating EverArk off Weebly

The site began as a static export of the Weebly-hosted everark.io: 139 pages,
~1,900 assets, no build step.

**Phase 1** made it run standalone with no visible change. **Phase 2** made it
maintainable. This document records both — what changed, what was deliberately
left alone, and what is still open.

## The rule Phase 1 worked to

Preserve the design exactly. Remove Weebly only where it was load-bearing for
the site's ability to run, and verify every step rather than assume it.

Five harnesses enforce that:

| Command | What it proves |
| --- | --- |
| `npm run dev` | serves the site the way a static host would |
| `node tools/verify/links.mjs` | every local `href`, `src` and `url()` resolves — instant, offline |
| `node tools/verify/interactions.mjs` | 19 behavioural checks: navigation structure, search, form validation and submission |
| `node tools/verify/requests.mjs` | loads all 141 pages in a browser and proves none of them calls Weebly |
| `node tools/verify/capture.mjs <label>` then `compare.mjs <before> <after>` | screenshots every page at 1440 / 900 / 390 px and pixel-diffs two snapshots |

The results that matter: **417 screenshots, all pixel-identical to the
pre-change build at identical heights**, and **141 pages loaded in a browser
with zero requests to a Weebly host and zero failing local requests.**

Comparing against the live everark.io in a browser is not possible from this
environment, so each step is diffed against a snapshot of the step before it —
which is the stricter test anyway: it catches drift where it is introduced
rather than at the end. It earned its keep twice: once when removing `main.js`
silently broke the homepage carousel and hero, and once when removing the dead
video block shifted the whole homepage content column 180 px left.

## What the export was actually like

Worth stating plainly, because it shaped everything below.

- **731 referenced images were missing** while 858 unrelated ones sat flattened
  in the web root. Section backgrounds 404'd because `background-images/` was
  nested inside itself.
- **`files/theme/` had an extra `files/` level**, so all nine theme scripts and
  every `url()` in `main_style.css` pointed at nothing.
- **Every stylesheet, font and script came from `editmysite.com`**, most over
  plain `http://`.
- **The forms and the search box were broken.** Forms posted to
  `///weebly/apps/formSubmit.php` — note the empty host, mangled by the export.
- **Weebly's JSON-RPC endpoints 404'd on every page load.**

## What Phase 1 changed

Each numbered script in `tools/migrate/` is one step. They ran once, against
the raw export, and are kept as the record of what was changed and why —
`npm run build` is `tools/build/`, which renders `src/`.

### 1. Assets restored (`01`, `02`)

Referenced paths were restored from the live site so no markup had to change,
and the 858 orphans — referenced by nothing — moved to `_archive/`, out of the
web root. **They are export debris and can be deleted once you are satisfied
nothing needs them**; they are kept only because deleting someone's images
without asking is not ours to do.

312 Weebly-hosted files were vendored into `assets/vendor/`, mirroring host and
path so relative `url()`s inside the downloaded stylesheets keep resolving with
no rewriting. The bytes are unmodified, so this step is visually a no-op by
construction. Two upstream assets were already 404 on Weebly's own CDN and had
never been loading: the Muli font stylesheet and uikit's FontAwesome webfonts.

### 2. The Weebly backend removed (`03`)

Membership models, customer-accounts models, store configuration and the
JSON-RPC bootstrap — all of it calling endpoints that no longer exist. Member
registration and login were already disabled and there is no store, so nothing
here was reachable. Every global `main.js` still reads was left in place.

### 3. `main.js` kept, and why (`04`)

The obvious move is to delete Weebly's 481 KB `main.js`. It is the wrong move,
and it took an audit to see why.

Each page embeds marketplace "platform elements" — up to 28 of them — and every
one is gated on `document.documentElement.appReady`, which **only `main.js`
sets**. (It is the flag, not the `appReady` event, that does the work: `main.js`
is a blocking script in `<head>`, so by the time an element's inline script is
parsed the flag is already `1` and it takes the synchronous branch. Nothing ever
listens for the event.)

One of those elements is the site's mega-menu, which injects the `<style>` block
that governs how the dropdown navigation behaves on all 139 pages. Another is a
UIkit slideset with no base CSS anywhere in the repo — the carousel is built
entirely in JavaScript, and without it the homepage renders 40 stacked slides.
Others draw the SVG section dividers and size the full-width hero band, whose
`setWidth-full` width and offset likewise exist only as computed inline styles.
Remove `main.js` and all of it silently never runs: measured directly, the flag
stayed `0` and the hero lost its computed width.

Reimplementing Weebly's `PlatformElement` framework to host them is a component
overhaul, which Phase 1 rules out. So `main.js` stays — served from this
repository, not Weebly's CDN. There is no Weebly dependency at runtime; there
is still Weebly *code*, and replacing it is the first item in Phase 2.

What did go: the theme's licence enforcer (below), the reCAPTCHA placeholders
whose widget Weebly loaded from a backend that is gone, and the flyout
bootstrap's duplicated menu data, lifted once to `assets/nav.json`.

> **`baambooLicense.js` deserves its own note.** It reads `location.host` and,
> unless the host contains `editmysite.com`, `preview.` or
> `checkout.weebly.com`, fetches `/files/theme/key.lic` and — on anything but a
> valid signed response — appends a full-screen *"Please Verify Your Purchase
> License!"* overlay to the page. `key.lic` is not in the export and 404s on the
> live site too, so the check would fail on any domain this site moves to. It
> was dormant only because nothing ever called `baambooLicense()`; the theme's
> call site was in a Weebly template the export did not include. It is a loaded
> gun pointed at exactly this migration, so it is gone, along with `aes.js`,
> which existed solely to decrypt its licence file.

### 4. Forms and search (`05`, `06`)

Both were broken, so both were rebuilt behind unchanged markup.

**Forms** post to Netlify Forms by default — no backend, detected from the
markup at deploy time. To use a different provider, set `formEndpoint` in
`assets/js/site-config.js` and the runtime submits there over `fetch` instead.
Field names were opaque Weebly ids (`_u340361517753725975[first]`) and are now
readable (`first-name`, `email`), so submissions arrive legible whatever
receives them.

Weebly's forms have no visible submit control — the real `<input type=submit>`
is parked off-screen and the styled `<a class="wsite-button">` beside it is
wired up in JavaScript. `everark.js` reproduces that, plus the required-field
check, reusing Weebly's own `.form-input-error` class so an invalid field looks
exactly as it did.

**Search** runs against `assets/search-index.json`, generated from the pages
themselves on every build so it cannot drift. Only the body region is indexed;
including the header and footer would make every page match every query.

Both `search.html` and `form-thank-you.html` are generated from an existing
page (`tools/lib/page-template.mjs`) so they inherit the real header,
navigation and footer rather than an approximation.

> The export's existing `thank-you.html` confirms an **account cancellation**
> ("Your account will now be closed immediately, and your subscription
> cancelled"). Telling someone who just requested a demo that their account is
> closing would not be good, hence the separate `form-thank-you.html`.

### 5. Metadata and markup defects (`07`, `08`)

Fixed, none of it changing the design:

- A stray `<html itemscope>` tag inside `<head>` on 42 pages — the attributes
  moved to the real `<html>` element.
- The logo linked to `href=""`, which reloads the current page instead of going
  home.
- 22 YouTube embeds used `http://`, so browsers block them as mixed content and
  they render as empty boxes over https. Same for the rlets tracking script.
- The privacy policy's "Your Choices" links pointed at Weebly's *editor*; the
  anchor they meant is already on the page.
- Absolute `everark.io` self-links made relative, so they survive a domain
  change and work on preview deploys. Canonical, `og:` and JSON-LD URLs stay
  absolute on purpose.
- Universal Analytics fired twice per page on 59 pages, double-counting
  traffic. Raleway's stylesheet was linked six times per page, Open Sans twice.
- A `google-site-verification` meta tag whose curly quotes made it unparseable.

Added, none of which the site had: favicon, canonical URLs, `robots.txt`,
`sitemap.xml`, and host config that preserves Weebly's extensionless
`/blog/<slug>` URLs.

## Deliberately left alone

| | Why |
| --- | --- |
| **Termly** (`app.termly.io`) | Paints the consent banner, and the *entire body* of the two policy pages is a Termly iframe. Remove it and those pages render as header, blank, footer. Account-keyed, unaffected by the move. |
| **Gobot, Elfsight, Calendly** | All render UI, all account-keyed rather than Weebly-keyed. Gobot's URL contains `/weebly/<site id>/` but those are just lookup keys; it still resolves. |
| **GA4, Google Ads, GTM, SharpSpring, ActiveCampaign, Leadfeeder** | Measurement only, no DOM, domain-agnostic. |
| **`<a href="">` in the footer** | 560 anchors resolve to the current page. Pre-existing, invisible, and guessing intent for each is a content decision. |
| **`</hr>` and duplicate element ids** | Invalid but parser-tolerated; the browser builds an identical tree. |

### Known broken, not fixable here

**The homepage promo video.** Its embed builds an iframe whose document loads
`http:///weebly/apps/generateVideo.php` — an empty host, mangled by the export.
It renders nothing on the live Weebly site either, and the source video
(`everark_promo_video_final_2022-06-25_591.mp4`) is no longer retrievable from
Weebly. **Re-uploading it is a content task for whoever still has the file.**

Only the dead script lines were taken out of the iframe's source string, not
the block around them. Removing the block looked obviously right and was
wrong: it shifted the entire homepage content column 180 px left and cost
262 px of height, because the block occupies real vertical space and its
container is part of the section nesting that gives `.wsite-section-wrap` its
`display: table`. The pixel diff caught it.

**Two Weebly base paths survive inside JavaScript strings** — `ASSETS_BASE`
(Weebly's webpack publicPath) and each platform element's `assets_path`.
Neither is safely rewritable: only four of the twelve element asset
directories still exist upstream to vendor, so pointing them at local paths
would swap a dead reference for a 404. `tools/verify/requests.mjs` loads every
page and confirms neither ever becomes a real request. They go when `main.js`
goes.

## Deploying

The repository *is* the artefact — there is no bundler. `netlify.toml` sets
`publish = "."` and runs `npm run build`, which only regenerates derived files
(search index, sitemap, favicons) so they cannot go stale.

Before going live:

1. Set `SITE_ORIGIN` if the canonical domain is not `https://www.everark.io`,
   then re-run `npm run build`.
2. Point forms at their destination — Netlify Forms needs nothing; anything
   else is one line in `assets/js/site-config.js`.
3. Re-verify the Google Search Console property for the new host.
4. Update the GA4 data-stream URL if the domain changes.

## Phase 2 — what changed

Phase 1 left a site that worked but could not be edited: 141 pages each
carrying their own copy of the header, footer and `<head>`.

### The chrome now lives in one place

`src/` is the source; the root `.html` files are output. One file per page with
a front matter block, plus eight shared partials. See
[src/README.md](src/README.md).

The split was computed rather than guessed — the shared `<head>` block is grown
character by character until the pages actually disagree — and it found that
40.3 MB of HTML held 23.9 MB of real content. The footer alone, 74 KB, was
byte-identical on all 141 pages.

`tools/verify/roundtrip.mjs` is what makes that safe: every page is rebuilt
from `src/` and compared to the committed output **byte for byte**. A pixel
diff would not catch a dropped meta tag or a mangled analytics snippet.

### Social and structured data are generated

`tools/build/lib/seo.mjs` derives the Open Graph, Twitter and JSON-LD tags from
front matter. This was not cosmetic:

| | before | after |
| --- | --- | --- |
| pages with social tags | 42 | 141 |
| pages whose `og:url` pointed at another page | 40 | 0 |
| pages emitting `twitter:description` twice | 37 | 0 |

Sharing any of those 40 pages to Facebook or LinkedIn resolved to the wrong
content.

### Articles can be written in Markdown

```sh
npm run new-article "How to map a cemetery without losing a weekend"
```

Front matter drives the title, description, canonical, social card and
BlogPosting data. Drafts are skipped by the build. The 61 posts carried over
from Weebly are untouched — a legacy post inlines roughly 8 KB of font
declarations per heading widget, covering 40 font families of which the site
uses two; a Markdown article is its own text plus a 90-line stylesheet.

`assets/articles.json` lists every article, new and legacy, newest first.

### Images load when they are needed

Measured across eight pages, a large share of downloaded images rendered at
**0px** — mega-menu and hidden slider content, paid for on every page load.
Marking everything below the banner `loading="lazy"` means the browser skips
them until shown:

| page | before | after |
| --- | --- | --- |
| index.html | 119 images, 0.57 MB | 13 images, 0.25 MB |
| about-us.html | 58 images, 0.40 MB | 8 images, 0.13 MB |
| blog.html | 103 images, 0.12 MB | 6 images, 0.03 MB |

### CI

`.github/workflows/build.yml` builds on every push and fails if the committed
pages differ from a fresh build — which is what catches a page edited at the
root instead of in `src/` and silently reverted by the next deploy.

## Still open

1. **Replace `main.js`.** Still the one real piece of Weebly left, and still
   the largest single win available: ~481 KB plus jQuery 1.8.3, which is long
   out of support. Smaller than it looks once the gate is understood — the
   widget bootstraps do not wait on the `appReady` *event*; `main.js` is a
   blocking script in `<head>`, so by the time an element's inline script is
   parsed `document.documentElement.appReady` is already `1` and it takes the
   synchronous branch. Reproducing that needs a `<head>` script setting the
   flag plus a `platformElementRequire` shim supplying jQuery, a small `_`,
   and a `PlatformElement` base class. Of the widget types in use most extend
   `PlatformElement` with an empty body; the handful with real behaviour
   (mega-menu, tabs, accordion, carousel, hero sizing) are small enough to
   rewrite directly. Gate it on `tools/verify/` — that is what caught the
   first attempt.
2. **Responsive images.** Lazy loading took the easy win. What remains is
   resizing the 122 files wider than 1600px (29 MB) and emitting `srcset`.
   Doing it safely means measuring each image's rendered width in a browser
   first, because a wrong `sizes` attribute means a blurry image rather than
   a smaller one.
3. **The blog index.** `blog.html` is 2.85 MB of widget cards and
   `cemetery-blog-archives.html` another 3.2 MB, both hand-maintained.
   Generating them from `assets/articles.json` would make adding a post a
   one-file change — but their card layout would not survive unchanged, so
   this is a design decision rather than a refactor.
4. **A framework.** Astro fits this shape — content collections for the
   articles, components for the chrome, static HTML out. Worth doing *after*
   the above, because each of those is valuable on its own and none requires
   it.
