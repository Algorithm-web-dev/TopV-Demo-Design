(function () {
  if (window.__tvSearch) return;
  window.__tvSearch = true;

  var PAGES = [
    { name: 'Vending Machines', sub: 'Snack, drink and combo machines', href: 'Vending Machines.dc.html' },
    { name: 'Hot Beverage Solutions', sub: 'Bean to cup, fresh brew and instant', href: 'Hot Beverage Solutions.dc.html' },
    { name: 'Water Solutions', sub: 'Plumbed-in, under-counter and bottled', href: 'Water Solutions.dc.html' },
    { name: 'Payment Solutions', sub: 'Cashless, card and mobile payment', href: 'Payment Solutions.dc.html' },
    { name: 'Recycling', sub: 'Shredding and compacting stations', href: 'Recycling.dc.html' },
    { name: 'Consumables', sub: 'Coffee, tea, cups, sugar and cleaning', href: 'Consumables.dc.html' },
    { name: 'Rentals', sub: 'Rental programme and quote request', href: 'Rentals.dc.html' },
    { name: 'About', sub: 'Who we are and how we work', href: 'About.dc.html' },
    { name: 'Our Clients', sub: 'Companies we supply nationwide', href: 'Clients.dc.html' },
    { name: 'Blog', sub: 'Insights and articles', href: 'Blog.dc.html' },
    { name: 'Contact', sub: 'Enquiries, quotes and service calls', href: 'Contact.dc.html' },
    { name: 'Technical Support', sub: 'Log a service call', href: 'Contact.dc.html#type=service' },
    { name: 'Get a Free Quote', sub: 'Build a quote list and send it', href: 'Contact.dc.html#quote' },
  ];

  var MACHINES = [
    ['Palma Hz70', 'Vending Machines', 'Standard combo vending machine'],
    ['Palma Hz87', 'Vending Machines', 'High capacity combo vending machine'],
    ['Palma Hz87 Premium', 'Vending Machines', 'Premium combo vending machine'],
    ['CV1000', 'Vending Machines', 'Large combo vending machine'],
    ['CV4000 with Touchscreen', 'Vending Machines', 'Combo machine with cart functionality'],
    ['Vision Esplus Bluetec', 'Vending Machines', 'Multi-product dispensing machine'],
    ['Smart Fridge', 'Vending Machines', 'Weight-sensing fresh food fridge'],
    ['Smart Freezer', 'Vending Machines', 'Weight-sensing frozen food freezer'],
    ['Orion G23', 'Hot Beverage Solutions', 'Fresh bean brewer'],
    ['Jetinno JL33', 'Hot Beverage Solutions', 'Dual grinders, 10.1 inch touchscreen'],
    ['Gaggia Milano La Brillante', 'Hot Beverage Solutions', 'Bean to cup plus two instants'],
    ['Azkoyen Vitro X1', 'Hot Beverage Solutions', 'Fresh bean brewer with milk fridge'],
    ['Saeco Magic', 'Hot Beverage Solutions', 'Compact fresh bean brewer'],
    ['NEOQs', 'Hot Beverage Solutions', 'Espresso and fresh leaf tea'],
    ['Novara DFB', 'Hot Beverage Solutions', 'Double fresh brew, free standing'],
    ['ZEN', 'Hot Beverage Solutions', 'Fully automatic fresh bean machine'],
    ['Ascaso + Grinder', 'Hot Beverage Solutions', 'Barista machine with grinder'],
    ['FW Bar Classe', 'Water Solutions', 'Premium water cooler'],
    ['P1 Bar Series E', 'Water Solutions', 'Stylish, efficient, high flow'],
    ['P1 Bar Series B', 'Water Solutions', 'Stylish, efficient, high flow'],
    ['Campione Tower - 2 or 3 Way Tap', 'Water Solutions', 'Where space is limited'],
    ['Waterlogic 7', 'Water Solutions', 'Up to 5 types of water'],
    ['Waterlogic 2', 'Water Solutions', 'Cold and ambient, up to 30 users'],
    ['Waterlogic 100', 'Water Solutions', 'Economical cold and ambient'],
    ['The River', 'Water Solutions', 'Stainless steel cold water dispenser'],
    ['Legend Classic', 'Water Solutions', 'Manually refilled, cold, ambient and hot'],
    ['VPos Touch Bank Card Device', 'Payment Solutions', 'All-in-one cashless bank payments'],
    ['Onyx Contactless Bank Card Device', 'Payment Solutions', 'Sleek tap-and-go contactless reader'],
    ['Engine Electronic Cashless System', 'Payment Solutions', 'Multi-standard cashless and cash management'],
    ['Jofemar JF8 Coin Changer', 'Payment Solutions', 'Eight coin tube changer'],
    ['Creos Bill Validator', 'Payment Solutions', 'Nine optical reading signals'],
    ['Jofemar BT11 Bill Validator', 'Payment Solutions', 'Optical and magnetic banknote reader'],
    ['Engine Telemetry System', 'Payment Solutions', 'Real-time remote machine monitoring'],
    ['Tritech Shredder', 'Recycling', 'Automatic cup shredding machine']
  ];

  var CAT_PAGE = {
    'Vending Machines': 'Vending Machines.dc.html',
    'Hot Beverage Solutions': 'Hot Beverage Solutions.dc.html',
    'Water Solutions': 'Water Solutions.dc.html',
    'Payment Solutions': 'Payment Solutions.dc.html',
    'Recycling': 'Recycling.dc.html'
  };

  var CONSUMABLES = ['Jacobs Kronung', 'Nescafe Classic', 'Ricoffy', 'HOC Ciro Café Oro Espresso', 'Nescafe Espresso Bean', 'Nestle Hot Chocolate', 'Ciro Hot Chocolate', 'Cremora', 'Cremora Bulk', 'Nestle Creamer', 'Nestle Skimmed Milk Powder', 'Fresh Milk', 'Freshpak Rooibos', 'Rooibos Leaf TV Vending', 'Five Roses', 'Five Roses Vending Tea', 'Nestle Nestea Instant Tea', 'Vending Sugar', 'Brown sugar sachets', 'White sugar sachets', 'Canderel', 'Canderel Yellow Sticks', 'Coffee Cups 250ml', 'Cup Lids', 'Ripple Cups Black 250ml', 'Plain White Cooler Cup 175ml', 'Wooden Stirrers', 'Plastic Stick Stirrers', 'Plastic Teaspoons', 'Liquid Descaler', 'Acidic Milk Cleaner', 'Milk System Cleaner', 'Dish Cloth', 'Bleach', 'Dishwash Gel'];

  var POSTS = [
    ['Arabica or robusta for commercial coffee machines', 'Coffee Vending'],
    ['Convenience at your fingertips with Top Vending', 'Vending Machines'],
    ['Renting vs. Buying', 'Business']
  ];

  var INDEX = [];
  MACHINES.forEach(function (m) {
    INDEX.push({ group: 'Machines', name: m[0], sub: m[1] + ' · ' + m[2], href: CAT_PAGE[m[1]] + '#product=' + encodeURIComponent(m[0]) });
  });
  CONSUMABLES.forEach(function (c) {
    INDEX.push({ group: 'Consumables', name: c, sub: 'Consumables price list', href: 'Consumables.dc.html#pricelist' });
  });
  POSTS.forEach(function (p, i) {
    INDEX.push({ group: 'Blog', name: p[0], sub: p[1] + ' · Blog article', href: 'Blog Post.dc.html#post=' + i });
  });
  PAGES.forEach(function (p) {
    INDEX.push({ group: 'Pages', name: p.name, sub: p.sub, href: p.href });
  });

  var overlay, input, results, open = false;

  function build() {
    overlay = document.createElement('div');
    overlay.setAttribute('data-tv-search-overlay', '1');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:400;background:rgba(20,20,18,0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:none;align-items:flex-start;justify-content:center;padding:90px 20px 20px;box-sizing:border-box;font-family:Inter,system-ui,sans-serif;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#FFFFFF;border-radius:20px;width:100%;max-width:680px;box-shadow:0 30px 80px rgba(0,0,0,0.3);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100vh - 130px);';

    var top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:14px;padding:20px 22px;border-bottom:1px solid #E1E4E8;';
    top.innerHTML = '<svg width="19" height="19" viewBox="0 0 17 17" fill="none" stroke="#6B6B68" stroke-width="1.8" stroke-linecap="round" style="flex-shrink:0"><circle cx="7.2" cy="7.2" r="5.1"></circle><line x1="11.2" y1="11.2" x2="15.4" y2="15.4"></line></svg>';

    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search machines, consumables, blog and pages';
    input.style.cssText = 'flex:1;border:none;outline:none;font-family:Inter,system-ui,sans-serif;font-size:17px;color:#1C1C1A;background:transparent;';
    top.appendChild(input);

    var close = document.createElement('button');
    close.setAttribute('aria-label', 'Close search');
    close.innerHTML = '<span style="display:block;transform:translateY(-1px);">&times;</span>';
    close.style.cssText = 'display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid #E1E4E8;background:#FFFFFF;color:#6B6B68;border-radius:50%;font-family:Inter,system-ui,sans-serif;font-size:20px;line-height:1;cursor:pointer;padding:0;flex-shrink:0;';
    close.addEventListener('mouseenter', function () { close.style.borderColor = '#C8102E'; close.style.color = '#C8102E'; });
    close.addEventListener('mouseleave', function () { close.style.borderColor = '#E1E4E8'; close.style.color = '#6B6B68'; });
    close.addEventListener('click', function () { setOpen(false); });
    top.appendChild(close);

    results = document.createElement('div');
    results.style.cssText = 'overflow:auto;padding:10px;';

    panel.appendChild(top);
    panel.appendChild(results);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) { if (e.target === overlay) setOpen(false); });
    input.addEventListener('input', function () { render(input.value); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(!open); }
    });
    render('');
  }

  function score(item, q) {
    var n = item.name.toLowerCase(), s = (item.sub || '').toLowerCase();
    if (n === q) return 100;
    if (n.indexOf(q) === 0) return 80;
    if (n.indexOf(q) > -1) return 60;
    if (s.indexOf(q) > -1) return 30;
    var parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every(function (p) { return (n + ' ' + s).indexOf(p) > -1; })) return 20;
    return 0;
  }

  function render(q) {
    var query = (q || '').trim().toLowerCase();
    results.innerHTML = '';
    var list;
    if (!query) {
      list = INDEX.filter(function (i) { return i.group === 'Pages'; }).slice(0, 8);
      addHeading('Browse');
      list.forEach(addRow);
      return;
    }
    list = INDEX.map(function (i) { return { i: i, s: score(i, query) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .map(function (r) { return r.i; })
      .slice(0, 24);

    if (!list.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:28px 16px;color:#6B6B68;font-size:15px;';
      empty.textContent = 'No results for "' + q.trim() + '". Try a machine name, a consumable, a blog topic, or a page.';
      results.appendChild(empty);
      return;
    }
    ['Machines', 'Consumables', 'Blog', 'Pages'].forEach(function (g) {
      var rows = list.filter(function (i) { return i.group === g; });
      if (!rows.length) return;
      addHeading(g);
      rows.forEach(addRow);
    });
  }

  function addHeading(text) {
    var h = document.createElement('div');
    h.textContent = text;
    h.style.cssText = 'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9AA0A6;font-weight:700;padding:14px 14px 8px;';
    results.appendChild(h);
  }

  function addRow(item) {
    var a = document.createElement('a');
    a.href = item.href;
    a.style.cssText = 'display:flex;align-items:baseline;gap:12px;padding:12px 14px;border-radius:12px;text-decoration:none;color:#1C1C1A;';
    a.addEventListener('mouseenter', function () { a.style.background = '#F4F6F8'; });
    a.addEventListener('mouseleave', function () { a.style.background = 'transparent'; });
    var n = document.createElement('span');
    n.textContent = item.name;
    n.style.cssText = 'font-size:15.5px;font-weight:600;';
    var s = document.createElement('span');
    s.textContent = item.sub || '';
    s.style.cssText = 'font-size:13px;color:#6B6B68;';
    a.appendChild(n);
    a.appendChild(s);
    results.appendChild(a);
  }

  function setOpen(state) {
    if (!overlay) build();
    open = state;
    overlay.style.display = state ? 'flex' : 'none';
    if (state) {
      input.value = '';
      render('');
      setTimeout(function () { input.focus(); }, 30);
    }
  }

  window.TVSearch = { open: function () { setOpen(true); }, close: function () { setOpen(false); } };

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-tv-search]');
    if (btn) { e.preventDefault(); setOpen(true); }
  });

  // deep link: #product=Name opens that product's detail view
  function openDeepLink() {
    var m = /#product=([^&]+)/.exec(window.location.hash || '');
    if (!m) return;
    var want = decodeURIComponent(m[1]).toLowerCase();
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      var cards = document.querySelectorAll('[data-product-card]');
      for (var i = 0; i < cards.length; i++) {
        if ((cards[i].getAttribute('data-product-card') || '').toLowerCase() === want) {
          cards[i].click();
          clearInterval(iv);
          return;
        }
      }
      if (tries > 40) clearInterval(iv);
    }, 150);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openDeepLink);
  else openDeepLink();
})();
