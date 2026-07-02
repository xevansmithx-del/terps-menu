/* ============================================================
   TERPS DISPENSARY — Budtender Order Dashboard
   Vanilla JS + supabase-js v2 (UMD via CDN).
   Data contract: backend/schema.sql
     tables: orders, order_items, order_events, messages, order_statuses
     RLS: authenticated role = full table access
     realtime: orders, messages, order_events
   Config: window.TERPS_BACKEND = { supabaseUrl, supabaseAnonKey, siteUrl }
   ============================================================ */
(function () {
  'use strict';

  // ---------------------------------------------------------
  // 0. Config + client bootstrap
  // ---------------------------------------------------------
  const CFG = window.TERPS_BACKEND || {};
  const PLACEHOLDER = /^__.*__$/;
  const configured =
    CFG.supabaseUrl && CFG.supabaseAnonKey &&
    !PLACEHOLDER.test(CFG.supabaseUrl) && !PLACEHOLDER.test(CFG.supabaseAnonKey);

  let sb = null; // supabase client

  // ---------------------------------------------------------
  // 1. App state
  // ---------------------------------------------------------
  const state = {
    user: null,
    orders: new Map(),          // id -> order row (+ derived)
    statuses: [],               // order_statuses rows, rank-ordered
    statusByKey: new Map(),     // key -> status row
    unread: new Map(),          // order_id -> unread customer msg count
    items: new Map(),           // order_id -> [items]  (lazy, per selected)
    events: new Map(),          // order_id -> [events] (lazy, per selected)
    messages: new Map(),        // order_id -> [messages](lazy, per selected)
    seenMessageIds: new Set(),  // dedupe realtime message inserts
    selectedId: null,
    tab: 'open',                // open | ready | done | all
    search: '',
    soundOn: true,
    notifyGranted: false,
    channel: null,
    connState: 'down',          // live | reconnecting | down
    pollTimer: null,
    titleFlash: null,
    unseenCount: 0,             // for tab-title flash count
    baseTitle: 'Terps — Orders'
  };

  // ---------------------------------------------------------
  // 2. Small helpers
  // ---------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  // for use inside a double-quoted HTML attribute value
  function escAttr(s) { return esc(s); }

  const money = (x) => '$' + (Number(x) || 0).toFixed(2);

  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ' + (m % 60) + 'm ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  }
  function clockTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function dateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function isToday(iso) {
    const d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function firstLastInitial(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Guest';
    if (parts.length === 1) return parts[0];
    return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
  }
  function firstName(name) {
    const p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return p[0] || 'the customer';
  }
  // readable text color for a given bg hex
  function onColor(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length < 6) return '#fff';
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b);
    return lum > 150 ? '#0b2e22' : '#fff';
  }
  function slugify(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  }

  // ---------------------------------------------------------
  // 3. Toast notifications (with optional retry action)
  // ---------------------------------------------------------
  function toast(msg, opts) {
    opts = opts || {};
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (opts.type || '');
    const span = document.createElement('span');
    span.className = 'msg';
    span.textContent = msg;
    el.appendChild(span);
    if (opts.action && opts.onAction) {
      const b = document.createElement('button');
      b.className = 'act';
      b.textContent = opts.action;
      b.addEventListener('click', () => { el.remove(); opts.onAction(); });
      el.appendChild(b);
    }
    host.appendChild(el);
    const ttl = opts.sticky ? 12000 : 4200;
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ttl);
  }

  // ---------------------------------------------------------
  // 4. Sounds — embedded, no external files.
  //    Two tones synthesized to WAV data-URIs at load.
  // ---------------------------------------------------------
  const Sound = (function () {
    function makeWav(freqs, ms, vol) {
      const rate = 8000, n = Math.floor(rate * ms / 1000);
      const bytes = new Uint8Array(44 + n);
      const dv = new DataView(bytes.buffer);
      const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      wr(0, 'RIFF'); dv.setUint32(4, 36 + n, true); wr(8, 'WAVE'); wr(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, rate, true); dv.setUint32(28, rate, true);
      dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
      wr(36, 'data'); dv.setUint32(40, n, true);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        let s = 0;
        for (let f = 0; f < freqs.length; f++) s += Math.sin(2 * Math.PI * freqs[f] * t);
        s /= freqs.length;
        const env = Math.min(1, t * 24) * Math.max(0, 1 - t / (ms / 1000)); // attack + decay
        bytes[44 + i] = 128 + Math.round(127 * vol * s * env);
      }
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return 'data:audio/wav;base64,' + btoa(bin);
    }
    const newOrderSrc = makeWav([784, 1047], 420, 0.9);  // bright two-note chime
    const msgSrc = makeWav([523], 260, 0.6);             // softer single note
    const aNew = new Audio(newOrderSrc);
    const aMsg = new Audio(msgSrc);
    aNew.preload = 'auto'; aMsg.preload = 'auto';
    return {
      newOrder() { if (state.soundOn) { try { aNew.currentTime = 0; aNew.play(); } catch (e) {} } },
      message() { if (state.soundOn) { try { aMsg.currentTime = 0; aMsg.play(); } catch (e) {} } }
    };
  })();

  // ---------------------------------------------------------
  // 5. Browser notifications + tab-title flash
  // ---------------------------------------------------------
  function requestNotify() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { state.notifyGranted = true; return; }
    if (Notification.permission === 'denied') return;
    Notification.requestPermission().then((p) => { state.notifyGranted = (p === 'granted'); });
  }
  function notify(title, body) {
    if (!state.notifyGranted || document.hasFocus()) return;
    try { new Notification(title, { body: body, tag: 'terps-order', renotify: true }); } catch (e) {}
  }
  function bumpTitle() {
    state.unseenCount++;
    startTitleFlash();
  }
  function startTitleFlash() {
    if (state.titleFlash || document.hasFocus()) return;
    let on = true;
    state.titleFlash = setInterval(() => {
      document.title = on ? '(' + state.unseenCount + ') New activity' : state.baseTitle;
      on = !on;
    }, 1000);
  }
  function clearTitleFlash() {
    if (state.titleFlash) { clearInterval(state.titleFlash); state.titleFlash = null; }
    state.unseenCount = 0;
    document.title = state.baseTitle;
  }
  window.addEventListener('focus', clearTitleFlash);

  // ---------------------------------------------------------
  // 6. Auth
  // ---------------------------------------------------------
  async function initAuth() {
    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      state.user = data.session.user;
      await enterApp();
    } else {
      showLogin();
    }
    sb.auth.onAuthStateChange((_evt, session) => {
      if (!session) { onLoggedOut(); }
    });
  }

  function showLogin() {
    $('#gate-login').classList.remove('hidden');
    $('#boot').classList.add('hidden');
    $('#app').classList.remove('live');
    const emailEl = $('#login-email');
    if (emailEl) emailEl.focus();
  }

  async function doLogin(e) {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const btn = $('#login-submit');
    const errBox = $('#login-error');
    errBox.classList.add('hidden');
    if (!email || !password) {
      errBox.textContent = 'Enter your email and password.';
      errBox.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span> Signing in…';
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.innerHTML = orig;
    if (error) {
      errBox.textContent = error.message || 'Sign-in failed. Check your email and password.';
      errBox.classList.remove('hidden');
      return;
    }
    state.user = data.user;
    $('#login-password').value = '';
    await enterApp();
  }

  async function doLogout() {
    try { await sb.auth.signOut(); } catch (e) {}
    onLoggedOut();
  }

  function onLoggedOut() {
    teardownRealtime();
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    state.user = null;
    state.orders.clear(); state.unread.clear();
    state.items.clear(); state.events.clear(); state.messages.clear();
    state.selectedId = null;
    $('#app').classList.remove('live');
    $('#gate-login').classList.remove('hidden');
    clearTitleFlash();
  }

  async function enterApp() {
    $('#gate-login').classList.add('hidden');
    $('#boot').classList.add('hidden');
    $('#app').classList.add('live');
    $('#who').textContent = (state.user && state.user.email) ? state.user.email : '';
    requestNotify();
    await loadStatuses();
    await loadOrders();
    setupRealtime();
    startPolling();
  }

  // ---------------------------------------------------------
  // 7. Data loads
  // ---------------------------------------------------------
  async function loadStatuses() {
    const { data, error } = await sb.from('order_statuses').select('*').order('rank', { ascending: true });
    if (error) { toast('Could not load statuses.', { type: 'err' }); return; }
    state.statuses = data || [];
    state.statusByKey = new Map(state.statuses.map((s) => [s.key, s]));
  }

  async function loadOrders() {
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      renderConnError();
      toast('Could not load orders.', { type: 'err', action: 'Retry', onAction: loadOrders });
      return;
    }
    state.orders = new Map((data || []).map((o) => [o.id, o]));
    await loadUnreadCounts();
    renderAll();
  }

  // Unread customer messages per order (for queue badges).
  async function loadUnreadCounts() {
    state.unread.clear();
    const { data, error } = await sb
      .from('messages')
      .select('order_id')
      .eq('sender', 'customer')
      .eq('read_by_staff', false);
    if (error) return;
    (data || []).forEach((m) => {
      state.unread.set(m.order_id, (state.unread.get(m.order_id) || 0) + 1);
    });
  }

  async function loadOrderDetail(id) {
    const [itemsRes, eventsRes, msgsRes] = await Promise.all([
      sb.from('order_items').select('*').eq('order_id', id).order('id', { ascending: true }),
      sb.from('order_events').select('*').eq('order_id', id).order('id', { ascending: true }),
      sb.from('messages').select('*').eq('order_id', id).order('id', { ascending: true })
    ]);
    if (!itemsRes.error) state.items.set(id, itemsRes.data || []);
    if (!eventsRes.error) state.events.set(id, eventsRes.data || []);
    if (!msgsRes.error) {
      const msgs = msgsRes.data || [];
      state.messages.set(id, msgs);
      msgs.forEach((m) => state.seenMessageIds.add(m.id));
    }
    if (itemsRes.error || eventsRes.error || msgsRes.error) {
      toast('Some order details failed to load.', { type: 'err', action: 'Retry', onAction: () => selectOrder(id) });
    }
  }

  // ---------------------------------------------------------
  // 8. Rendering — queue
  // ---------------------------------------------------------
  function terminalKeys() {
    return new Set(state.statuses.filter((s) => s.is_terminal).map((s) => s.key));
  }

  function ordersForTab() {
    const term = terminalKeys();
    let arr = Array.from(state.orders.values());
    const q = state.search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((o) => {
        const phone = String(o.customer_phone || '').replace(/[^0-9+]/g, '');
        return (o.code || '').toLowerCase().includes(q) ||
          (o.customer_name || '').toLowerCase().includes(q) ||
          phone.includes(q.replace(/[^0-9+]/g, ''));
      });
    }
    if (state.tab === 'open') arr = arr.filter((o) => !term.has(o.status));
    else if (state.tab === 'ready') arr = arr.filter((o) => o.status === 'ready');
    else if (state.tab === 'done') arr = arr.filter((o) => term.has(o.status) && isToday(o.updated_at));
    // 'all' -> everything
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return arr;
  }

  function tabCounts() {
    const term = terminalKeys();
    const all = Array.from(state.orders.values());
    return {
      open: all.filter((o) => !term.has(o.status)).length,
      ready: all.filter((o) => o.status === 'ready').length,
      done: all.filter((o) => term.has(o.status) && isToday(o.updated_at)).length,
      all: all.length
    };
  }

  function renderTabs() {
    const c = tabCounts();
    const defs = [['open', 'Open'], ['ready', 'Ready'], ['done', 'Done today'], ['all', 'All']];
    $('#tabs').innerHTML = defs.map(([k, l]) =>
      `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}" data-testid="tab-${k}">${l}<span class="c">${c[k]}</span></button>`
    ).join('');
  }

  function statusChip(key) {
    const s = state.statusByKey.get(key);
    const label = s ? s.label : key;
    const color = s ? s.color : '#8A8F98';
    return `<span class="chip" style="background:${escAttr(color)};color:${onColor(color)}">${esc(label)}</span>`;
  }

  function renderQueue() {
    const rows = ordersForTab();
    const list = $('#queue');
    if (!rows.length) {
      const label = { open: 'open', ready: 'ready', done: 'completed today', all: '' }[state.tab] || '';
      list.innerHTML = `<div class="qempty"><div class="big">🌿</div>${
        state.search ? 'No orders match “' + esc(state.search) + '”.'
                     : 'No ' + label + ' orders' + (state.tab === 'open' ? ' right now.' : '.') +
                       (state.tab === 'open' ? '<br><span style="opacity:.7">New orders will appear here automatically.</span>' : '')
      }</div>`;
      return;
    }
    const term = terminalKeys();
    list.innerHTML = rows.map((o) => {
      const s = state.statusByKey.get(o.status);
      const color = s ? s.color : '#8A8F98';
      const unread = state.unread.get(o.id) || 0;
      const dim = term.has(o.status) ? 'opacity:.72;' : '';
      return `<div class="ocard ${state.selectedId === o.id ? 'sel' : ''}" style="border-left-color:${escAttr(color)};${dim}"
                data-id="${escAttr(o.id)}" data-testid="queue-row-${escAttr(o.code)}" role="button" tabindex="0">
        ${unread ? `<span class="msgbadge" title="${unread} unread message${unread > 1 ? 's' : ''}">${unread}</span>` : ''}
        <div class="r1"><span class="code">${esc(o.code)}</span><span class="ago">${esc(relTime(o.created_at))}</span></div>
        <div class="nm">${esc(firstLastInitial(o.customer_name))}</div>
        <div class="r2">
          <span class="meta"><b>${o.item_count || 0}</b> item${(o.item_count || 0) === 1 ? '' : 's'} · <b>${money(o.subtotal)}</b></span>
          ${statusChip(o.status)}
        </div>
      </div>`;
    }).join('');
  }

  function renderAll() {
    renderTabs();
    renderQueue();
    if (state.selectedId && state.orders.has(state.selectedId)) {
      renderDetail(state.orders.get(state.selectedId));
    } else if (state.selectedId && !state.orders.has(state.selectedId)) {
      // selected order no longer in the working set
      renderPlaceholder();
    }
  }

  // ---------------------------------------------------------
  // 9. Rendering — detail pane
  // ---------------------------------------------------------
  function renderPlaceholder() {
    $('#detail').classList.remove('show');
    $('#detail').innerHTML =
      `<div class="placeholder"><div class="big">📋</div><div>Select an order to view details</div></div>`;
  }

  function nextStatus(cur) {
    // next non-terminal status by rank after current; if none, first terminal (completed)
    const ordered = state.statuses.slice().sort((a, b) => a.rank - b.rank);
    const idx = ordered.findIndex((s) => s.key === cur);
    if (idx === -1) return null;
    for (let i = idx + 1; i < ordered.length; i++) {
      if (!ordered[i].is_terminal) return ordered[i];
    }
    // no further non-terminal -> first non-cancel terminal
    const doneT = ordered.find((s) => s.is_terminal && s.key !== 'cancelled');
    return doneT || null;
  }

  function renderDetail(o) {
    const d = $('#detail');
    d.classList.add('show');
    const items = state.items.get(o.id) || [];
    const events = state.events.get(o.id) || [];
    const messages = state.messages.get(o.id) || [];
    const s = state.statusByKey.get(o.status);
    const statusColor = s ? s.color : '#8A8F98';
    const statusLabel = s ? s.label : o.status;
    const isTerm = s ? s.is_terminal : false;

    // items rows
    const itemRows = items.length ? items.map((it) => `
      <tr>
        <td>
          ${it.brand ? `<div class="ibrand">${esc(it.brand)}</div>` : ''}
          <div class="iname">${esc(it.name)}</div>
          ${it.variant ? `<div class="ivariant">${esc(it.variant)}</div>` : ''}
        </td>
        <td class="num">${it.qty} <span class="iunit">× ${money(it.unit_price)}</span></td>
        <td class="num"><span class="iline">${money(it.line_total)}</span></td>
      </tr>`).join('')
      : `<tr><td colspan="3" style="color:var(--text-3);padding:16px 18px">No line items recorded.</td></tr>`;

    // timeline
    const tlRows = events.length ? events.map((e) => {
      let label, color;
      if (e.type === 'created') {
        label = 'Order placed'; color = '#D4A72C';
      } else if (e.type === 'status') {
        const to = state.statusByKey.get(e.to_status);
        label = 'Marked ' + (to ? to.label : e.to_status);
        color = to ? to.color : '#8A8F98';
      } else {
        label = 'Note added'; color = '#58A6FF';
      }
      return `<div class="tl">
        <span class="d" style="background:${escAttr(color)}"></span>
        <div class="txt"><b>${esc(label)}</b> <span class="actor">· ${esc(e.actor || 'system')}</span></div>
        <span class="tm">${esc(dateTime(e.created_at))}</span>
      </div>`;
    }).join('') : `<div style="color:var(--text-3);font-size:.86rem">No timeline yet.</div>`;

    // pipeline buttons
    const nxt = nextStatus(o.status);
    let primaryBtn;
    if (isTerm) {
      primaryBtn = `<button class="bigbtn terminal-done" disabled>${esc(statusLabel)} ${o.status === 'cancelled' ? '✕' : '✓'}</button>`;
    } else if (nxt) {
      primaryBtn = `<button class="bigbtn" style="background:${escAttr(nxt.color)};color:${onColor(nxt.color)}"
        data-set-status="${escAttr(nxt.key)}" data-testid="status-btn-${escAttr(nxt.key)}">
        ${nxt.is_terminal ? '✓ ' : '→ '}${esc(nxt.label)}</button>`;
    } else {
      primaryBtn = `<button class="bigbtn terminal-done" disabled>No further step</button>`;
    }

    // other statuses in dropdown
    const others = state.statuses
      .filter((st) => st.key !== o.status && (!nxt || st.key !== nxt.key))
      .map((st) => `<button class="statusopt ${st.key === 'cancelled' ? 'is-cancel' : ''}"
          data-set-status="${escAttr(st.key)}" data-testid="status-btn-${escAttr(st.key)}">
          <span class="d" style="background:${escAttr(st.color)}"></span>${esc(st.label)}
          ${st.is_terminal ? '<span class="term">final</span>' : ''}
        </button>`).join('');

    // chat bubbles
    const chatHtml = messages.length ? messages.map((m) => `
      <div class="bubble ${m.sender === 'staff' ? 'staff' : 'customer'}">
        <div class="who">${esc(m.sender === 'staff' ? (m.sender_name || 'Terps') : (m.sender_name || firstName(o.customer_name)))}</div>
        <div class="body">${esc(m.body)}</div>
        <div class="tm">${esc(clockTime(m.created_at))}</div>
      </div>`).join('')
      : `<div class="empty">No messages yet. Send the customer an update below.</div>`;

    d.innerHTML = `
      <button class="backbtn" data-back>← Queue</button>
      <div class="dinner">
        <div class="dhead">
          <div>
            <h1>${esc(o.code)}</h1>
            <div class="sub">Placed ${esc(relTime(o.created_at))} · ${esc(dateTime(o.created_at))} · In-store pickup · Pay in store</div>
          </div>
          <span class="statuspill" style="background:${escAttr(statusColor)};color:${onColor(statusColor)}">${esc(statusLabel)}</span>
        </div>

        <div class="card-box">
          <div class="bh">Customer</div>
          <div class="cust">
            <div class="row"><b>Name</b><span>${esc(o.customer_name)}</span></div>
            <div class="row"><b>Phone</b><a href="tel:${escAttr(String(o.customer_phone || '').replace(/[^0-9+]/g, ''))}">${esc(o.customer_phone) || '—'}</a></div>
            <div class="row"><b>Email</b>${o.customer_email ? `<a href="mailto:${escAttr(o.customer_email)}">${esc(o.customer_email)}</a>` : '<span style="color:var(--text-3)">—</span>'}</div>
            ${o.note ? `<div class="note"><b>Order note</b>${esc(o.note)}</div>` : ''}
          </div>
        </div>

        <div class="card-box items">
          <table>
            <thead><tr><th>Item</th><th class="num">Qty × Price</th><th class="num">Total</th></tr></thead>
            <tbody>${itemRows}</tbody>
            <tfoot><tr><td>Subtotal (pre-tax)</td><td></td><td class="num">${money(o.subtotal)}</td></tr></tfoot>
          </table>
        </div>

        <div class="pipeline" data-testid="order-detail-pipeline">
          <div class="row">
            ${primaryBtn}
            <div class="moremenu" id="moremenu">
              <button class="trigger" data-more-toggle aria-haspopup="true" aria-expanded="false">Set status ▾</button>
              <div class="pop" role="menu">
                <div class="lbl">Move to…</div>
                <button class="statusopt current"><span class="d" style="background:${escAttr(statusColor)}"></span>${esc(statusLabel)} <span class="term">current</span></button>
                ${others}
              </div>
            </div>
            <button class="moremenu-print hbtn" data-print title="Print pickup ticket" style="padding:1.05em 1.15em">🖨️ Print</button>
          </div>
          ${(!isTerm && nxt && (state.statusByKey.get(nxt.key) || {}).notify_customer !== false)
            ? `<div class="notify-hint">🔔 This update texts + emails ${esc(firstName(o.customer_name))} automatically.</div>` : ''}
        </div>

        <div class="card-box">
          <div class="bh">Timeline</div>
          <div class="timeline">${tlRows}</div>
        </div>

        <div class="card-box">
          <div class="bh">Messages with ${esc(firstName(o.customer_name))}</div>
          <div class="chat">
            <div class="thread" id="chat-messages" data-testid="chat-messages">${chatHtml}</div>
            <div class="composer">
              <input id="chat-input" data-testid="chat-input" type="text" maxlength="2000"
                placeholder="Message the customer…" autocomplete="off">
              <button class="send" id="chat-send" data-testid="chat-send">Send ➤</button>
            </div>
          </div>
        </div>
      </div>`;

    // auto-scroll chat to bottom
    const thread = $('#chat-messages');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  // ---------------------------------------------------------
  // 10. Selection + actions
  // ---------------------------------------------------------
  async function selectOrder(id) {
    state.selectedId = id;
    renderQueue(); // update .sel highlight
    const o = state.orders.get(id);
    if (!o) { renderPlaceholder(); return; }
    // show a light skeleton immediately, then load
    renderDetail(o);
    await loadOrderDetail(id);
    await markMessagesRead(id);
    renderDetail(state.orders.get(id) || o);
  }

  async function setStatus(id, key) {
    const o = state.orders.get(id);
    if (!o || o.status === key) return;
    const target = state.statusByKey.get(key);
    const prev = o.status;
    // optimistic
    o.status = key; o.updated_at = new Date().toISOString();
    renderAll();
    const { error } = await sb.from('orders').update({ status: key }).eq('id', id);
    if (error) {
      o.status = prev; renderAll();
      toast('Could not update status — try again.', { type: 'err' });
      return;
    }
    toast('Order ' + o.code + ' → ' + (target ? target.label : key), { type: 'ok' });
    // realtime will deliver the authoritative row + new timeline event;
    // refresh detail timeline in case realtime is lagging
    if (state.selectedId === id) {
      loadOrderDetail(id).then(() => { if (state.selectedId === id) renderDetail(state.orders.get(id) || o); });
    }
  }

  function requestStatusChange(id, key) {
    if (key === 'cancelled') {
      const o = state.orders.get(id);
      openConfirm(
        'Cancel this order?',
        'Order ' + (o ? o.code : '') + ' will be marked cancelled and the customer notified. This can’t be undone from here.',
        () => setStatus(id, key)
      );
    } else {
      setStatus(id, key);
    }
  }

  async function markMessagesRead(id) {
    if (!(state.unread.get(id) > 0)) return;
    const { error } = await sb.from('messages')
      .update({ read_by_staff: true })
      .eq('order_id', id).eq('sender', 'customer').eq('read_by_staff', false);
    if (!error) {
      state.unread.set(id, 0);
      renderQueue();
    }
  }

  async function sendChat(id) {
    const input = $('#chat-input');
    const btn = $('#chat-send');
    if (!input) return;
    const body = input.value.trim();
    if (!body) return;
    input.disabled = true; btn.disabled = true;
    const { data, error } = await sb.from('messages')
      .insert({ order_id: id, sender: 'staff', sender_name: 'Terps', body: body })
      .select().single();
    input.disabled = false; btn.disabled = false;
    if (error) {
      toast('Message failed to send.', { type: 'err' });
      return;
    }
    input.value = '';
    // append locally (realtime will also fire; seenMessageIds dedupes)
    if (data && !state.seenMessageIds.has(data.id)) {
      state.seenMessageIds.add(data.id);
      const arr = state.messages.get(id) || [];
      arr.push(data);
      state.messages.set(id, arr);
      if (state.selectedId === id) renderDetail(state.orders.get(id));
    }
    input.focus();
  }

  // ---------------------------------------------------------
  // 11. Print ticket (80mm)
  // ---------------------------------------------------------
  function printTicket(id) {
    const o = state.orders.get(id);
    if (!o) return;
    const items = state.items.get(id) || [];
    const s = state.statusByKey.get(o.status);
    const itemsHtml = items.map((it) => `
      <div class="pt-item">
        <div class="l"><span class="n">${esc(it.name)}</span><span>${money(it.line_total)}</span></div>
        <div class="meta">${it.brand ? esc(it.brand) + ' · ' : ''}${it.variant ? esc(it.variant) + ' · ' : ''}${it.qty} × ${money(it.unit_price)}</div>
      </div>`).join('');
    $('#print-ticket').innerHTML = `
      <div class="pt-logo">Terps Dispensary</div>
      <div class="pt-sub">38 N Silicon Dr · Pueblo, CO · (719) 547-1850</div>
      <div class="pt-code">${esc(o.code)}</div>
      <div class="pt-status">${esc(s ? s.label : o.status)}</div>
      <hr>
      <div class="pt-cust"><b>${esc(o.customer_name)}</b></div>
      <div class="pt-cust">${esc(o.customer_phone)}</div>
      <div class="pt-row"><span>Placed</span><span>${esc(dateTime(o.created_at))}</span></div>
      <hr>
      ${itemsHtml || '<div class="pt-item">No items</div>'}
      <hr>
      <div class="pt-tot"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
      <div class="pt-row"><span>${o.item_count || 0} item${(o.item_count || 0) === 1 ? '' : 's'} · pre-tax</span><span></span></div>
      ${o.note ? `<div class="pt-note"><b>Note:</b> ${esc(o.note)}</div>` : ''}
      <div class="pt-foot">Pay in store · 21+ · Keep out of reach of children</div>`;
    window.print();
  }

  // ---------------------------------------------------------
  // 12. Confirm dialog
  // ---------------------------------------------------------
  let confirmCb = null;
  function openConfirm(title, msg, cb) {
    confirmCb = cb;
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = msg;
    $('#confirm-ov').classList.add('open');
  }
  function closeConfirm() { $('#confirm-ov').classList.remove('open'); confirmCb = null; }

  // ---------------------------------------------------------
  // 13. Manage-statuses modal
  // ---------------------------------------------------------
  const stEdit = { key: null }; // null => creating new

  function openStatusModal() {
    stEdit.key = null;
    renderStatusModal();
    $('#status-modal-ov').classList.add('open');
  }
  function closeStatusModal() { $('#status-modal-ov').classList.remove('open'); }

  // count how many orders currently use a status (block delete if > 0)
  async function statusUsage(key) {
    const { count, error } = await sb.from('orders')
      .select('id', { count: 'exact', head: true }).eq('status', key);
    if (error) return null;
    return count || 0;
  }

  function renderStatusModal() {
    const list = state.statuses.slice().sort((a, b) => a.rank - b.rank);
    $('#st-list').innerHTML = list.map((s) => `
      <div class="st-item" data-key="${escAttr(s.key)}">
        <span class="sw" style="background:${escAttr(s.color)}"></span>
        <div>
          <div class="lab">${esc(s.label)}</div>
          <div class="key">${esc(s.key)}${s.is_terminal ? ' · terminal' : ''}</div>
        </div>
        <span class="rk">#${s.rank}</span>
        ${s.is_terminal ? '<span class="tag">final</span>' : '<span></span>'}
        <div class="acts">
          <button class="iconbtn" data-edit="${escAttr(s.key)}" title="Edit">✎</button>
          <button class="iconbtn danger" data-del="${escAttr(s.key)}" title="Delete">🗑</button>
        </div>
      </div>`).join('');

    // form
    const editing = stEdit.key ? state.statusByKey.get(stEdit.key) : null;
    const nextRank = list.length ? Math.max.apply(null, list.map((s) => s.rank)) + 10 : 10;
    $('#st-form-title').textContent = editing ? ('Edit “' + editing.label + '”') : 'Add a status';
    $('#st-label').value = editing ? editing.label : '';
    $('#st-rank').value = editing ? editing.rank : nextRank;
    $('#st-color').value = editing ? editing.color : '#7FB069';
    $('#st-form-error').textContent = '';
    updateKeyPreview();
    $('#st-cancel-edit').classList.toggle('hidden', !editing);
    $('#st-save').textContent = editing ? 'Save changes' : 'Add status';
  }

  function updateKeyPreview() {
    const editing = stEdit.key ? state.statusByKey.get(stEdit.key) : null;
    if (editing) {
      $('#st-key-preview').textContent = 'key: ' + editing.key + ' (locked)';
    } else {
      const k = slugify($('#st-label').value);
      $('#st-key-preview').textContent = k ? ('key: ' + k) : 'key: (from label)';
    }
  }

  async function saveStatus() {
    const errEl = $('#st-form-error');
    errEl.textContent = '';
    const label = $('#st-label').value.trim();
    const rank = parseInt($('#st-rank').value, 10);
    const color = $('#st-color').value;
    if (!label) { errEl.textContent = 'Label is required.'; return; }
    if (isNaN(rank)) { errEl.textContent = 'Rank must be a number.'; return; }
    const btn = $('#st-save');
    btn.disabled = true;

    if (stEdit.key) {
      // edit: label, color, rank only (key immutable)
      const { error } = await sb.from('order_statuses')
        .update({ label, color, rank }).eq('key', stEdit.key);
      btn.disabled = false;
      if (error) { errEl.textContent = error.message || 'Update failed.'; return; }
      toast('Status updated.', { type: 'ok' });
    } else {
      const key = slugify(label);
      if (!key) { btn.disabled = false; errEl.textContent = 'Could not derive a key from that label.'; return; }
      if (state.statusByKey.has(key)) { btn.disabled = false; errEl.textContent = 'A status with key “' + key + '” already exists.'; return; }
      const { error } = await sb.from('order_statuses')
        .insert({ key, label, color, rank, is_terminal: false, notify_customer: true });
      btn.disabled = false;
      if (error) { errEl.textContent = error.message || 'Create failed.'; return; }
      toast('Status “' + label + '” added.', { type: 'ok' });
    }
    await loadStatuses();
    stEdit.key = null;
    renderStatusModal();
    renderAll();
  }

  async function deleteStatus(key) {
    const usage = await statusUsage(key);
    if (usage === null) { toast('Could not check usage — try again.', { type: 'err' }); return; }
    if (usage > 0) {
      toast(usage + ' order' + (usage > 1 ? 's' : '') + ' still use this status. Move them first.', { type: 'err' });
      return;
    }
    const s = state.statusByKey.get(key);
    openConfirm('Delete status?', 'Remove “' + (s ? s.label : key) + '” from the pipeline? No orders currently use it.', async () => {
      const { error } = await sb.from('order_statuses').delete().eq('key', key);
      if (error) { toast(error.message || 'Delete failed.', { type: 'err' }); return; }
      toast('Status removed.', { type: 'ok' });
      await loadStatuses();
      if (stEdit.key === key) stEdit.key = null;
      renderStatusModal();
      renderAll();
    });
  }

  // ---------------------------------------------------------
  // 14. Realtime + polling fallback
  // ---------------------------------------------------------
  function setConn(stateStr) {
    state.connState = stateStr;
    const el = $('#conn');
    if (!el) return;
    el.className = 'conn ' + stateStr;
    el.querySelector('.label').textContent =
      stateStr === 'live' ? 'Live' : stateStr === 'reconnecting' ? 'Reconnecting…' : 'Offline';
  }

  function setupRealtime() {
    teardownRealtime();
    const ch = sb.channel('staff-orders-' + Date.now());
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => onOrderInsert(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => onOrderUpdate(p.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onMessageInsert(p.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events' }, (p) => onEventInsert(p.new))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConn('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConn('reconnecting');
        else if (status === 'CLOSED') setConn('reconnecting');
      });
    state.channel = ch;
  }
  function teardownRealtime() {
    if (state.channel) { try { sb.removeChannel(state.channel); } catch (e) {} state.channel = null; }
  }

  function onOrderInsert(row) {
    if (!row || !row.id) return;
    const isNew = !state.orders.has(row.id);
    state.orders.set(row.id, row);
    renderAll();
    if (isNew) {
      Sound.newOrder();
      notify('New order · ' + row.code, firstLastInitial(row.customer_name) + ' · ' + money(row.subtotal));
      bumpTitle();
      toast('New order ' + row.code + ' from ' + firstLastInitial(row.customer_name), {
        type: 'ok', action: 'View', onAction: () => { state.tab = 'open'; selectOrder(row.id); renderTabs(); }
      });
      // brief flash on the new row
      setTimeout(() => {
        const el = $('.ocard[data-id="' + cssEsc(row.id) + '"]');
        if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); }
      }, 40);
    }
  }
  function onOrderUpdate(row) {
    if (!row || !row.id) return;
    const existed = state.orders.get(row.id);
    state.orders.set(row.id, row);
    renderAll();
    if (existed && state.selectedId === row.id) {
      // refresh timeline for the change
      loadOrderDetail(row.id).then(() => { if (state.selectedId === row.id) renderDetail(row); });
    }
  }
  function onMessageInsert(row) {
    if (!row || !row.id) return;
    if (state.seenMessageIds.has(row.id)) return; // dedupe
    state.seenMessageIds.add(row.id);
    // append to thread cache if loaded
    if (state.messages.has(row.order_id)) {
      const arr = state.messages.get(row.order_id);
      arr.push(row);
      state.messages.set(row.order_id, arr);
    }
    if (row.sender === 'customer') {
      if (state.selectedId === row.order_id) {
        // thread open -> mark read immediately + re-render
        markMessagesRead(row.order_id);
        renderDetail(state.orders.get(row.order_id) || {});
      } else {
        state.unread.set(row.order_id, (state.unread.get(row.order_id) || 0) + 1);
        renderQueue();
        Sound.message();
        const o = state.orders.get(row.order_id);
        notify('New message' + (o ? ' · ' + o.code : ''), (row.sender_name || 'Customer') + ': ' + row.body.slice(0, 80));
        bumpTitle();
      }
    } else if (state.selectedId === row.order_id) {
      renderDetail(state.orders.get(row.order_id) || {});
    }
  }
  function onEventInsert(row) {
    if (!row || !row.order_id) return;
    if (state.selectedId !== row.order_id) return;
    if (!state.events.has(row.order_id)) return;
    const arr = state.events.get(row.order_id);
    if (arr.some((e) => e.id === row.id)) return; // dedupe
    arr.push(row);
    state.events.set(row.order_id, arr);
    renderDetail(state.orders.get(row.order_id) || {});
  }

  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\\]]/g, '\\$&');
  }

  // 30s polling fallback: refresh whenever realtime isn't live
  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      // Always keep relative timestamps fresh
      renderQueue();
      if (state.connState !== 'live') {
        await loadOrders();
        if (state.selectedId) {
          await loadOrderDetail(state.selectedId);
          if (state.orders.has(state.selectedId)) renderDetail(state.orders.get(state.selectedId));
        }
      }
    }, 30000);
  }

  // ---------------------------------------------------------
  // 15. Event wiring (delegation)
  // ---------------------------------------------------------
  function wireEvents() {
    // login
    $('#login-form').addEventListener('submit', doLogin);
    $('#logout').addEventListener('click', doLogout);

    // sound toggle
    $('#sound-toggle').addEventListener('click', function () {
      state.soundOn = !state.soundOn;
      this.classList.toggle('sound-off', !state.soundOn);
      $('#sound-icon').textContent = state.soundOn ? '🔔' : '🔕';
      this.setAttribute('aria-pressed', String(state.soundOn));
      toast(state.soundOn ? 'Sound on' : 'Sound muted');
    });

    // manage statuses
    $('#manage-statuses').addEventListener('click', openStatusModal);
    $('#status-modal-close').addEventListener('click', closeStatusModal);
    $('#status-modal-ov').addEventListener('click', (e) => { if (e.target.id === 'status-modal-ov') closeStatusModal(); });

    // tabs (delegation)
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      state.tab = b.dataset.tab;
      renderTabs(); renderQueue();
    });

    // search
    const searchEl = $('#queue-search');
    searchEl.addEventListener('input', () => { state.search = searchEl.value; renderQueue(); });
    $('#search-clear').addEventListener('click', () => { searchEl.value = ''; state.search = ''; renderQueue(); searchEl.focus(); });

    // queue selection (delegation) — click + keyboard
    $('#queue').addEventListener('click', (e) => {
      const card = e.target.closest('.ocard');
      if (card) selectOrder(card.dataset.id);
    });
    $('#queue').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.ocard');
      if (card) { e.preventDefault(); selectOrder(card.dataset.id); }
    });

    // detail pane (delegation): status buttons, print, more-menu, back, chat
    $('#detail').addEventListener('click', (e) => {
      const setBtn = e.target.closest('[data-set-status]');
      if (setBtn) { requestStatusChange(state.selectedId, setBtn.dataset.setStatus); closeMore(); return; }
      if (e.target.closest('[data-print]')) { printTicket(state.selectedId); return; }
      if (e.target.closest('[data-more-toggle]')) { toggleMore(); return; }
      if (e.target.closest('[data-back]')) { $('#detail').classList.remove('show'); return; }
      if (e.target.closest('#chat-send')) { sendChat(state.selectedId); return; }
    });
    $('#detail').addEventListener('keydown', (e) => {
      if (e.target.id === 'chat-input' && e.key === 'Enter') { e.preventDefault(); sendChat(state.selectedId); }
    });

    // close more-menu on outside click
    document.addEventListener('click', (e) => {
      const mm = $('#moremenu');
      if (mm && mm.classList.contains('open') && !e.target.closest('#moremenu')) closeMore();
    });

    // status modal (delegation)
    $('#st-list').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (ed) { stEdit.key = ed.dataset.edit; renderStatusModal(); }
      else if (del) { deleteStatus(del.dataset.del); }
    });
    $('#st-label').addEventListener('input', updateKeyPreview);
    $('#st-save').addEventListener('click', saveStatus);
    $('#st-cancel-edit').addEventListener('click', () => { stEdit.key = null; renderStatusModal(); });

    // confirm dialog
    $('#confirm-yes').addEventListener('click', () => { const cb = confirmCb; closeConfirm(); if (cb) cb(); });
    $('#confirm-no').addEventListener('click', closeConfirm);
    $('#confirm-ov').addEventListener('click', (e) => { if (e.target.id === 'confirm-ov') closeConfirm(); });

    // escape closes overlays
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#confirm-ov').classList.contains('open')) closeConfirm();
      else if ($('#status-modal-ov').classList.contains('open')) closeStatusModal();
      else closeMore();
    });
  }

  function toggleMore() {
    const mm = $('#moremenu');
    if (!mm) return;
    const open = mm.classList.toggle('open');
    const t = mm.querySelector('.trigger');
    if (t) t.setAttribute('aria-expanded', String(open));
  }
  function closeMore() {
    const mm = $('#moremenu');
    if (mm) { mm.classList.remove('open'); const t = mm.querySelector('.trigger'); if (t) t.setAttribute('aria-expanded', 'false'); }
  }

  function renderConnError() {
    setConn('down');
  }

  // ---------------------------------------------------------
  // 16. Boot
  // ---------------------------------------------------------
  function boot() {
    document.title = state.baseTitle;
    wireEvents();
    if (!configured) {
      $('#boot').classList.add('hidden');
      $('#gate-oops').classList.remove('hidden');
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      $('#boot').classList.add('hidden');
      $('#gate-oops').classList.remove('hidden');
      $('#oops-msg').textContent = 'Could not load the Supabase library. Check the network and reload.';
      return;
    }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    initAuth().catch((err) => {
      console.error(err);
      $('#boot').classList.add('hidden');
      $('#gate-oops').classList.remove('hidden');
      $('#oops-msg').textContent = 'Something went wrong starting the dashboard. Reload to try again.';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
