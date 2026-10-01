/*
 * Copy review mode.
 *
 * Off by default: normal visitors never see any of this. Open any page with
 * ?review=1 to switch it on (it stays on while browsing between pages), and
 * ?review=0 or the "Exit" button to switch it off.
 *
 * In review mode, clicking any piece of copy opens a note showing the current
 * text with a box for the suggested wording. Clicking an image or background
 * image opens a comment with an optional replacement image upload.
 * Suggestions are pinned to the page like Figma comments and listed in a side
 * panel that can be exported. The page itself is never modified.
 *
 * Suggestions are saved to /api/review when the Vercel storage is connected,
 * and to this browser's localStorage otherwise.
 */
(function () {
  if (window.CopyReview) return;

  var FLAG = 'tv_review_mode';
  var STORE = 'tv_copy_review_v1';
  var NAME = 'tv_review_name';
  var API = '/api/review';
  var RED = '#C8102E';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var qs = new URLSearchParams(location.search);
  if (qs.get('review') === '1') lsSet(FLAG, '1');
  if (qs.get('review') === '0') lsDel(FLAG);
  if (lsGet(FLAG) !== '1') { window.CopyReview = { active: false }; return; }

  // ---------- data ----------

  var PENDING = 'tv_copy_review_pending';
  var items = [];
  // 'checking' until the first server response, then 'cloud' (shared store
  // reachable), 'offline' (server unreachable, retrying) or 'local' (storage
  // not connected on this deployment).
  var mode = 'checking';

  function loadLocal() {
    try { return JSON.parse(lsGet(STORE) || '[]'); } catch (e) { return []; }
  }
  function saveLocal() { lsSet(STORE, JSON.stringify(items)); }

  // Changes not yet confirmed by the server, keyed by id: 'upsert' or 'delete'.
  // Kept in localStorage so nothing is lost if the tab closes before a retry.
  function loadPending() {
    try { return JSON.parse(lsGet(PENDING) || '{}'); } catch (e) { return {}; }
  }
  var pending = loadPending();
  function savePending() { lsSet(PENDING, JSON.stringify(pending)); }
  function pendingCount() { return Object.keys(pending).length; }

  function api(method, body) {
    return fetch(API, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    }).then(function (r) {
      if (r.status === 501) { var e = new Error('not connected'); e.notConnected = true; throw e; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function failed(err) {
    mode = err && err.notConnected ? 'local' : 'offline';
  }

  // Send every queued change; each is cleared only once the server confirms it.
  var flushing = null;
  function flush() {
    if (flushing) return flushing;
    var ids = Object.keys(pending);
    if (!ids.length || mode === 'local') { refresh(); return Promise.resolve(); }
    flushing = Promise.all(ids.map(function (id) {
      var op = pending[id];
      var item = items.filter(function (i) { return i.id === id; })[0];
      var req = op === 'delete' ? api('DELETE', { id: id })
        : item ? api('POST', item) : Promise.resolve();
      return req.then(function () {
        if (pending[id] === op) delete pending[id];
        mode = 'cloud';
      }).catch(failed);
    })).then(function () {
      savePending();
      flushing = null;
      refresh();
    });
    return flushing;
  }

  function sync() {
    return api('GET').then(function (res) {
      mode = 'cloud';
      var local = {};
      loadLocal().forEach(function (i) { local[i.id] = i; });
      // Server is the source of truth, except for this browser's unsent changes.
      items = (res.items || []).filter(function (i) { return pending[i.id] !== 'delete'; });
      Object.keys(pending).forEach(function (id) {
        if (pending[id] !== 'upsert' || !local[id]) return;
        items = items.filter(function (i) { return i.id !== id; }).concat(local[id]);
      });
      saveLocal();
      return flush();
    }).catch(function (err) {
      failed(err);
      items = loadLocal();
    }).then(refresh);
  }

  function queue(id, op) {
    pending[id] = op;
    savePending();
    saveLocal();
    refresh();
    return flush().then(function () { return !pending[id]; });
  }

  function upsert(item) {
    var idx = items.findIndex(function (i) { return i.id === item.id; });
    if (idx === -1) items.push(item); else items[idx] = item;
    return queue(item.id, 'upsert');
  }

  function remove(id) {
    items = items.filter(function (i) { return i.id !== id; });
    return queue(id, 'delete');
  }

  // Keep retrying anything unsent, and pick up other reviewers' suggestions.
  setInterval(function () {
    if (pendingCount()) { if (mode === 'local') sync(); else flush(); }
  }, 10000);
  setInterval(function () { if (!pendingCount() && !editing) sync(); }, 60000);
  window.addEventListener('online', function () { flush(); });
  window.addEventListener('beforeunload', function (e) {
    if (!pendingCount() || mode !== 'offline') return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- page + element helpers ----------

  function pageKey() {
    var p = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    return p || 'index.html';
  }
  function pageLabel(key) {
    return key.replace(/\.dc\.html$|\.html$/, '').replace(/^index$/, 'Home');
  }
  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function textOf(el) { return norm(el.textContent); }

  function isOurs(el) { return el === host || (el && el.closest && el.closest('#tv-copy-review')); }

  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return false;
  }

  // The header, its dropdowns and the mobile menu are all fixed-position; leave
  // them clickable so reviewers can still move between pages.
  function inSiteChrome(el) {
    for (var cur = el; cur && cur !== document.body; cur = cur.parentElement) {
      if (cur.tagName === 'NAV' || getComputedStyle(cur).position === 'fixed') return true;
    }
    return false;
  }

  // Find the block of copy under the pointer: the nearest element with its own
  // text, widened past inline wrappers (e.g. an <em> inside a heading).
  function copyTarget(el) {
    if (!el || el.nodeType !== 1 || isOurs(el) || inSiteChrome(el)) return null;
    var tag = el.tagName;
    if (tag === 'HTML' || tag === 'BODY' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return null;
    var cur = el;
    while (cur && cur !== document.body && !hasOwnText(cur)) cur = cur.parentElement;
    if (!cur || cur === document.body) return null;
    while (cur.parentElement && cur.parentElement !== document.body &&
      getComputedStyle(cur).display === 'inline' && hasOwnText(cur.parentElement)) {
      cur = cur.parentElement;
    }
    var t = textOf(cur);
    if (!t || t.length > 2000) return null;
    return cur;
  }

  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      var tag = el.tagName.toLowerCase();
      var i = 1, sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }

  // Bumped whenever the page's DOM changes, so failed lookups are only retried
  // after something actually re-rendered.
  var domVersion = 0;

  // The page re-rendered or shifted: find the copy by its text instead. Walks
  // text nodes that could start the copy and climbs to the element whose full
  // text matches.
  function findByText(text) {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var t = norm(node.nodeValue);
      if (!t || text.indexOf(t) !== 0) continue;
      for (var el = node.parentElement; el && el !== document.body; el = el.parentElement) {
        if (isOurs(el)) break;
        var full = textOf(el);
        if (full === text) return el;
        if (full.length > text.length) break;
      }
    }
    return null;
  }

  // ---------- images ----------

  function pathOf(url) {
    try { return decodeURI(new URL(url, location.href).pathname); } catch (e) { return ''; }
  }

  function bgUrl(el) {
    var m = /url\(["']?([^"')]+)["']?\)/.exec(getComputedStyle(el).backgroundImage || '');
    return m ? m[1] : '';
  }

  // Identifies an image by the file it shows, so it can be found again after
  // the page re-renders.
  function srcOf(el) {
    if (el.tagName === 'IMG') return pathOf(el.currentSrc || el.src || el.getAttribute('src') || '');
    var u = bgUrl(el);
    return u ? pathOf(u) : '';
  }

  // An <img> absolutely positioned to fill its section is used as a background.
  function isBackgroundImg(img) {
    if (getComputedStyle(img).position !== 'absolute' || !img.parentElement) return false;
    var r = img.getBoundingClientRect(), p = img.parentElement.getBoundingClientRect();
    return r.width >= p.width * 0.9 && r.height >= p.height * 0.9;
  }

  // The image under the pointer, looking through overlays stacked on top of it.
  function imageAt(x, y) {
    var stack = document.elementsFromPoint(x, y);
    for (var i = 0; i < stack.length; i++) {
      var el = stack[i];
      if (el === document.body || el === document.documentElement) break;
      if (isOurs(el)) continue;
      // Anything under the header or its menus stays clickable as navigation.
      if (inSiteChrome(el)) return null;
      if (el.tagName === 'IMG' && srcOf(el)) return { el: el, kind: isBackgroundImg(el) ? 'background' : 'image' };
      if (bgUrl(el)) return { el: el, kind: 'background' };
    }
    return null;
  }

  // Text wins where the pointer is over copy; otherwise the image beneath it.
  function pickTarget(e) {
    if (e.target && e.target.nodeType === 1 && inSiteChrome(e.target)) return null;
    // Buttons do things on the page (Load More, Add to Quote, filters, tabs),
    // so leave them working rather than opening a note.
    if (e.target && e.target.closest && e.target.closest('button, [role="button"]')) return null;
    var el = copyTarget(e.target);
    if (el) return { el: el, kind: 'text' };
    return imageAt(e.clientX, e.clientY);
  }

  function kindOf(item) { return item.kind || 'text'; }
  function sigOf(el, kind) { return kind === 'text' ? textOf(el) : srcOf(el); }

  function findBySrc(src) {
    var all = document.body.querySelectorAll('img, [style*="url("]');
    for (var i = 0; i < all.length; i++) {
      if (!isOurs(all[i]) && srcOf(all[i]) === src) return all[i];
    }
    return null;
  }

  var resolved = new Map();
  var misses = new Map();
  function locate(item) {
    var kind = kindOf(item);
    var el = resolved.get(item.id);
    if (el && el.isConnected && sigOf(el, kind) === item.original) return el;
    if (misses.get(item.id) === domVersion) return null;
    el = null;
    try { el = document.querySelector(item.selector); } catch (e) {}
    if (!el || sigOf(el, kind) !== item.original) {
      el = kind === 'text' ? findByText(item.original) : findBySrc(item.original);
    }
    if (el) { resolved.set(item.id, el); misses.delete(item.id); }
    else { resolved.delete(item.id); misses.set(item.id, domVersion); }
    return el;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  // ---------- UI ----------

  var host, root, hoverBox, hoverLbl, pinLayer, toolbar, panel, pop, statusEl, countEl, selectBtn, saveEl;
  var selecting = true;
  var panelOpen = false;
  var editing = null; // { item, el }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,sans-serif}',
    '.hover{position:fixed;pointer-events:none;border:2px solid ' + RED + ';border-radius:6px;background:rgba(200,16,46,0.06);z-index:2147483000;display:none;transition:all .08s ease-out}',
    '.hover.editing{display:block;border-style:solid;background:rgba(200,16,46,0.1)}',
    '.pins{position:fixed;inset:0;pointer-events:none;z-index:2147483001}',
    '.pin{position:fixed;pointer-events:auto;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50% 50% 50% 4px;background:' + RED + ';color:#fff;border:2px solid #fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);padding:0}',
    '.pin.done{background:#2E7D4F}',
    '.bar{position:fixed;left:24px;bottom:24px;z-index:2147483002;display:flex;align-items:center;gap:6px;background:#1C1C1A;color:#FAFBFC;border-radius:999px;padding:6px;box-shadow:0 14px 34px rgba(0,0,0,.3);font-size:13px}',
    '.bar .tag{padding:0 10px 0 12px;font-weight:700;letter-spacing:.3px;white-space:nowrap}',
    '.bar button{border:none;background:transparent;color:#FAFBFC;font-size:13px;font-weight:600;padding:9px 14px;border-radius:999px;cursor:pointer;white-space:nowrap}',
    '.bar button:hover{background:rgba(255,255,255,.1)}',
    '.bar button.on{background:' + RED + '}',
    '.save-state{display:inline-flex;align-items:center;gap:7px;padding:0 10px;font-size:12px;font-weight:600;white-space:nowrap;color:#D9D9D5}',
    '.save-state::before{content:"";width:8px;height:8px;border-radius:50%;background:#A8A59C}',
    '.save-state.ok::before{background:#3DBE6E}',
    '.save-state.wait::before{background:#F2B01E}',
    '.save-state.bad{color:#fff;background:' + RED + ';border-radius:999px;padding:6px 12px}',
    '.save-state.bad::before{background:#fff}',
    '.bar .count{display:inline-block;min-width:20px;padding:1px 6px;margin-left:6px;border-radius:999px;background:#FAFBFC;color:#1C1C1A;font-size:11px;text-align:center}',
    '.pop{position:fixed;z-index:2147483003;width:360px;max-width:calc(100vw - 32px);background:#fff;color:#1C1C1A;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);border:1px solid #E1E4E8;padding:16px;display:none;font-size:13px}',
    '.pop label{display:block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#6B6B68;margin:0 0 6px}',
    '.pop .orig{background:#F4F5F7;border-radius:8px;padding:10px 12px;max-height:120px;overflow:auto;line-height:1.5;margin-bottom:12px;color:#45443F;white-space:pre-wrap}',
    '.pop textarea,.pop input{width:100%;border:1px solid #D5D9DE;border-radius:8px;padding:10px 12px;font-size:14px;line-height:1.5;color:#1C1C1A;background:#fff;outline:none;resize:vertical;margin-bottom:12px}',
    '.pop textarea:focus,.pop input:focus{border-color:' + RED + ';box-shadow:0 0 0 3px rgba(200,16,46,.12)}',
    '.pop .row{display:flex;gap:8px;align-items:center}',
    '.pop .meta{font-size:12px;color:#6B6B68;margin-bottom:10px}',
    '.btn{border:none;border-radius:999px;padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer}',
    '.primary{background:' + RED + ';color:#fff}.primary:hover{background:#8f0c20}',
    '.ghost{background:#EFF1F3;color:#1C1C1A}.ghost:hover{background:#E1E4E8}',
    '.danger{background:transparent;color:' + RED + ';padding-left:4px;padding-right:4px}',
    '.spacer{flex:1}',
    '.panel{position:fixed;top:0;right:0;bottom:0;width:400px;max-width:100vw;z-index:2147483002;background:#FAFBFC;color:#1C1C1A;box-shadow:-20px 0 50px rgba(0,0,0,.18);display:none;flex-direction:column;font-size:13px}',
    '.panel header{padding:20px 20px 14px;border-bottom:1px solid #E1E4E8;background:#fff}',
    '.panel h2{margin:0 0 4px;font-size:18px;font-weight:700}',
    '.panel .status{font-size:12px;color:#6B6B68}',
    '.panel .tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}',
    '.panel .list{flex:1;overflow:auto;padding:12px 20px 40px}',
    '.panel h3{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6B6B68;margin:18px 0 8px}',
    '.card{background:#fff;border:1px solid #E1E4E8;border-radius:12px;padding:12px 14px;margin-bottom:10px;cursor:pointer}',
    '.card:hover{border-color:' + RED + '}',
    '.card.done{opacity:.6}',
    '.card .n{display:inline-flex;width:20px;height:20px;border-radius:50%;background:' + RED + ';color:#fff;font-size:10px;font-weight:700;align-items:center;justify-content:center;margin-right:6px}',
    '.card.done .n{background:#2E7D4F}',
    '.card .was{color:#6B6B68;text-decoration:line-through;margin:8px 0 4px;line-height:1.45}',
    '.card .now{color:#1C1C1A;font-weight:600;line-height:1.45}',
    '.card .note{margin-top:6px;color:#45443F;font-style:italic;line-height:1.45}',
    '.card .foot{display:flex;align-items:center;gap:10px;margin-top:8px;font-size:11px;color:#6B6B68}',
    '.card .foot label{display:flex;align-items:center;gap:4px;cursor:pointer}',
    '.hover .lbl{position:absolute;top:-2px;left:-2px;transform:translateY(-100%);background:' + RED + ';color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px 6px 6px 0;white-space:nowrap;display:none}',
    '.hover.img .lbl{display:block}',
    '.pin.img{border-radius:6px}',
    '.pop .thumb{display:block;width:100%;max-height:150px;object-fit:contain;background:#F4F5F7;border-radius:8px;margin-bottom:12px}',
    '.drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:96px;border:2px dashed #D5D9DE;border-radius:10px;padding:12px;margin-bottom:12px;color:#6B6B68;text-align:center;cursor:pointer;line-height:1.4}',
    '.drop:hover,.drop.over{border-color:' + RED + ';color:' + RED + ';background:rgba(200,16,46,.04)}',
    '.drop strong{color:#1C1C1A}',
    '.drop img{max-width:100%;max-height:140px;border-radius:6px;object-fit:contain}',
    '.drop .fname{font-size:12px;word-break:break-all}',
    '.pop .err{color:' + RED + ';font-size:12px;margin:-4px 0 10px;display:none}',
    '.card .kind{display:inline-block;margin-left:6px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#6B6B68;background:#EFF1F3;border-radius:4px;padding:2px 6px}',
    '.card .imgs{display:flex;align-items:center;gap:8px;margin-top:8px}',
    '.card .imgs img{width:110px;height:74px;object-fit:cover;border-radius:6px;background:#F4F5F7;border:1px solid #E1E4E8}',
    '.card .imgs .arrow{color:#6B6B68;font-weight:700}',
    '.card a.dl{color:' + RED + ';font-weight:600;font-size:12px;text-decoration:none}',
    '.empty{color:#6B6B68;line-height:1.6;padding:20px 0}',
    '.toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#1C1C1A;color:#fff;padding:10px 16px;border-radius:999px;font-size:13px;z-index:2147483004;opacity:0;transition:opacity .2s;pointer-events:none}',
    '.toast.show{opacity:1}',
    '@media (max-width:640px){',
    ' .bar{left:12px;right:auto;bottom:12px;flex-wrap:wrap;max-width:calc(100vw - 24px);border-radius:18px}',
    ' .bar .tag{display:none}',
    ' .pop{left:8px!important;right:8px;top:auto!important;bottom:8px;width:auto;max-width:none;max-height:80vh;overflow:auto}',
    '}',
  ].join('\n');

  function h(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    host = document.createElement('div');
    host.id = 'tv-copy-review';
    document.body.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    hoverBox = h('div', 'hover');
    hoverLbl = h('span', 'lbl');
    hoverBox.appendChild(hoverLbl);
    pinLayer = h('div', 'pins');
    root.appendChild(hoverBox);
    root.appendChild(pinLayer);

    toolbar = h('div', 'bar');
    toolbar.appendChild(h('span', 'tag', 'Copy review'));
    selectBtn = h('button', 'on', 'Click to comment');
    selectBtn.title = 'Turn off to use links and menus normally';
    selectBtn.addEventListener('click', function () { setSelecting(!selecting); });
    var listBtn = h('button', '', 'Suggestions');
    countEl = h('span', 'count', '0');
    listBtn.appendChild(countEl);
    listBtn.addEventListener('click', function () { togglePanel(); });
    var exitBtn = h('button', '', 'Exit');
    exitBtn.title = 'Leave review mode (open any page with ?review=1 to return)';
    exitBtn.addEventListener('click', function () {
      lsDel(FLAG);
      var u = new URL(location.href);
      u.searchParams.delete('review');
      location.href = u.toString();
    });
    saveEl = h('span', 'save-state');
    toolbar.appendChild(saveEl);
    toolbar.appendChild(selectBtn);
    toolbar.appendChild(listBtn);
    toolbar.appendChild(exitBtn);
    root.appendChild(toolbar);

    pop = h('div', 'pop');
    root.appendChild(pop);

    panel = h('div', 'panel');
    root.appendChild(panel);

    toast.el = h('div', 'toast');
    root.appendChild(toast.el);

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(); if (panelOpen) togglePanel(false); } });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    new MutationObserver(function () { domVersion++; schedule(); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(schedule, 800);
  }

  function toast(msg) {
    toast.el.textContent = msg;
    toast.el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toast.el.classList.remove('show'); }, 2200);
  }

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

  function setSelecting(on) {
    selecting = on;
    selectBtn.classList.toggle('on', on);
    selectBtn.textContent = on ? 'Click to comment' : 'Browsing (links work)';
    if (!on) hoverBox.style.display = 'none';
  }

  function placeBox(box, el) {
    var r = el.getBoundingClientRect();
    box.style.left = (r.left - 4) + 'px';
    box.style.top = (r.top - 4) + 'px';
    box.style.width = (r.width + 8) + 'px';
    box.style.height = (r.height + 8) + 'px';
  }

  var KIND_LABEL = { text: 'Copy', image: 'Image', background: 'Background image' };

  function showHover(t) {
    placeBox(hoverBox, t.el);
    hoverBox.classList.toggle('img', t.kind !== 'text');
    hoverLbl.textContent = t.kind === 'text' ? '' : KIND_LABEL[t.kind] + ', click to comment';
    hoverBox.style.display = 'block';
  }

  function onMove(e) {
    if (!selecting || editing) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) !== -1) { hoverBox.style.display = 'none'; return; }
    var t = pickTarget(e);
    if (!t) { hoverBox.style.display = 'none'; return; }
    showHover(t);
  }

  function onClick(e) {
    // Only real clicks: the export download link (and any page script) fires
    // synthetic clicks at 0,0, which used to land on the hero background and
    // get swallowed, blocking the download.
    if (!e.isTrusted || (e.target && e.target.closest && e.target.closest('[data-tv-review]'))) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    if (editing) {
      // Clicking outside an open note closes it without following links.
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      closePop();
      return;
    }
    if (!selecting) return;
    var t = pickTarget(e);
    if (!t) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var el = t.el;
    var original = sigOf(el, t.kind);
    var existing = items.filter(function (i) {
      return i.page === pageKey() && kindOf(i) === t.kind && i.original === original && locate(i) === el;
    })[0];
    openPop(existing || {
      id: uid(), page: pageKey(), kind: t.kind, selector: cssPath(el), original: original,
      suggested: t.kind === 'text' ? original : '', note: '', status: 'open',
    }, el, !existing, { x: e.clientX, y: e.clientY });
  }

  function beginEdit(item, el, point) {
    editing = { item: item, el: el, point: point };
    hoverBox.classList.add('editing');
    hoverBox.classList.toggle('img', kindOf(item) !== 'text');
    hoverLbl.textContent = KIND_LABEL[kindOf(item)];
    hoverBox.style.display = 'block';
    placeBox(hoverBox, el);
  }

  function openPop(item, el, isNew, point) {
    if (kindOf(item) !== 'text') { openImagePop(item, el, isNew, point); return; }
    beginEdit(item, el, point);

    var name = item.author || lsGet(NAME) || '';
    pop.innerHTML =
      '<label>Current copy</label><div class="orig"></div>' +
      '<label>Suggested copy</label><textarea class="sug" rows="4"></textarea>' +
      '<label>Note (optional)</label><textarea class="note" rows="2" placeholder="e.g. tone, reason, question for the designer"></textarea>' +
      '<label>Your name</label><input class="who" type="text" placeholder="So we know who suggested it" />' +
      (isNew ? '' : '<div class="meta"></div>') +
      '<div class="row">' +
      (isNew ? '' : '<button class="btn danger del">Delete</button>') +
      '<span class="spacer"></span>' +
      '<button class="btn ghost cancel">Cancel</button>' +
      '<button class="btn primary save">' + (isNew ? 'Save suggestion' : 'Update') + '</button></div>';
    pop.querySelector('.orig').textContent = item.original;
    var sug = pop.querySelector('.sug');
    var note = pop.querySelector('.note');
    var who = pop.querySelector('.who');
    sug.value = item.suggested;
    note.value = item.note || '';
    who.value = name;
    if (!isNew) {
      pop.querySelector('.meta').textContent =
        (item.author ? item.author + ' · ' : '') + fmtDate(item.updatedAt) + (item.status === 'resolved' ? ' · Resolved' : '');
      pop.querySelector('.del').addEventListener('click', function () {
        if (!confirm('Delete this suggestion?')) return;
        closePop();
        remove(item.id).then(function (ok) { toast(ok ? 'Suggestion deleted' : 'Deleted here, will sync when the connection is back'); });
      });
    }
    pop.querySelector('.cancel').addEventListener('click', closePop);
    pop.querySelector('.save').addEventListener('click', function () {
      var s = sug.value.trim();
      var n = note.value.trim();
      if (s === item.original && !n) { sug.focus(); toast('Change the copy or add a note first'); return; }
      var author = who.value.trim();
      if (author) lsSet(NAME, author);
      var now = Date.now();
      closePop();
      toast('Saving…');
      upsert(Object.assign({}, item, {
        suggested: s, note: n, author: author,
        createdAt: item.createdAt || now, updatedAt: now,
      })).then(function (ok) {
        if (ok) toast(isNew ? 'Suggestion saved ✓' : 'Suggestion updated ✓');
        else if (mode === 'local') toast('Saved on this device only, the shared list is not connected');
        else toast('Not sent yet, it is kept here and will retry automatically');
      });
    });
    sug.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) pop.querySelector('.save').click();
    });

    pop.style.display = 'block';
    positionPop(el);
    sug.focus();
    sug.select();
  }

  function positionPop(el) {
    var r = el.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    // For large areas like a hero background, open the note where they clicked.
    var p = editing && editing.point;
    if (p && (r.height > vh * 0.5 || r.width > vw * 0.6)) r = { left: p.x, top: p.y, bottom: p.y };
    var top = r.bottom + 12;
    if (top + ph > vh - 12) top = r.top - ph - 12;
    if (top < 12) top = Math.max(12, vh - ph - 12);
    var left = Math.min(Math.max(12, r.left), vw - pw - 12);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }

  function closePop() {
    if (!editing) return;
    editing = null;
    pop.style.display = 'none';
    hoverBox.classList.remove('editing');
    hoverBox.style.display = 'none';
  }

  // ---------- image comments ----------

  var UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  var UPLOAD_MAX = 3 * 1024 * 1024; // keeps the request under Vercel's 4.5MB body limit

  function imageUrl(id) { return API + '?image=' + encodeURIComponent(id); }

  function readBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // Sends the file as-is when it fits; larger photos are scaled down to a
  // high-quality JPEG that does.
  function prepareImage(file) {
    if (UPLOAD_TYPES.indexOf(file.type) === -1) {
      return Promise.reject(new Error('Please choose a JPG, PNG, WebP or GIF image.'));
    }
    if (file.size <= UPLOAD_MAX) {
      return readBase64(file).then(function (data) { return { type: file.type, name: file.name, data: data }; });
    }
    if (file.type === 'image/gif') return Promise.reject(new Error('That GIF is over 3MB, please choose a smaller one.'));
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
        (function attempt(s, q) {
          var c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * s);
          c.height = Math.round(img.naturalHeight * s);
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (blob) {
            if (!blob) { reject(new Error('Could not read that image.')); return; }
            if (blob.size > UPLOAD_MAX && s > 0.2) { attempt(s * 0.8, Math.max(0.75, q - 0.05)); return; }
            readBase64(blob).then(function (data) {
              resolve({ type: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg', data: data });
            }, reject);
          }, 'image/jpeg', q);
        })(scale, 0.9);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  function uploadImage(prepared) {
    return fetch(API + '?upload=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prepared),
    }).then(function (r) {
      if (r.status === 501) throw new Error('Image uploads need the shared review list connected.');
      if (r.status === 413) throw new Error('That image is too large, please choose a smaller one.');
      if (!r.ok) throw new Error('Upload failed, please try again.');
      return r.json();
    }).then(function (res) { return res.id; });
  }

  function openImagePop(item, el, isNew, point) {
    beginEdit(item, el, point);
    var kind = kindOf(item);
    var name = item.author || lsGet(NAME) || '';
    var chosen = null; // File picked in this popover, not yet uploaded
    var removed = false;

    pop.innerHTML =
      '<label>Current ' + (kind === 'background' ? 'background image' : 'image') + '</label><img class="thumb" alt="" />' +
      '<label>Replacement image (optional)</label>' +
      '<div class="drop" tabindex="0"></div><input class="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden />' +
      '<div class="err"></div>' +
      '<label>Comment</label><textarea class="note" rows="3" placeholder="e.g. use a brighter photo, show the machine in an office"></textarea>' +
      '<label>Your name</label><input class="who" type="text" placeholder="So we know who suggested it" />' +
      (isNew ? '' : '<div class="meta"></div>') +
      '<div class="row">' +
      (isNew ? '' : '<button class="btn danger del">Delete</button>') +
      '<span class="spacer"></span>' +
      '<button class="btn ghost cancel">Cancel</button>' +
      '<button class="btn primary save">' + (isNew ? 'Save comment' : 'Update') + '</button></div>';

    pop.querySelector('.thumb').src = item.original;
    var drop = pop.querySelector('.drop');
    var input = pop.querySelector('.file');
    var err = pop.querySelector('.err');
    var note = pop.querySelector('.note');
    var who = pop.querySelector('.who');
    var saveBtn = pop.querySelector('.save');
    note.value = item.note || '';
    who.value = name;

    function showErr(msg) { err.textContent = msg || ''; err.style.display = msg ? 'block' : 'none'; }

    function renderDrop() {
      drop.innerHTML = '';
      var src = chosen ? URL.createObjectURL(chosen) : (item.imageId && !removed ? imageUrl(item.imageId) : '');
      if (src) {
        var im = h('img');
        im.src = src;
        drop.appendChild(im);
        drop.appendChild(h('span', 'fname', esc(chosen ? chosen.name : (item.imageName || 'Uploaded image'))));
        var clear = h('button', 'btn danger', 'Remove image');
        clear.type = 'button';
        clear.addEventListener('click', function (e) {
          e.stopPropagation();
          chosen = null; removed = true; input.value = '';
          renderDrop();
        });
        drop.appendChild(clear);
      } else {
        drop.innerHTML = '<strong>Upload a replacement</strong><span>Click to choose, or drag an image here</span><span class="fname">JPG, PNG, WebP or GIF</span>';
      }
      positionPop(el);
    }

    function pick(file) {
      showErr('');
      if (!file) return;
      if (UPLOAD_TYPES.indexOf(file.type) === -1) { showErr('Please choose a JPG, PNG, WebP or GIF image.'); return; }
      chosen = file;
      renderDrop();
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { pick(input.files[0]); });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('over');
      pick(e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    if (!isNew) {
      pop.querySelector('.meta').textContent =
        (item.author ? item.author + ' · ' : '') + fmtDate(item.updatedAt) + (item.status === 'resolved' ? ' · Resolved' : '');
      pop.querySelector('.del').addEventListener('click', function () {
        if (!confirm('Delete this comment?')) return;
        closePop();
        remove(item.id).then(function (ok) { toast(ok ? 'Comment deleted' : 'Deleted here, will sync when the connection is back'); });
      });
    }
    pop.querySelector('.cancel').addEventListener('click', closePop);

    saveBtn.addEventListener('click', function () {
      var n = note.value.trim();
      var keepsImage = item.imageId && !removed;
      if (!n && !chosen && !keepsImage) { showErr('Upload an image or add a comment first.'); return; }
      var author = who.value.trim();
      if (author) lsSet(NAME, author);
      showErr('');

      // The upload must succeed before the comment is saved, so a comment never
      // points at an image we don't have. On failure the popover stays open.
      var upload = chosen
        ? (saveBtn.disabled = true, saveBtn.textContent = 'Uploading…',
          prepareImage(chosen).then(uploadImage).then(function (id) {
            return { imageId: id, imageName: chosen.name };
          }))
        : Promise.resolve(keepsImage ? { imageId: item.imageId, imageName: item.imageName } : { imageId: '', imageName: '' });

      upload.then(function (img) {
        var now = Date.now();
        closePop();
        toast('Saving…');
        return upsert(Object.assign({}, item, img, {
          suggested: '', note: n, author: author,
          createdAt: item.createdAt || now, updatedAt: now,
        })).then(function (ok) {
          if (ok) toast(isNew ? 'Comment saved ✓' : 'Comment updated ✓');
          else if (mode === 'local') toast('Saved on this device only, the shared list is not connected');
          else toast('Not sent yet, it is kept here and will retry automatically');
        });
      }).catch(function (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = isNew ? 'Save comment' : 'Update';
        showErr(e && e.message ? e.message : 'Upload failed, please try again.');
      });
    });

    renderDrop();
    pop.style.display = 'block';
    positionPop(el);
    note.focus();
  }

  // ---------- pins ----------

  var raf = 0;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; drawPins(); });
  }

  function pageItems() {
    var p = pageKey();
    return items.filter(function (i) { return i.page === p; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  function drawPins() {
    var list = pageItems();
    while (pinLayer.children.length > list.length) pinLayer.lastChild.remove();
    list.forEach(function (item, idx) {
      var pin = pinLayer.children[idx];
      if (!pin) {
        pin = h('button', 'pin');
        pin.addEventListener('click', function (e) {
          e.stopPropagation();
          var it = items.filter(function (i) { return i.id === pin.dataset.id; })[0];
          var el = it && locate(it);
          if (it && el) openPop(it, el, false);
        });
        pinLayer.appendChild(pin);
      }
      pin.dataset.id = item.id;
      pin.textContent = String(idx + 1);
      pin.title = kindOf(item) === 'text' ? item.suggested : KIND_LABEL[kindOf(item)] + (item.note ? ': ' + item.note : '');
      pin.classList.toggle('done', item.status === 'resolved');
      pin.classList.toggle('img', kindOf(item) !== 'text');
      var el = locate(item);
      var r = el && el.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) { pin.style.display = 'none'; return; }
      pin.style.display = 'flex';
      pin.style.left = Math.max(14, r.left) + 'px';
      pin.style.top = Math.max(14, r.top) + 'px';
    });
    if (editing && editing.el.isConnected) {
      placeBox(hoverBox, editing.el);
    }
  }

  // ---------- panel ----------

  function togglePanel(force) {
    panelOpen = force == null ? !panelOpen : force;
    panel.style.display = panelOpen ? 'flex' : 'none';
    if (panelOpen) renderPanel();
  }

  function grouped() {
    var groups = {};
    items.forEach(function (i) { (groups[i.page] = groups[i.page] || []).push(i); });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    });
    return groups;
  }

  function renderPanel() {
    var groups = grouped();
    var pages = Object.keys(groups).sort(function (a, b) {
      if (a === pageKey()) return -1;
      if (b === pageKey()) return 1;
      return a.localeCompare(b);
    });
    var open = items.filter(function (i) { return i.status !== 'resolved'; }).length;
    panel.innerHTML =
      '<header><div class="row" style="display:flex;align-items:center"><h2>Suggestions</h2><span class="spacer" style="flex:1"></span>' +
      '<button class="btn ghost close">Close</button></div>' +
      '<div class="status"></div>' +
      '<div class="tools"><button class="btn primary zip">Download all (ZIP)</button><button class="btn ghost csv">Export CSV</button><button class="btn ghost copy">Copy as text</button></div></header>' +
      '<div class="list"></div>';
    statusEl = panel.querySelector('.status');
    setStatus(items.length + ' suggestion' + (items.length === 1 ? '' : 's') + ', ' + open + ' open · ' + saveState().long);
    panel.querySelector('.close').addEventListener('click', function () { togglePanel(false); });
    panel.querySelector('.csv').addEventListener('click', exportCsv);
    panel.querySelector('.zip').addEventListener('click', exportZip);
    panel.querySelector('.copy').addEventListener('click', copyText);

    var list = panel.querySelector('.list');
    if (!items.length) {
      list.innerHTML = '<div class="empty">No suggestions yet. Click any text on the page to suggest new wording, or any image or background to comment on it or upload a replacement.</div>';
      return;
    }
    pages.forEach(function (p) {
      list.appendChild(h('h3', '', esc(pageLabel(p)) + (p === pageKey() ? ' (this page)' : '')));
      groups[p].forEach(function (item, idx) {
        var card = h('div', 'card' + (item.status === 'resolved' ? ' done' : ''));
        var kind = kindOf(item);
        var body;
        if (kind === 'text') {
          body = item.suggested !== item.original
            ? '<div class="was">' + esc(item.original) + '</div><div class="now">' + esc(item.suggested) + '</div>'
            : '<div class="now" style="margin-top:8px">' + esc(item.original) + '</div>';
        } else {
          body = '<div class="imgs"><img src="' + esc(item.original) + '" alt="Current" />' +
            (item.imageId ? '<span class="arrow">→</span><img src="' + esc(imageUrl(item.imageId)) + '" alt="Replacement" />' : '') + '</div>' +
            (item.imageId ? '<div style="margin-top:6px"><a class="dl" href="' + esc(imageUrl(item.imageId)) + '" target="_blank" rel="noopener">Open replacement image ↗</a></div>' : '');
        }
        card.innerHTML =
          '<div><span class="n">' + (idx + 1) + '</span><strong>' + esc(item.author || 'Reviewer') + '</strong>' +
          (kind === 'text' ? '' : '<span class="kind">' + KIND_LABEL[kind] + '</span>') + '</div>' +
          body +
          (item.note ? '<div class="note">' + esc(item.note) + '</div>' : '') +
          '<div class="foot"><span>' + esc(fmtDate(item.updatedAt)) + '</span><span class="spacer"></span>' +
          '<label><input type="checkbox" class="res"' + (item.status === 'resolved' ? ' checked' : '') + ' /> Resolved</label></div>';
        card.querySelector('.res').addEventListener('click', function (e) { e.stopPropagation(); });
        card.querySelector('.res').addEventListener('change', function (e) {
          upsert(Object.assign({}, item, { status: e.target.checked ? 'resolved' : 'open' }));
        });
        var dl = card.querySelector('.dl');
        if (dl) dl.addEventListener('click', function (e) { e.stopPropagation(); });
        card.addEventListener('click', function () { goTo(item); });
        list.appendChild(card);
      });
    });
  }

  function goTo(item) {
    if (item.page !== pageKey()) {
      location.href = encodeURI(item.page) + '#review-' + item.id;
      return;
    }
    var el = locate(item);
    if (!el) { toast('That item is not on the page right now'); return; }
    if (window.innerWidth <= 640) togglePanel(false);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { openPop(item, el, false); }, 450);
  }

  function openFromHash() {
    var m = /^#review-(.+)$/.exec(location.hash);
    if (!m) return;
    var item = items.filter(function (i) { return i.id === m[1]; })[0];
    if (!item) return;
    var tries = 0;
    (function attempt() {
      var el = locate(item);
      if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(function () { openPop(item, el, false); }, 300); }
      else if (++tries < 20) setTimeout(attempt, 250);
    })();
  }

  // ---------- export ----------

  function rows() {
    var groups = grouped();
    var out = [];
    Object.keys(groups).sort().forEach(function (p) {
      groups[p].forEach(function (i, idx) { out.push({ page: pageLabel(p), n: idx + 1, item: i }); });
    });
    return out;
  }

  function absUrl(u) {
    try { return new URL(u, location.origin).href; } catch (e) { return u; }
  }

  // Name of each uploaded image inside the ZIP export, keyed by item id.
  function zipImageName(r) {
    var ext = (/\.(jpe?g|png|webp|gif)$/i.exec(r.item.imageName || '') || [, 'jpg'])[1].toLowerCase();
    return 'images/' + r.page.replace(/[^\w-]+/g, '-') + '-' + r.n + '.' + ext;
  }

  function csvText(withFiles) {
    var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var head = ['Page', 'Page file', '#', 'Type', 'Current copy / image', 'Suggested copy', 'Replacement image', 'Note', 'Suggested by', 'Status', 'Updated', 'ID'];
    if (withFiles) head.splice(7, 0, 'Image file in ZIP');
    var lines = [head.map(cell).join(',')];
    rows().forEach(function (r) {
      var i = r.item, kind = kindOf(i);
      var row = [
        r.page, i.page, r.n, KIND_LABEL[kind],
        kind === 'text' ? i.original : absUrl(i.original),
        kind === 'text' ? i.suggested : '',
        i.imageId ? absUrl(imageUrl(i.imageId)) : '',
        i.note, i.author, i.status, new Date(i.updatedAt || 0).toISOString(), i.id,
      ];
      if (withFiles) row.splice(7, 0, i.imageId ? zipImageName(r) : '');
      lines.push(row.map(cell).join(','));
    });
    return '﻿' + lines.join('\r\n');
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.setAttribute('data-tv-review', '1');
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function stamp() { return new Date().toISOString().slice(0, 10); }

  function exportCsv() {
    download(new Blob([csvText(false)], { type: 'text/csv;charset=utf-8' }), 'copy-suggestions-' + stamp() + '.csv');
  }

  // ---------- ZIP export (CSV + every uploaded image in one file) ----------

  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Minimal uncompressed ("stored") ZIP writer; images are already compressed.
  function buildZip(files) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    var d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh, name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, time, true);
      ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch, name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.byteLength; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }

  var zipping = false;
  function exportZip() {
    if (zipping) return;
    zipping = true;
    var enc = new TextEncoder();
    var withImages = rows().filter(function (r) { return r.item.imageId; });
    var files = [{ name: 'suggestions.csv', data: enc.encode(csvText(true)) }];
    var failed = [];
    var i = 0;
    function next() {
      if (i >= withImages.length) return Promise.resolve();
      var r = withImages[i++];
      toast('Downloading images ' + i + ' of ' + withImages.length + '…');
      return fetch(imageUrl(r.item.imageId)).then(function (res) {
        if (!res.ok) throw new Error();
        return res.arrayBuffer();
      }).then(function (buf) {
        files.push({ name: zipImageName(r), data: new Uint8Array(buf) });
      }).catch(function () {
        failed.push(r.page + ' #' + r.n);
      }).then(next);
    }
    next().then(function () {
      if (failed.length) {
        files.push({ name: 'MISSING-IMAGES.txt', data: enc.encode('These images could not be downloaded:\r\n' + failed.join('\r\n')) });
      }
      download(buildZip(files), 'site-review-' + stamp() + '.zip');
      toast(failed.length ? 'ZIP ready, ' + failed.length + ' image(s) could not be downloaded' : 'ZIP ready ✓');
    }).then(function () { zipping = false; }, function () { zipping = false; toast('Export failed, please try again'); });
  }

  function copyText() {
    var out = [], last = null;
    rows().forEach(function (r) {
      var i = r.item;
      if (r.page !== last) { out.push((last ? '\n' : '') + '== ' + r.page + ' =='); last = r.page; }
      var kind = kindOf(i);
      out.push(r.n + '. ' + (kind === 'text' ? '' : '[' + KIND_LABEL[kind] + '] ') +
        (i.status === 'resolved' ? '[resolved] ' : '') + (i.author ? '(' + i.author + ')' : ''));
      if (kind === 'text') {
        out.push('   Current:   ' + i.original);
        if (i.suggested !== i.original) out.push('   Suggested: ' + i.suggested);
      } else {
        out.push('   Current:     ' + absUrl(i.original));
        if (i.imageId) out.push('   Replacement: ' + absUrl(imageUrl(i.imageId)));
      }
      if (i.note) out.push('   Note:      ' + i.note);
    });
    var text = out.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { toast('Copied, paste it into an email'); })
      .catch(function () { window.prompt('Copy the suggestions below:', text); });
  }

  // ---------- boot ----------

  function saveState() {
    var n = pendingCount();
    if (mode === 'local') return { cls: 'bad', short: 'Not connected', long: 'Shared list not connected, suggestions are only on this device. Use Export CSV to send them.' };
    if (mode === 'checking') return { cls: 'wait', short: 'Connecting…', long: 'Connecting to the shared review list…' };
    if (n && mode === 'offline') return { cls: 'bad', short: n + ' not sent', long: n + ' change' + (n === 1 ? '' : 's') + ' not sent yet, kept on this device and retrying every 10 seconds. Keep this tab open until it clears.' };
    if (n) return { cls: 'wait', short: 'Saving…', long: 'Saving to the shared review list…' };
    return { cls: 'ok', short: 'All saved', long: 'Everything is saved to the shared review list.' };
  }

  function refresh() {
    if (!countEl) return;
    var st = saveState();
    saveEl.className = 'save-state ' + st.cls;
    saveEl.textContent = st.short;
    saveEl.title = st.long;
    countEl.textContent = String(items.filter(function (i) { return i.status !== 'resolved'; }).length);
    if (panelOpen) renderPanel();
    schedule();
  }

  function start() {
    build();
    items = loadLocal();
    refresh();
    sync().then(openFromHash);
  }

  window.CopyReview = { active: true, items: function () { return items.slice(); } };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
