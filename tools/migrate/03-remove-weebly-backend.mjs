/**
 * Step 3 — cut the Weebly backend out of every page.
 *
 * Each page boots Weebly's membership and customer-accounts models, declares an
 * online store, and registers JSON-RPC endpoints under /ajax/api/. None of it
 * can work off Weebly: the site has member registration and login disabled, no
 * store, and the RPC endpoints return 404 on every page load today.
 *
 * The theme runtime that remains does still read a handful of globals
 * (ASSETS_BASE, STYLE_PREFIX, securePrefix, configDomain, recaptchaUrl,
 * IS_ARCHIVE), so those stay. Everything removed here is either dead or
 * actively erroring.
 */
import { transformPages } from '../lib/refs.mjs';
import {
  dropScriptContaining,
  dropLinkContaining,
  dropEmptyDiv,
  dropStatement,
  tidyBlankLines,
} from '../lib/html.mjs';

transformPages('remove weebly backend', (html) => {
  let out = html;

  // The two RPC model bootstraps and the scripts that consume them. These are
  // what produce the /ajax/api/JsonRPC 404s on load.
  out = dropScriptContaining(out, 'initCustomerAccountsModels');
  out = dropScriptContaining(out, 'initMembershipModels');
  out = dropScriptContaining(out, 'main-membership-site.js');
  out = dropScriptContaining(out, 'main-customer-accounts-site.js');
  out = dropEmptyDiv(out, 'customer-accounts-app');
  out = dropEmptyDiv(out, 'dialog-region');

  // Membership stylesheet: nothing on the site renders member UI.
  out = dropLinkContaining(out, 'site_membership.css');

  // Store configuration for a store that does not exist.
  out = dropScriptContaining(out, 'com_currentSite');
  out = dropScriptContaining(out, 'allowMemberRegistration');

  // _W.relinquish is an editor hand-off hook; STATIC_BASE is read by nothing.
  out = dropScriptContaining(out, '_W.relinquish');
  out = dropStatement(out, /^\s*var STATIC_BASE = '[^']*';\s*$/m);
  out = dropStatement(out, /^\s*_W\.themePlugins = \[\];\s*$/m);

  return tidyBlankLines(out);
});
