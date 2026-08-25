/**
 * Site-wide settings for the standalone EverArk build.
 *
 * These used to live inside Weebly's account configuration. Everything the
 * runtime needs to be pointed somewhere else is here, in one file.
 */
window.EVERARK_CONFIG = {
  /**
   * Where contact forms post.
   *
   * Empty string = Netlify Forms: the form posts to its own URL and Netlify
   * captures it from the `data-netlify` attribute baked into the markup. No
   * backend required, which is why it is the default.
   *
   * Set this to an absolute URL (Formspree, Basin, a Lambda, anything that
   * accepts a form POST) to use a different provider instead; the runtime will
   * submit there over fetch and honour formRedirect on success.
   */
  formEndpoint: '',

  /** Page shown after a successful submission. */
  formRedirect: 'thank-you.html',

  /** Results page for the header search box. */
  searchPage: 'search.html',
};
