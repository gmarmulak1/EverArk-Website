jQuery(function($) {
	// Interval loop
    $.fn.intervalLoop = function(condition, action, duration, limit) {
        var counter = 0;
        var looper = setInterval(function(){
            if (counter >= limit || $.fn.checkIfElementExists(condition)) {
                clearInterval(looper);
            } else {
                action();
                counter++;
            }
        }, duration);
    };
	// Check if element exists
    $.fn.checkIfElementExists = function(selector) {
        return $(selector).length;
    };

    // Slide fade toggle function
    $.fn.slideFadeToggle  = function(speed, callback) {
        return this.animate({
           opacity: 'toggle', 
           height: 'toggle'
        }, speed, callback);
    }; 
    var slickController = {
        init: function() {
            var base = this;
            base._buildSubMenu();
            base._detachLogin();
            base._moveLogin();
            setTimeout(function() {
                base._moveLogin();
            }, 500);
        },
        _buildSubMenu: function() {
            // Add class to nav items with subnav
            $('.wsite-menu-default').find('li.wsite-menu-item-wrap').each(function() {
                var $me = $(this);

                if ($me.children('.wsite-menu-wrap').length > 0) {

                    $me.addClass('has-submenu');
                    $('<span class="icon-caret"></span>').insertAfter($me.children('a.wsite-menu-item'));
                }
            });

            // Add class to subnav items with subnav
            $('.wsite-menu').find('li.wsite-menu-subitem-wrap').each(function() {
                var $me = $(this);

                if ($me.children('.wsite-menu-wrap').length > 0) {

                    $me.addClass('has-submenu');
                    $('<span class="icon-caret"></span>').insertAfter($me.children('a.wsite-menu-subitem'));
                }
            });

            // Keep subnav open if submenu item is active
            $('li.wsite-menu-subitem-wrap.wsite-nav-current').parents('.wsite-menu-wrap').addClass('open');

            // Subnav toggle
			 $('.has-submenu span.icon-caret').on('click', function() {
				 $(this).toggleClass('open')
				 var $me = $(this);

				 if ($me.siblings('.wsite-menu-wrap').hasClass('open')) {
					 $me.siblings('.wsite-menu-wrap').removeClass('open');
				 } else {
					 $me.siblings('.wsite-menu-wrap').addClass('open');
				 }
			});
        },
        _detachLogin: function() {
           var loginDetach = $('#member-login').detach();
            $('.mobile-nav .wsite-menu-default > li:last-child').after(loginDetach);
       },

        _moveLogin: function() {
           var base = this;
           if ($(window).width() <= 992) {
               $.fn.intervalLoop('.mobile-nav #member-login', base._detachLogin, 800, 5);
            }
        },
    };


    $(document).ready(function() {
        slickController.init();
    });
});
