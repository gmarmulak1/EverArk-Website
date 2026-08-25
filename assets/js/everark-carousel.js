/**
 * The carousel, rewritten.
 *
 * Two pages carry a "slideset": the feature strip on the homepage and the
 * screenshot tour on the features page. Both were driven by a Weebly
 * marketplace element weighing 141 KB per page — 39 KB of UIkit 2.27.4 core
 * and slideset component inlined into the markup, 70 KB of settings blob, and
 * the PlatformElement wrapper around them — gated on a readiness flag only
 * Weebly's 481 KB main.js sets. This file replaces all of that. It has no
 * dependencies: no jQuery, no UIkit, no platform runtime.
 *
 * It is a reimplementation, not a redesign. The behaviour below is what the
 * original did, measured in a browser rather than inferred, and
 * tools/verify/carousel-probe.mjs re-measures it so the two can be compared
 * field by field. Where a choice looked arbitrary it was kept anyway — the
 * animation's per-item stagger, the min-height lock during a transition, the
 * body overflow-x clamp — because matching the original exactly is the whole
 * point and each of those is load-bearing for how the swap looks.
 *
 * The stylesheets stay: uikit.css, dotnav.css and slidenav.css are already
 * vendored per element and provide the grid widths, the animation keyframes,
 * the dots and the arrows. Only the JavaScript is ours.
 *
 * Configuration comes from data attributes on .boo-slideset-wrapper, written
 * by tools/migrate/10-replace-slideset.mjs from the settings blob the
 * platform element used to carry.
 */
(function () {
  'use strict';

  /**
   * Widest first. The original walked these in order and took the first whose
   * media query was live, which is why `small` — rewritten by this theme to
   * min-width:0 — acts as the floor rather than a phone-only case.
   */
  var BREAKPOINTS = ['xlarge', 'large', 'medium', 'small'];

  /** Distance in px past which a touch drag counts as a swipe. UIkit's value. */
  var SWIPE_THRESHOLD = 30;

  function toInt(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  /** Split a flat list into consecutive groups of `size`; the last may be short. */
  function chunk(items, size) {
    var sets = [];
    if (size < 1) return sets;
    for (var i = 0; i < items.length; i += size) sets.push(items.slice(i, i + size));
    return sets;
  }

  /** jQuery's .height(): the content box, excluding padding and border. */
  function contentHeight(el) {
    var cs = getComputedStyle(el);
    return el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  }

  /** Every ancestor matching `selector`, which is what jQuery's .parents() gives. */
  function ancestors(el, selector) {
    var found = [];
    for (var node = el.parentElement; node; node = node.parentElement) {
      if (node.matches(selector)) found.push(node);
    }
    return found;
  }

  function Carousel(wrapper) {
    this.wrapper = wrapper;
    this.list = wrapper.querySelector('ul.uk-slideset');
    this.nav = wrapper.querySelector('ul.uk-slideset-nav');
    this.filterNav = wrapper.querySelector('.boo-subnav-filter');
    if (!this.list) return;

    var d = wrapper.dataset;
    this.options = {
      total: toInt(d.total, Infinity),
      animation: d.animation || 'fade',
      duration: toInt(d.duration, 200),
      // The original fell back to half the duration only when delay was
      // explicitly false; both live instances set it, so this is just the
      // same rule written out.
      delay: d.delay === 'false' ? Math.floor(toInt(d.duration, 200) / 2) : toInt(d.delay, 0),
      autoplay: d.autoplay === 'true',
      autoplayInterval: toInt(d.autoplayInterval, 7000),
      pauseOnHover: d.pauseOnHover !== 'false',
      filterTags: d.filterTags || '',
      alphabetical: d.alphabetical === 'true',
      perView: {
        default: toInt(d.perView, 1),
        xlarge: toInt(d.perViewXlarge, null),
        large: toInt(d.perViewLarge, null),
        medium: toInt(d.perViewMedium, null),
        small: toInt(d.perViewSmall, null),
      },
    };

    this.activeSet = false;
    this.animating = false;
    this.generation = 0;
    this.hovering = false;
    this.visible = null;
    this.currentFilter = '';
    this.lastWidth = 0;

    this.prepare();
    this.bind();
    this.update();
    this.lastWidth = document.documentElement.clientWidth;
    this.resize();
    if (this.options.autoplay) this.start();
  }

  Carousel.prototype = {
    /**
     * The one-off DOM fixes the element did before handing over to UIkit.
     *
     * Trimming slides past `total` is the important one: the export ships
     * forty placeholder slides per instance and deletes the unused ones at
     * runtime. They are stripped at build time now — which is why the pages
     * no longer carry "Add Your Title" eighty-one times over, or feed it to
     * the site search index — but the guard stays so adding a slide back
     * still behaves.
     */
    prepare: function () {
      var options = this.options;
      var items = [].slice.call(this.list.children);

      items.forEach(function (li) {
        if (toInt(li.dataset.item, -1) >= options.total) {
          li.parentNode.removeChild(li);
          return;
        }
        // "Above the picture" layout: the call-to-action button is authored
        // below the image and moved above it.
        var button = li.querySelector('.for-btp .boo-slideset-button');
        if (button && li.querySelector('.boo-slideset-atp')) {
          var main = li.querySelector('.for-atp .boo-slideset-main');
          if (main) main.appendChild(button);
        }
      });

      if (this.filterNav) {
        var tags = options.filterTags.split(',');
        if (options.alphabetical) {
          tags = tags.sort().filter(function (tag) { return tag !== ''; });
        }
        var nav = this.filterNav;
        tags.forEach(function (tag) {
          var li = document.createElement('li');
          li.className = 'filter-item';
          li.setAttribute('data-uk-filter', tag);
          li.innerHTML = '<a href="#"></a>';
          li.firstChild.textContent = tag;
          nav.appendChild(li);
        });
      }

      [].forEach.call(this.wrapper.querySelectorAll('.link-new-tab-1 a'), function (a) {
        a.setAttribute('target', '_blank');
      });

      // The "no image yet" placard hides as soon as any slide has a picture.
      if (this.wrapper.querySelector('.boo-slideset-img img[src]:not([src=""])')) {
        [].forEach.call(this.wrapper.querySelectorAll('.boo-slideset-note'), function (note) {
          note.style.display = 'none';
        });
      }

      if (document.querySelector('.slideset-hovereffect-style5')) {
        [].forEach.call(document.querySelectorAll('.slideset-hovereffect-style5 .boo-slideset-img img'), function (img) {
          img.setAttribute('style', 'width:calc(100% + 50px)');
        });
      }

      if (this.wrapper.querySelector('.slideset-arrow-position-bottom')) {
        this.wrapper.style.paddingBottom = '50px';
      }

      // UIkit derived the responsive widths from these classes rather than
      // from CSS written for the slideset, so they have to go on before
      // anything is measured.
      this.list.classList.add('uk-grid-width-1-' + options.perView.default);
      var list = this.list;
      BREAKPOINTS.forEach(function (bp) {
        if (options.perView[bp]) list.classList.add('uk-grid-width-' + bp + '-1-' + options.perView[bp]);
      });
    },

    bind: function () {
      var self = this;

      this.wrapper.addEventListener('click', function (event) {
        var control = event.target.closest('[data-uk-slideset-item]');
        if (!control || !self.wrapper.contains(control)) return;
        event.preventDefault();
        if (self.animating) return;
        var to = control.getAttribute('data-uk-slideset-item');
        if (to === 'next') self.next();
        else if (to === 'previous') self.previous();
        else self.show(parseInt(to, 10));
      });

      this.wrapper.addEventListener('click', function (event) {
        var control = event.target.closest('[data-uk-filter]');
        if (!control || !self.wrapper.contains(control)) return;
        if (control.parentNode === self.list) return;
        event.preventDefault();
        var filter = control.getAttribute('data-uk-filter') || '';
        if (self.animating || self.currentFilter === filter) return;
        self.updateFilter(filter);
        self.hide().then(function () { self.update(true, true); });
      });

      this.wrapper.addEventListener('mouseenter', function () {
        if (self.options.pauseOnHover) self.hovering = true;
      });
      this.wrapper.addEventListener('mouseleave', function () { self.hovering = false; });

      this.bindSwipe();

      var pending = null;
      window.addEventListener('resize', function () {
        clearTimeout(pending);
        pending = setTimeout(function () {
          self.update();
          // Widths are recomputed only when the window actually changed
          // width: on mobile browsers the address bar collapsing fires resize
          // with the same width, and re-running the offset maths there made
          // the original jump.
          if (self.lastWidth !== document.documentElement.clientWidth) {
            self.resize();
            self.lastWidth = document.documentElement.clientWidth;
          }
        }, 100);
      });
    },

    bindSwipe: function () {
      var self = this;
      var start = null;

      this.wrapper.addEventListener('touchstart', function (event) {
        var touch = event.touches[0];
        start = { x: touch.pageX, y: touch.pageY };
      }, { passive: true });

      this.wrapper.addEventListener('touchend', function (event) {
        if (!start) return;
        var touch = event.changedTouches[0];
        var dx = start.x - touch.pageX;
        var dy = start.y - touch.pageY;
        start = null;
        if (Math.abs(dx) <= SWIPE_THRESHOLD && Math.abs(dy) <= SWIPE_THRESHOLD) return;
        if (Math.abs(dx) < Math.abs(dy)) return;
        if (dx > 0) self.next();
        else self.previous();
      }, { passive: true });
    },

    /**
     * How many slides share the viewport right now.
     *
     * Measured, not hard-coded: a probe element is given each breakpoint's
     * half-width class in turn and the first one that actually resolves to
     * half of 100px wins. That keeps the breakpoints defined by uikit.css,
     * exactly as they were, instead of restating 1220/960/768 here where they
     * could drift out of step with the stylesheet.
     */
    perView: function () {
      var options = this.options.perView;
      var probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;height:1px;top:-1000px;width:100px';
      var child = document.createElement('div');
      probe.appendChild(child);
      document.body.appendChild(probe);

      var match = null;
      BREAKPOINTS.forEach(function (bp) {
        if (match || !options[bp]) return;
        probe.className = 'uk-grid-width-' + bp + '-1-2';
        if (Math.round(child.getBoundingClientRect().width) === 50) match = bp;
      });

      probe.parentNode.removeChild(probe);
      return options[match] || options.default;
    },

    /** Slides that pass the current filter, in document order. */
    items: function () {
      var children = [].slice.call(this.list.children);
      if (!this.currentFilter) return children;
      var wanted = this.currentFilter.split(',').map(function (s) { return s.trim(); });
      return children.filter(function (li) {
        var own = li.getAttribute('data-uk-filter');
        if (!own) return false;
        var tags = own.split(',').map(function (s) { return s.trim(); });
        return wanted.some(function (tag) { return tags.indexOf(tag) > -1; });
      });
    },

    /**
     * Undo everything a transition puts on the DOM.
     *
     * Needed because a transition can be abandoned half-way — a resize during
     * an autoplay tick is enough — and what it leaves behind is an item stuck
     * at opacity 0 with an animation class, plus a pinned wrapper height.
     */
    reset: function (items) {
      var name = 'uk-animation-' + this.options.animation;
      items.forEach(function (li) {
        li.classList.remove(name, 'uk-animation-reverse');
        li.style.opacity = '';
        li.style.animationDelay = '';
        li.style.animationDuration = '';
      });
      document.body.style.overflowX = '';
      this.wrapper.style.minHeight = '';
    },

    /** Re-group the slides, rebuild the dots, and land on the first set. */
    update: function (animate, force) {
      var was = this.visible;
      this.visible = this.perView();
      if (was === this.visible && !force) return;

      this.children = [].slice.call(this.list.children);
      // Abandon any transition still running. Without this, show() below
      // would bail on `animating` and leave the carousel blank — every slide
      // hidden, which is what a resize mid-fade used to do.
      this.generation++;
      this.animating = false;
      this.reset(this.children);
      this.children.forEach(function (li) { li.style.display = 'none'; });
      this.sets = chunk(this.items(), this.visible);

      if (this.nav) {
        // Rebuilt from scratch every time, not topped up: the number of sets
        // changes with the breakpoint — thirteen slides are three dots at
        // desktop width and thirteen on a phone — so a resize has to be able
        // to shrink the dot list as well as grow it.
        this.nav.textContent = '';
        for (var i = 0; i < this.sets.length; i++) {
          var dot = document.createElement('li');
          dot.setAttribute('data-uk-slideset-item', String(i));
          dot.innerHTML = '<a></a>';
          this.nav.appendChild(dot);
        }
        this.nav.classList.toggle('uk-invisible', this.nav.children.length === 1);
      }

      this.activeSet = false;
      this.show(0, !animate);
    },

    updateFilter: function (filter) {
      this.currentFilter = filter;
      var self = this;
      [].forEach.call(this.wrapper.querySelectorAll('[data-uk-filter]'), function (control) {
        if (control.parentNode === self.list) return;
        control.classList.toggle('uk-active', (control.getAttribute('data-uk-filter') || '') === filter);
      });
    },

    show: function (index, noAnimate, direction) {
      if (this.activeSet === index || this.animating) return;
      if (!this.sets[index]) return;

      var self = this;
      var from = this.sets[this.activeSet] || [];
      var to = this.sets[index];
      direction = direction || (index < this.activeSet ? -1 : 1);

      this.animating = true;
      var generation = this.generation;
      if (this.nav) {
        [].forEach.call(this.nav.children, function (dot, i) {
          dot.classList.toggle('uk-active', i === index);
        });
      }

      var swap = noAnimate ? Promise.resolve() : this.animate(from, to, direction);
      swap.then(function () {
        // An update() while this was in flight has already rebuilt the sets
        // and the dots; landing on stale indexes now would undo it.
        if (self.generation !== generation) return;
        self.children.forEach(function (li) {
          li.style.display = 'none';
          li.classList.remove('uk-active');
        });
        to.forEach(function (li) {
          li.classList.add('uk-active');
          li.style.display = '';
          li.style.opacity = '';
        });
        self.animating = false;
        self.activeSet = index;
      });
    },

    /** Animate the current set out, used when the filter changes under it. */
    hide: function () {
      var self = this;
      this.animating = true;
      return this.animate(this.sets[this.activeSet] || [], [], 1).then(function () {
        self.animating = false;
      });
    },

    /**
     * Cross-fade one set to the next, item by item.
     *
     * The outgoing slides are faded in reverse, one every `delay` ms; when the
     * last of them finishes the incoming set is staggered in the same way. The
     * wrapper's height is pinned for the duration so the page does not jolt
     * while both sets are mid-flight, and the body's horizontal overflow is
     * clamped so a slide animating in from the side cannot widen the
     * document. Both are carried over from the original; the height pin
     * matters for the fade this site uses, the overflow clamp only for the
     * sliding animations the widget also offers.
     */
    animate: function (from, to, direction) {
      var self = this;
      var name = 'uk-animation-' + this.options.animation;
      var delay = this.options.delay;
      var duration = this.options.duration;
      // A transition is a chain of timers and animation events spread over
      // about a second. If update() rebuilds the sets while that chain is in
      // flight, every callback still queued is holding stale slides — and one
      // of them hides its outgoing set, which is how a resize mid-fade left
      // the carousel showing half a row. Each step checks it is still the
      // current generation before touching anything.
      var generation = this.generation;
      var stale = function () { return self.generation !== generation; };

      if (from[0] === to[0]) return Promise.resolve();

      // Nothing to animate if nothing is on screen. The homepage strip is
      // hidden above 960px by the FlexiBox around it, and animating there is
      // not merely wasted: `animationend` never fires inside a display:none
      // subtree, so the original jammed on its first autoplay tick and left
      // `overflow-x: hidden` on the body for the rest of the visit. Swapping
      // the sets outright keeps the state honest and touches nothing global.
      if (this.wrapper.offsetParent === null) return Promise.resolve();

      return new Promise(function (resolve) {
        self.wrapper.style.minHeight = contentHeight(self.wrapper) + 'px';
        document.body.style.overflowX = 'hidden';

        var release = function () {
          if (!stale()) {
            document.body.style.overflowX = '';
            self.wrapper.style.minHeight = '';
          }
          resolve();
        };

        var reveal = function () {
          if (stale()) return release();
          from.forEach(function (li) {
            li.style.display = 'none';
            li.classList.remove(name, 'uk-animation-reverse');
            li.style.opacity = '';
            li.style.animationDelay = '';
            li.style.animationDuration = '';
          });

          if (!to.length) return release();

          to.forEach(function (li, i) {
            var target = to[direction === 1 ? i : to.length - 1 - i];
            target.style.animationDelay = i * delay + 'ms';
          });

          var settled = false;
          var finish = function () {
            if (settled) return;
            settled = true;
            if (stale()) return release();
            to.forEach(function (li) {
              li.classList.remove(name);
              li.style.opacity = '';
              li.style.display = '';
              li.style.animationDelay = '';
              li.style.animationDuration = '';
            });
            release();
          };

          to.forEach(function (li) { li.classList.add(name); });
          var last = to[direction === 1 ? to.length - 1 : 0];
          last.addEventListener('animationend', finish, { once: true });
          to.forEach(function (li) { li.style.display = ''; });
          // Deliberately `length * delay * 2` and not the animation's own
          // duration. On a one-slide set that cuts the fade off at 200 ms
          // rather than letting it run its 500 — which is what the original
          // did, and mobile is exactly where a single slide shows, so
          // "fixing" it would change how every phone sees the carousel.
          setTimeout(finish, to.length * delay * 2);
        };

        to.forEach(function (li) { li.style.animationDuration = duration + 'ms'; });

        if (!from.length) return reveal();

        from.forEach(function (li) { li.style.animationDuration = duration + 'ms'; });
        var lastOut = from[direction === 1 ? from.length - 1 : 0];
        var startedReveal = false;
        var beginReveal = function () {
          if (startedReveal) return;
          startedReveal = true;
          reveal();
        };

        lastOut.addEventListener('animationend', beginReveal, { once: true });
        // The original had no timeout here, and paid for it: animationend
        // never fires inside a display:none container, so above 960px — where
        // the homepage strip is hidden by its FlexiBox — the widget jammed
        // with `animating` stuck true and ignored every later click. Nothing
        // is on screen to look different; it just stops wedging.
        setTimeout(beginReveal, from.length * delay + duration + 50);

        from.forEach(function (li, i) {
          var target = from[direction === 1 ? i : from.length - 1 - i];
          setTimeout(function () {
            if (stale()) return;
            target.style.display = 'none';
            target.style.display = '';
            target.style.opacity = 0;
            target.addEventListener('animationend', function () {
              target.classList.remove(name);
            }, { once: true });
            target.classList.add(name, 'uk-animation-reverse');
          }, i * delay);
        });
      });
    },

    next: function () {
      this.show(this.sets[this.activeSet + 1] ? this.activeSet + 1 : 0, false, 1);
    },

    previous: function () {
      this.show(this.sets[this.activeSet - 1] ? this.activeSet - 1 : this.sets.length - 1, false, -1);
    },

    start: function () {
      var self = this;
      this.stop();
      this.timer = setInterval(function () {
        if (!self.hovering && !self.animating) self.next();
      }, this.options.autoplayInterval);
    },

    stop: function () {
      if (this.timer) clearInterval(this.timer);
    },

    /**
     * Break the carousel out of its column.
     *
     * A slideset can be told to span the whole viewport (`setWidth-full`) or
     * the whole content area (`setWidth-fit`) while still sitting inside a
     * narrower column, which it does by measuring where it landed and pulling
     * itself left by that much. The homepage strip is `setWidth-fit`; the
     * features tour is plain and only gets the height released.
     */
    resize: function () {
      var wrapper = this.wrapper;
      ancestors(wrapper, '.wsite-section').forEach(function (section) {
        section.style.height = 'unset';
      });

      var full = wrapper.classList.contains('setWidth-full');
      var fit = wrapper.classList.contains('setWidth-fit');
      if (!full && !fit) return;

      var parent = wrapper.parentElement;
      var parentLeft = parent.getBoundingClientRect().left + window.pageXOffset;
      var width;
      var offset;

      if (full) {
        width = document.documentElement.clientWidth;
        offset = -Math.abs(parentLeft);
      } else {
        var host = ancestors(wrapper, '.wsite-elements.wsite-not-footer')[0];
        var box = host && host.parentElement;
        if (!box) return;
        var rect = box.getBoundingClientRect();
        width = rect.width;
        offset = -Math.abs(parentLeft - (rect.left + window.pageXOffset));
      }

      wrapper.style.width = width + 'px';
      wrapper.style.left = offset + 'px';

      ancestors(wrapper, '.wsite-section').forEach(function (el) { el.style.display = 'block'; });
      ancestors(wrapper, '.wsite-section-wrap').forEach(function (el) { el.style.display = 'block'; });
    },
  };

  function init() {
    [].forEach.call(document.querySelectorAll('[data-everark-carousel]'), function (wrapper) {
      new Carousel(wrapper);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
