/**
 * EverArk site runtime.
 *
 * Replaces the parts of Weebly's 481 KB main.js that this site actually used.
 * The rest of that bundle - the store, membership, the editor bridge, the
 * JSON-RPC client, the gallery and dialog systems - was dead code here, and
 * the endpoints behind it stopped existing when the site left Weebly.
 *
 * Three jobs remain:
 *   1. relocateFlyoutMenus - reproduce the navigation DOM Weebly built.
 *   2. wireSearch          - send the header search to a local results page.
 *   3. wireForms           - submit contact forms without formSubmit.php.
 *
 * Depends on jQuery only for ordering: the theme's own custom.js runs on
 * jQuery's ready queue and must observe the same DOM Weebly left it, so this
 * file registers its handler first. Everything else here is plain DOM.
 */
(function () {
  'use strict';

  var config = window.EVERARK_CONFIG || {};

  /**
   * Weebly lifted every top-level submenu out of the desktop navigation and
   * parked it in a #wsite-menus container on <body>, which the theme hides
   * outright (`#wsite-menus { display: none }` in main_style.css). The visible
   * dropdowns come from the theme's own mega-menu, not from these.
   *
   * That sounds like something to simply delete, but it is load-bearing: the
   * theme's custom.js decorates any nav item that still contains a submenu
   * with a caret and an accordion toggle. Leaving the submenus in place would
   * put carets in the desktop header that have never been there. So the move
   * is reproduced exactly, and it has to happen before custom.js runs.
   */
  function relocateFlyoutMenus() {
    var menu = document.querySelector('.menu-hidden .wsite-menu-default');
    if (!menu) return;

    var host = document.getElementById('wsite-menus');
    if (!host) {
      host = document.createElement('div');
      host.id = 'wsite-menus';
      document.body.appendChild(host);
    }

    var items = menu.children;
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      if (li.tagName !== 'LI') continue;

      li.classList.add('wsite-nav-' + (i + 1));
      li.style.position = 'relative';

      var link = li.querySelector(':scope > a.wsite-menu-item');
      if (link) link.style.position = 'relative';

      var wrap = li.querySelector(':scope > .wsite-menu-wrap');
      if (wrap) {
        wrap.style.display = 'none';
        wrap.style.position = 'absolute';
        host.appendChild(wrap);
      }
    }
  }

  /** The header search box used to hit Weebly's /apps/search service. */
  function wireSearch() {
    var forms = document.querySelectorAll('#wsite-header-search-form');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      form.setAttribute('action', config.searchPage || 'search.html');
      form.setAttribute('method', 'get');

      // The magnifier is a <span>, not a submit control.
      var button = form.parentNode.querySelector('.wsite-search-button');
      if (button) {
        button.addEventListener('click', submitOwnForm.bind(null, form));
      }
    }
  }

  function submitOwnForm(form, event) {
    if (event) event.preventDefault();
    var input = form.querySelector('.wsite-search-input');
    if (input && input.value.trim()) form.submit();
  }

  // ---------------------------------------------------------------- forms

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /**
   * Weebly's forms have no visible submit control: the real <input type=submit>
   * is parked off-screen and the styled <a class="wsite-button"> next to it is
   * wired up in JavaScript. Reproduced here, along with the required-field
   * check, reusing Weebly's own .form-input-error class so an invalid field
   * looks exactly as it always did.
   */
  function wireForms() {
    var forms = document.querySelectorAll('form[data-everark-form]');
    for (var i = 0; i < forms.length; i++) attachForm(forms[i]);
  }

  function attachForm(form) {
    var trigger = form.querySelector('a.wsite-button');
    if (trigger) {
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('tabindex', '0');
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.submit();
      });
      trigger.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          trigger.click();
        }
      });
    }

    form.addEventListener('submit', function (event) {
      if (!validate(form)) {
        event.preventDefault();
        return;
      }
      // With no explicit endpoint the browser posts the form as-is, which is
      // what Netlify Forms expects. Anything else goes over fetch so we can
      // control the redirect.
      if (config.formEndpoint) {
        event.preventDefault();
        postTo(form, config.formEndpoint);
      }
    });
  }

  function fieldsOf(form) {
    return form.querySelectorAll('input[aria-required="true"], textarea[aria-required="true"], select[aria-required="true"]');
  }

  function validate(form) {
    var fields = fieldsOf(form);
    var firstBad = null;

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var value = (field.value || '').trim();
      var bad = !value || (isEmail(field) && !EMAIL.test(value));

      field.classList.toggle('form-input-error', bad);
      setMessage(field, bad ? (isEmail(field) && value ? 'Please enter a valid email address.' : 'This field is required.') : null);
      if (bad && !firstBad) firstBad = field;
    }

    if (firstBad) {
      firstBad.focus();
      firstBad.scrollIntoView({ block: 'center' });
      return false;
    }
    return true;
  }

  function isEmail(field) {
    var label = field.closest('.wsite-form-field');
    return field.type === 'email' || (label && /email/i.test(label.textContent || ''));
  }

  /** Reuse the per-field instructions slot Weebly already renders. */
  function setMessage(field, text) {
    var wrapper = field.closest('.wsite-form-field');
    if (!wrapper) return;
    var slot = wrapper.querySelector('.wsite-form-instructions');
    if (!slot) return;

    if (slot.dataset.originalHtml === undefined) {
      slot.dataset.originalHtml = slot.innerHTML;
      slot.dataset.originalDisplay = slot.style.display || '';
    }

    if (text) {
      slot.innerHTML = '';
      slot.textContent = text;
      slot.style.color = 'red';
      slot.style.display = 'block';
    } else {
      slot.innerHTML = slot.dataset.originalHtml;
      slot.style.color = '';
      slot.style.display = slot.dataset.originalDisplay;
    }
  }

  function postTo(form, endpoint) {
    var trigger = form.querySelector('a.wsite-button .wsite-button-inner');
    var original = trigger ? trigger.textContent : null;
    if (trigger) trigger.textContent = 'Sending…';

    fetch(endpoint, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        window.location.href = config.formRedirect || 'thank-you.html';
      })
      .catch(function () {
        if (trigger) trigger.textContent = original;
        window.alert('Sorry, your message could not be sent. Please email hello@everark.io instead.');
      });
  }

  // ------------------------------------------------------------- bootstrap

  // custom.js decorates the navigation on jQuery's ready queue, so the
  // relocation has to be queued ahead of it - exactly the order Weebly had.
  if (window.jQuery) {
    window.jQuery(relocateFlyoutMenus);
  } else {
    document.addEventListener('DOMContentLoaded', relocateFlyoutMenus);
  }

  function start() {
    wireSearch();
    wireForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
