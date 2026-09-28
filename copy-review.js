/*
 * Copy review mode.
 *
 * Off by default: normal visitors never see any of this. Open any page with
 * ?review=1 to switch it on (it stays on while browsing between pages), and
 * ?review=0 or the "Exit" button to switch it off.
 *
 * In review mode, clicking any piece of copy opens a note showing the current
 * text with a box for the suggested wording. Suggestions are pinned to the
 * copy like Figma comments and listed in a side panel that can be exported.
 * The page itself is never modified.
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

  var items = [];
  var cloud = false;

  function loadLocal() {
    try { return JSON.parse(lsGet(STORE) || '[]'); } catch (e) { return []; }
  }
  function saveLocal() { lsSet(STORE, JSON.stringify(items)); }

  function api(method, body) {
    return fetch(API, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function sync() {
    return api('GET').then(function (res) {
      cloud = true;
      var remote = res.items || [];
      var ids = {};
      remote.forEach(function (i) { ids[i.id] = true; });
      // Push anything saved while offline / before storage was connected.
      var pending = loadLocal().filter(function (i) { return !ids[i.id]; });
      pending.forEach(function (i) { api('POST', i).catch(function () {}); });
      items = remote.concat(pending);
      saveLocal();
    }).catch(function () {
      cloud = false;
      items = loadLocal();
    }).then(refresh);
  }

  function upsert(item) {
    var idx = items.findIndex(function (i) { return i.id === item.id; });
    if (idx === -1) items.push(item); else items[idx] = item;
    saveLocal();
    refresh();
    if (cloud) api('POST', item).catch(function () { setStatus('Could not reach the server, saved on this device'); });
  }

  function remove(id) {
    items = items.filter(function (i) { return i.id !== id; });
    saveLocal();
    refresh();
    if (cloud) api('DELETE', { id: id }).catch(function () {});
  }

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

  var resolved = new Map();
  var misses = new Map();
  function locate(item) {
    var el = resolved.get(item.id);
    if (el && el.isConnected && textOf(el) === item.original) return el;
    if (misses.get(item.id) === domVersion) return null;
    el = null;
    try { el = document.querySelector(item.selector); } catch (e) {}
    if (!el || textOf(el) !== item.original) el = findByText(item.original);
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

  var host, root, hoverBox, pinLayer, toolbar, panel, pop, statusEl, countEl, selectBtn;
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
    pinLayer = h('div', 'pins');
    root.appendChild(hoverBox);
    root.appendChild(pinLayer);

    toolbar = h('div', 'bar');
    toolbar.appendChild(h('span', 'tag', 'Copy review'));
    selectBtn = h('button', 'on', 'Click text to edit');
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
    selectBtn.textContent = on ? 'Click text to edit' : 'Browsing (links work)';
    if (!on) hoverBox.style.display = 'none';
  }

  function placeBox(box, el) {
    var r = el.getBoundingClientRect();
    box.style.left = (r.left - 4) + 'px';
    box.style.top = (r.top - 4) + 'px';
    box.style.width = (r.width + 8) + 'px';
    box.style.height = (r.height + 8) + 'px';
  }

  function onMove(e) {
    if (!selecting || editing) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) !== -1) { hoverBox.style.display = 'none'; return; }
    var el = copyTarget(e.target);
    if (!el) { hoverBox.style.display = 'none'; return; }
    placeBox(hoverBox, el);
    hoverBox.style.display = 'block';
  }

  function onClick(e) {
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    if (editing) {
      // Clicking outside an open note closes it without following links.
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      closePop();
      return;
    }
    if (!selecting) return;
    var el = copyTarget(e.target);
    if (!el) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var original = textOf(el);
    var existing = items.filter(function (i) {
      return i.page === pageKey() && i.original === original && locate(i) === el;
    })[0];
    openPop(existing || {
      id: uid(), page: pageKey(), selector: cssPath(el), original: original,
      suggested: original, note: '', status: 'open',
    }, el, !existing);
  }

  function openPop(item, el, isNew) {
    editing = { item: item, el: el };
    hoverBox.classList.add('editing');
    hoverBox.style.display = 'block';
    placeBox(hoverBox, el);

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
        if (confirm('Delete this suggestion?')) { remove(item.id); closePop(); toast('Suggestion deleted'); }
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
      upsert(Object.assign({}, item, {
        suggested: s, note: n, author: author,
        createdAt: item.createdAt || now, updatedAt: now,
      }));
      closePop();
      toast(isNew ? 'Suggestion saved' : 'Suggestion updated');
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
      pin.title = item.suggested;
      pin.classList.toggle('done', item.status === 'resolved');
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
      '<header><div class="row" style="display:flex;align-items:center"><h2>Copy suggestions</h2><span class="spacer" style="flex:1"></span>' +
      '<button class="btn ghost close">Close</button></div>' +
      '<div class="status"></div>' +
      '<div class="tools"><button class="btn ghost csv">Export CSV</button><button class="btn ghost copy">Copy as text</button></div></header>' +
      '<div class="list"></div>';
    statusEl = panel.querySelector('.status');
    setStatus(items.length + ' suggestion' + (items.length === 1 ? '' : 's') + ', ' + open + ' open · ' +
      (cloud ? 'Saved to the shared review list' : 'Saved on this device only, use Export to send them'));
    panel.querySelector('.close').addEventListener('click', function () { togglePanel(false); });
    panel.querySelector('.csv').addEventListener('click', exportCsv);
    panel.querySelector('.copy').addEventListener('click', copyText);

    var list = panel.querySelector('.list');
    if (!items.length) {
      list.innerHTML = '<div class="empty">No suggestions yet. Click any heading, paragraph or button text on the page to suggest new wording.</div>';
      return;
    }
    pages.forEach(function (p) {
      list.appendChild(h('h3', '', esc(pageLabel(p)) + (p === pageKey() ? ' (this page)' : '')));
      groups[p].forEach(function (item, idx) {
        var card = h('div', 'card' + (item.status === 'resolved' ? ' done' : ''));
        card.innerHTML =
          '<div><span class="n">' + (idx + 1) + '</span><strong>' + esc(item.author || 'Reviewer') + '</strong></div>' +
          (item.suggested !== item.original
            ? '<div class="was">' + esc(item.original) + '</div><div class="now">' + esc(item.suggested) + '</div>'
            : '<div class="now" style="margin-top:8px">' + esc(item.original) + '</div>') +
          (item.note ? '<div class="note">' + esc(item.note) + '</div>' : '') +
          '<div class="foot"><span>' + esc(fmtDate(item.updatedAt)) + '</span><span class="spacer"></span>' +
          '<label><input type="checkbox" class="res"' + (item.status === 'resolved' ? ' checked' : '') + ' /> Resolved</label></div>';
        card.querySelector('.res').addEventListener('click', function (e) { e.stopPropagation(); });
        card.querySelector('.res').addEventListener('change', function (e) {
          upsert(Object.assign({}, item, { status: e.target.checked ? 'resolved' : 'open' }));
        });
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
    if (!el) { toast('That copy is not on the page right now'); return; }
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

  function exportCsv() {
    var cell = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = [['Page', '#', 'Current copy', 'Suggested copy', 'Note', 'Suggested by', 'Status', 'Updated'].map(cell).join(',')];
    rows().forEach(function (r) {
      var i = r.item;
      lines.push([r.page, r.n, i.original, i.suggested, i.note, i.author, i.status, new Date(i.updatedAt || 0).toISOString()].map(cell).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'copy-suggestions-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function copyText() {
    var out = [], last = null;
    rows().forEach(function (r) {
      var i = r.item;
      if (r.page !== last) { out.push((last ? '\n' : '') + '== ' + r.page + ' =='); last = r.page; }
      out.push(r.n + '. ' + (i.status === 'resolved' ? '[resolved] ' : '') + (i.author ? '(' + i.author + ')' : ''));
      out.push('   Current:   ' + i.original);
      if (i.suggested !== i.original) out.push('   Suggested: ' + i.suggested);
      if (i.note) out.push('   Note:      ' + i.note);
    });
    var text = out.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { toast('Copied, paste it into an email'); })
      .catch(function () { window.prompt('Copy the suggestions below:', text); });
  }

  // ---------- boot ----------

  function refresh() {
    if (!countEl) return;
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
