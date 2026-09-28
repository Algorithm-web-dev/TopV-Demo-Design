(function () {
  if (window.QuoteCart || document.getElementById('tv-quote-cart')) return;
  var KEY = 'tv_quote_items';
  var RED = '#C8102E';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    render();
    window.dispatchEvent(new CustomEvent('quotecart:change', { detail: items }));
  }
  function count() {
    return load().reduce(function (n, i) { return n + i.qty; }, 0);
  }

  var api = {
    items: load,
    count: count,
    add: function (name, category, unit) {
      if (!name) return;
      var items = load();
      var hit = items.filter(function (i) { return i.name === name; })[0];
      if (hit) hit.qty += 1;
      else items.push({ name: name, category: category || '', unit: unit || '', qty: 1 });
      save(items);
      open(true);
      flash(name);
    },
    setQty: function (name, qty) {
      var items = load().map(function (i) { return i.name === name ? Object.assign({}, i, { qty: qty }) : i; })
        .filter(function (i) { return i.qty > 0; });
      save(items);
    },
    remove: function (name) {
      save(load().filter(function (i) { return i.name !== name; }));
    },
    clear: function () { save([]); },
  };
  window.QuoteCart = api;

  var root, btn, badge, panel, list, opened = false;

  function el(tag, css, html) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    root = el('div', 'position:fixed;right:24px;bottom:24px;z-index:400;font-family:Inter,system-ui,sans-serif;');
    root.id = 'tv-quote-cart';

    btn = el('button', 'display:flex;align-items:center;gap:10px;background:' + RED + ';color:#FAFBFC;border:none;border-radius:999px;padding:15px 24px;font-size:14px;font-weight:600;font-family:inherit;white-space:nowrap;cursor:pointer;box-shadow:0 14px 34px rgba(0,0,0,0.22);');
    btn.innerHTML = '<span>Quote list</span>';
    badge = el('span', 'background:#FAFBFC;color:' + RED + ';border-radius:999px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;padding:0 6px;');
    btn.appendChild(badge);
    btn.addEventListener('click', function () { open(!opened); });

    panel = el('div', 'position:absolute;right:0;bottom:70px;width:380px;max-height:70vh;background:#FFFFFF;border:1px solid #E1E4E8;border-radius:20px;box-shadow:0 26px 60px rgba(0,0,0,0.22);display:none;flex-direction:column;overflow:hidden;');
    var head = el('div', 'padding:22px 24px 14px;border-bottom:1px solid #E1E4E8;position:relative;');
    head.appendChild(el('div', 'font-size:12px;letter-spacing:2px;text-transform:uppercase;color:' + RED + ';font-weight:700;margin-bottom:6px;', 'Your quote list'));
    head.appendChild(el('div', 'font-size:14px;line-height:1.5;color:#6B6E75;padding-right:26px;', 'Add the machines and consumables you need, then send it to our sales team.'));
    var close = el('button', 'position:absolute;top:16px;right:16px;width:28px;height:28px;border-radius:50%;border:none;background:#EFF1F3;color:#1C1C1A;font-family:inherit;font-size:15px;line-height:1;cursor:pointer;', '×');
    close.addEventListener('click', function () { open(false); });
    head.appendChild(close);
    panel.appendChild(head);

    list = el('div', 'padding:8px 24px;overflow:auto;flex:1;');
    panel.appendChild(list);

    var foot = el('div', 'padding:18px 24px 22px;border-top:1px solid #E1E4E8;display:flex;flex-direction:column;gap:10px;');
    var proceed = el('a', 'display:block;text-align:center;background:' + RED + ';color:#FAFBFC;padding:14px 22px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;', 'Proceed with quote');
    proceed.href = 'Contact.dc.html#quote';
    var clear = el('button', 'background:transparent;border:none;color:#6B6E75;font-size:13px;font-family:inherit;cursor:pointer;', 'Clear list');
    clear.addEventListener('click', function () { api.clear(); });
    foot.appendChild(proceed);
    foot.appendChild(clear);
    panel.appendChild(foot);

    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);
  }

  function open(state) {
    opened = state;
    panel.style.display = state ? 'flex' : 'none';
  }

  function flash(name) {
    btn.style.transform = 'scale(1.06)';
    setTimeout(function () { btn.style.transform = 'none'; }, 180);
  }

  function render() {
    if (!root) return;
    var items = load();
    var n = count();
    badge.textContent = String(n);
    root.style.display = n ? '' : 'none';
    if (!n) open(false);
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(el('div', 'padding:26px 0;font-size:14px;color:#6B6E75;text-align:center;', 'Nothing added yet.'));
      return;
    }
    items.forEach(function (item) {
      var row = el('div', 'display:flex;gap:12px;align-items:flex-start;padding:16px 0;border-bottom:1px solid #E8EBEF;');
      var info = el('div', 'flex:1;');
      if (item.category) info.appendChild(el('div', 'font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#6B6E75;margin-bottom:4px;', item.category));
      info.appendChild(el('div', 'font-size:14.5px;font-weight:700;line-height:1.35;', item.name));
      if (item.unit) info.appendChild(el('div', 'font-size:12.5px;color:#6B6E75;margin-top:3px;', item.unit));
      row.appendChild(info);

      var qty = el('div', 'display:flex;align-items:center;gap:8px;flex-shrink:0;');
      var minus = el('button', 'width:26px;height:26px;border-radius:50%;border:1px solid #D3D7DD;background:#FFF;font-family:inherit;font-size:14px;cursor:pointer;line-height:1;', '−');
      var num = el('span', 'font-size:14px;font-weight:700;min-width:16px;text-align:center;', String(item.qty));
      var plus = el('button', 'width:26px;height:26px;border-radius:50%;border:1px solid #D3D7DD;background:#FFF;font-family:inherit;font-size:14px;cursor:pointer;line-height:1;', '+');
      minus.addEventListener('click', function () { api.setQty(item.name, item.qty - 1); });
      plus.addEventListener('click', function () { api.setQty(item.name, item.qty + 1); });
      qty.appendChild(minus); qty.appendChild(num); qty.appendChild(plus);
      row.appendChild(qty);
      list.appendChild(row);
    });
  }

  function delegate(e) {
    var t = e.target.closest ? e.target.closest('[data-quote-add]') : null;
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    api.add(t.getAttribute('data-quote-name'), t.getAttribute('data-quote-cat'), t.getAttribute('data-quote-unit'));
  }

  function init() {
    if (root || document.getElementById('tv-quote-cart')) return;
    build();
    render();
    document.addEventListener('click', delegate, true);
    window.addEventListener('storage', function (e) { if (e.key === KEY) render(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
