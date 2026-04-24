function initBooGridBlog(a) {
    var b,
        c = getBlogPosts(a),
        d = getBlogPagers(a),
        e = window.location.hash;
    return e.length > 2 && e.indexOf("/") >= 0 ? ((e = e.substring(1)), ajaxLoadCategory(e)) : ((b = getBlogCategories(a)), booBlog(a, c, d, b)), !1;
}
function getFirstImage(a) {
    var b =
        (jQuery,
        a
            .find("img")
            .map(function () {
                return this.src;
            })
            .get());
    return b[0];
}
function getText(a) {
    var b = jQuery,
        c = b("<div></div>");
    return (
        a.find("div.paragraph").each(function () {
            c.append('<div class="paragraph">' + b(this).text() + "</div>");
        }),
        c.html()
    );
}
function checkDuplicateLink(a, b) {
    for (var c = 0, d = 0; d < a.length; d++) "link" == a[d][1] && c++;
    return !!c;
}
function ajaxLoadCategory(a) {
    var b = jQuery;
    b("#boo_blog_overlay").show(),
        b("#main").load(a + " #main #blog_content", function () {
            var c = b("#main"),
                d = getBlogPosts(c),
                e = getBlogPagers(c),
                f = getBlogCategories(c, a);
            booBlog(c, d, e, f), b("#boo_blog_content").masonry("reloadItems");
        });
}
function mansoryLoad(a) {
    var b = jQuery;
    b("#loading-new-posts").load(a + " #main #blog_content", function () {
        var c = b("#loading-new-posts"),
            d = getBlogPosts(c),
            e = getBlogPagers(c),
            f = getBlogCategories(c, a);
        booBlogMansory(c, d, e, f), c.html("");
    });
}
function getBlogPosts(a) {
    var b = jQuery,
        c = [];
    return (
        a.find(".blog-body .blog-post").each(function () {
            var a = b(this),
                d = a.find("h2.blog-title").text().trim(),
                e = a.find("h2.blog-title > a").attr("href"),
                f = getFirstImage(a.find(".blog-content")),
                g = getText(a.find(".blog-content")),
                h = a.find(".blog-date > .date-text").text(),
                i = a.find(".blog-comments").html();
            if (("undefined" == typeof f && (f = ""), !checkDuplicateLink(c, e))) {
                var j = new Array(d, e, f, g, h, i);
                c.push(j);
            }
        }),
        c
    );
}
function getBlogCategories(a, b) {
    var c = jQuery,
        d = [];
    return (
        a.find(".blog-category-list a").each(function () {
            var a = c(this),
                e = a.text().trim(),
                f = a.attr("href"),
                g = 0;
            if ((console.log(b), (("undefined" == typeof b && f.indexOf("/category/all") >= 0) || b == f) && (g = 1), !checkDuplicateLink(d, f))) {
                var h = new Array(e, f, g);
                d.push(h);
            }
        }),
        d
    );
}
function getBlogPagers(a) {
    var b,
        c = a.find(".blog-page-nav-previous a.blog-link").attr("href"),
        d = a.find(".blog-page-nav-next a.blog-link").attr("href");
    return (b = new Array(c, d));
}
function booBlog(a, b, c, d) {
    var e = '<div id="boo_new_blog_layout" class="clearfix">';
    if (((e += '\t<div id="boo_blog_overlay"></div>'), d.length)) {
        (e += '<div id="boo_blog_filter">'), (e += "\t<h2>Categories</h2>"), (e += "\t<ul>");
        for (var f = 0; f < d.length; f++)
            e += d[f][2]
                ? '\t\t<li class="current"><a href="#' + d[f][1] + '" onclick="ajaxLoadCategory(\'' + d[f][1] + "')\">" + d[f][0] + "</a></li>"
                : '\t\t<li><a href="#' + d[f][1] + '" onclick="ajaxLoadCategory(\'' + d[f][1] + "')\">" + d[f][0] + "</a></li>";
        (e += "\t</ul>"), (e += "</div>");
    }
    e += '\t<div id="boo_blog_content" class="clearfix">';
    for (var f = 0; f < b.length; f++)
        (e += '\t\t<div class="boo_blog_post">'),
            (e += '\t\t\t<div class="boo_blog_content">'),
            b[f][2] &&
                ((e += '\t\t\t<div class="boo_img_wrapper">'),
                (e += '\t\t\t\t<div class="boo_img">'),
                (e += '\t\t\t\t\t<a href="' + b[f][1] + '"><img src="' + b[f][2] + '" alt="' + b[f][0] + '" />'),
                (e += '\t\t\t\t\t<div class="galleryImage-overlay"></div></a>'),
                (e += "\t\t\t\t</div>"),
                (e += "\t\t\t</div>")),
            (e += '\t\t\t\t<div class="boo_header clearfix">'),
            (e += '\t\t\t\t\t<div class="boo_title"><a href="' + b[f][1] + '"><h1>' + b[f][0] + '</h1><div class="title_bg"></div></a></div>'),
            (e += '\t\t\t\t\t<div class="boo_short_desc">' + b[f][3] + "</div>"),
            (e += '\t\t\t\t\t<div class="boo_footer clearfix">'),
            (e += '\t\t\t\t\t\t<div class="boo_date">' + b[f][4] + "</div>"),
            (e += '\t\t\t\t\t\t<div class="boo_comments">' + b[f][5] + "</div>"),
            (e += "\t\t\t\t\t</div>"),
            (e += "\t\t\t\t</div>"),
            (e += "\t\t\t</div>"),
            (e += "\t\t</div>");
    (e += "\t</div>"),
        (e += '\t<div id="loading-new-posts"></div>'),
        (e += '\t<div id="boo_blog_pager" class="clearfix">'),
        (e += '\t\t<ul class="blog-page-nav clearfix">'),
        "undefined" != typeof c[0] && (e += '\t\t\t<li class="boo_blog_previous blog-page-nav-previous"><a href="' + c[0] + '"><span class="prev_ico"></span>Previous</a></li>'),
        (e += "\t\t</ul>"),
        (e += "\t</div>"),
        (e += '\t<div class="loadmore"><svg class="circular" viewBox="25 25 50 50"><circle class="path" cx="50" cy="50" r="20" fill="none" stroke-width="2" stroke-miterlimit="10"/></svg></div>'),
        (e += "</div>"),
        a.find("#blog_content").html(e);
}
function booBlogMansory(a, b, c, d) {
    for (var e = jQuery, f = "", g = 0; g < b.length; g++)
        (f += '\t\t<div class="boo_blog_post">'),
            (f += '\t\t\t<div class="boo_blog_content">'),
            b[g][2] &&
                ((f += '\t\t\t<div class="boo_img_wrapper">'),
                (f += '\t\t\t\t<div class="boo_img">'),
                (f += '\t\t\t\t\t<a href="' + b[g][1] + '"><img src="' + b[g][2] + '" alt="' + b[g][0] + '" />'),
                (f += '\t\t\t\t\t<div class="galleryImage-overlay"></div></a>'),
                (f += "\t\t\t\t</div>"),
                (f += "\t\t\t</div>")),
            (f += '\t\t\t\t<div class="boo_header clearfix">'),
            (f += '\t\t\t\t\t<div class="boo_title"><a href="' + b[g][1] + '"><h1>' + b[g][0] + '</h1><div class="title_bg"></div></a></div>'),
            (f += '\t\t\t\t\t<div class="boo_short_desc">' + b[g][3] + "</div>"),
            (f += '\t\t\t\t\t<div class="boo_footer clearfix">'),
            (f += '\t\t\t\t\t\t<div class="boo_date">' + b[g][4] + "</div>"),
            (f += '\t\t\t\t\t\t<div class="boo_comments">' + b[g][5] + "</div>"),
            (f += "\t\t\t\t\t</div>"),
            (f += "\t\t\t\t</div>"),
            (f += "\t\t\t</div>"),
            (f += "\t\t</div>");
    e(".loadmore").hide(), e("#boo_blog_content").append(f).masonry("reloadItems");
    var f = "";
    (f += '\t\t<ul class="blog-page-nav clearfix">'),
        "undefined" != typeof c[0] && (f += '\t\t\t<li class="boo_blog_previous blog-page-nav-previous"><a href="' + c[0] + '"><span class="prev_ico"></span>Previous</a></li>'),
        (f += "\t\t</ul>"),
        e("#boo_blog_pager").html(f);
}
