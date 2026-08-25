/**
 * EverArk site runtime.
 *
 * Takes over the two things Weebly's main.js can no longer do now that the
 * site is hosted independently: submit a contact form, and run a search.
 * Both pointed at Weebly services that stopped existing - formSubmit.php and
 * /apps/search - so both were simply broken.
 *
 * main.js still loads, from this repository rather than Weebly's CDN, because
 * it hosts the marketplace "platform elements" embedded throughout the pages,
 * including the mega-menu that draws the site's dropdown navigation. Replacing
 * that is Phase 2; see MIGRATION.md.
 *
 * Because main.js is still there, it still has its own delegated handlers on
 * .wsite-button clicks and on the search button. This file loads after it and
 * binds directly to those elements, so its handlers run first (target phase
 * before bubble phase) and stop the event before Weebly's can act on it.
 */
(function () {
  'use strict';

  var config = window.EVERARK_CONFIG || {};

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
    if (event) {
      event.preventDefault();
      // Weebly's own handler is delegated from the form; stop the event here
      // so it never reaches /apps/search.
      event.stopImmediatePropagation();
    }
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
        // main.js delegates its own .wsite-button handler from <form>; this
        // runs first and keeps the event from reaching it.
        event.stopImmediatePropagation();
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
        window.location.href = config.formRedirect || 'form-thank-you.html';
      })
      .catch(function () {
        if (trigger) trigger.textContent = original;
        window.alert('Sorry, your message could not be sent. Please email hello@everark.io instead.');
      });
  }

  // ------------------------------------------------------------- bootstrap

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
