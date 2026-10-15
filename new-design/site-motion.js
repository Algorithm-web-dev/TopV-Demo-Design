(function () {
  if (window.__tvMotion) return; window.__tvMotion = true;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;
  var EASE = 'cubic-bezier(.22,.8,.3,1)';
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target; io.unobserve(el);
      var d = parseFloat(el.dataset.tvDelay || '0');
      setTimeout(function () {
        if (el.dataset.tvKind === 'head') { el.style.clipPath = 'inset(0 0 -12% 0)'; el.style.transform = ''; setTimeout(function(){ el.style.clipPath = ''; el.style.transition = ''; }, 1000); }
        else { el.style.opacity = '1'; el.style.transform = ''; setTimeout(function(){ el.style.opacity = ''; el.style.transform = ''; el.style.transition = el.dataset.tvT || ''; }, 800); }
      }, d);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  function below(el) { var r = el.getBoundingClientRect(); return r.top > window.innerHeight * 0.9; }
  function prepHead(el) {
    if (el.dataset.tvKind || el.dataset.headReveal || el.closest('[data-hc-section]') || !below(el)) return;
    el.dataset.tvKind = 'head';
    el.style.clipPath = 'inset(0 0 100% 0)'; el.style.transform = 'translateY(0.35em)';
    el.style.transition = 'clip-path .9s cubic-bezier(.65,0,.2,1), transform .9s ' + EASE;
    io.observe(el);
  }
  function prepItem(el, i) {
    if (el.dataset.tvKind || !below(el)) return;
    el.dataset.tvKind = 'item'; el.dataset.tvDelay = String((i % 4) * 80);
    el.style.opacity = '0'; el.style.transform = 'translateY(22px)';
    el.dataset.tvT = el.style.transition || ''; var t = el.style.transition ? el.style.transition + ', ' : '';
    el.style.transition = t + 'opacity .7s ' + EASE + ', transform .7s ' + EASE;
    io.observe(el);
  }
  var ITEMS = '[data-pc],[data-cons-card],[data-logo-tile],[data-product-card],[data-svc-grid] > a,[data-t-card],[data-story-img],[data-detail-image],[data-blog-cta]';
  function scan() {
    document.querySelectorAll('section h2').forEach(prepHead);
    var groups = new Map();
    document.querySelectorAll(ITEMS).forEach(function (el) {
      var p = el.parentElement; var n = groups.get(p) || 0; groups.set(p, n + 1); prepItem(el, n);
    });
  }
  function boot() { setTimeout(scan, 400); setTimeout(scan, 1500); }
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot);
  var mo = new MutationObserver(function () { clearTimeout(mo._t); mo._t = setTimeout(scan, 250); });
  window.addEventListener('load', function () { mo.observe(document.body, { childList: true, subtree: true }); });
})();
