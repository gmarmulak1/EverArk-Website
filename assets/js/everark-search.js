/**
 * Client-side site search.
 *
 * Weebly's header search posted to /apps/search, a service that no longer
 * exists for this site. The search box, its markup and its styling are
 * unchanged; only the destination moved. Results come from search-index.json,
 * which tools/migrate/06-build-search.mjs regenerates from the pages
 * themselves, so the index cannot drift from the content.
 */
(function () {
  'use strict';

  var results = document.getElementById('everark-search-results');
  var summary = document.getElementById('everark-search-summary');
  var input = document.getElementById('everark-search-input');
  if (!results) return;

  var query = new URLSearchParams(window.location.search).get('q') || '';
  if (input) input.value = query;

  if (!query.trim()) {
    summary.textContent = 'Enter a search term above.';
    return;
  }

  summary.textContent = 'Searching…';

  fetch('assets/search-index.json')
    .then(function (r) { return r.json(); })
    .then(function (pages) { render(rank(pages, query), query); })
    .catch(function () {
      summary.textContent = 'Search is temporarily unavailable.';
    });

  /**
   * Score each page by where the terms appear. Title matches outrank body
   * matches, and a page must contain every term to be listed at all - with a
   * corpus this size that is a better filter than any fuzzy ranking.
   */
  function rank(pages, q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var scored = [];

    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var title = page.title.toLowerCase();
      var body = page.text.toLowerCase();
      var score = 0;
      var matchedAll = true;

      for (var t = 0; t < terms.length; t++) {
        var term = terms[t];
        var inTitle = title.indexOf(term) !== -1;
        var occurrences = body.split(term).length - 1;
        if (!inTitle && occurrences === 0) { matchedAll = false; break; }
        score += (inTitle ? 25 : 0) + Math.min(occurrences, 10);
      }

      if (matchedAll) scored.push({ page: page, score: score, term: terms[0] });
    }

    return scored.sort(function (a, b) { return b.score - a.score; });
  }

  function render(hits, q) {
    if (!hits.length) {
      summary.textContent = 'No results for “' + q + '”.';
      return;
    }
    summary.textContent =
      hits.length + (hits.length === 1 ? ' result for “' : ' results for “') + q + '”.';

    var html = '';
    for (var i = 0; i < hits.length; i++) {
      var page = hits[i].page;
      html +=
        '<div class="everark-search-result">' +
        '<h2 class="wsite-content-title"><a href="' + escapeAttr(page.url) + '">' +
        escapeHtml(page.title) + '</a></h2>' +
        '<div class="paragraph">' + escapeHtml(excerpt(page, hits[i].term)) + '</div>' +
        '</div>';
    }
    results.innerHTML = html;
  }

  /** A snippet centred on the first matching term, falling back to the intro. */
  function excerpt(page, term) {
    var at = page.text.toLowerCase().indexOf(term);
    if (at === -1) return page.description || page.text.slice(0, 200) + '…';
    var start = Math.max(0, at - 90);
    return (start ? '…' : '') + page.text.slice(start, start + 220).trim() + '…';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var escapeAttr = escapeHtml;
})();
