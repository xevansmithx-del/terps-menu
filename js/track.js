/* ============================================================
   TERPS order tracking page (order.html)
   Reads ?c=<code>&t=<token>, renders status + timeline + summary,
   live chat with the store, and cancel (while new/confirmed).
   Polls get_order every 6s while the tab is visible + on focus.
   Depends on window.Orders (js/orders.js) + window.TERPS_BACKEND.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = $('#track-root');
  var STORE_TEL = '7195471850', STORE_TEL_DISP = '(719) 547-1850';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(x) { return '$' + Number(x || 0).toFixed(2); }
  function param(k) {
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }
  function fmtTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    var t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return sameDay ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + t;
  }

  var CODE = param('c'), TOKEN = param('t');
  var poll = null, sending = false, cancelling = false, lastData = null;

  // ---------------------------------------------------------------
  // No code in the URL → show the returning-visitor locker (if any).
  // ---------------------------------------------------------------
  function renderRecent() {
    var mine = (window.Orders && Orders.listMine) ? Orders.listMine() : [];
    if (!mine.length) {
      root.innerHTML =
        '<div class="center"><div class="big">No order selected</div>' +
        '<p>Open the tracking link from your confirmation to see your order status, or browse the menu to start one.</p>' +
        '<a class="btn btn-gold" href="menu.html">Browse the menu →</a></div>';
      return;
    }
    var rows = mine.map(function (o) {
      var url = 'order.html?c=' + encodeURIComponent(o.code) + '&t=' + encodeURIComponent(o.token);
      var meta = [];
      if (o.item_count) meta.push(o.item_count + (o.item_count === 1 ? ' item' : ' items'));
      if (o.subtotal != null) meta.push(money(o.subtotal));
      if (o.at) meta.push(fmtTime(new Date(o.at).toISOString()));
      return '<a href="' + esc(url) + '"><span><span class="c">' + esc(o.code) + '</span>' +
        (meta.length ? '<span class="m"> · ' + esc(meta.join(' · ')) + '</span>' : '') +
        '</span><span class="go">Track →</span></a>';
    }).join('');
    root.innerHTML =
      '<h1 style="font-size:1.7rem;margin-bottom:6px">Your recent orders</h1>' +
      '<p style="color:var(--muted);margin-bottom:16px;font-size:.92rem">Tap an order to see its status and message the store.</p>' +
      '<div class="recent">' + rows + '</div>';
  }

  // ---------------------------------------------------------------
  // Not found / bad token.
  // ---------------------------------------------------------------
  function renderNotFound() {
    root.innerHTML =
      '<div class="center"><div class="big">Order not found</div>' +
      '<p>We couldn’t find an order for that link. Double-check the link from your confirmation email, or give us a call and we’ll help.</p>' +
      '<a class="btn btn-gold" href="tel:' + STORE_TEL + '">Call ' + STORE_TEL_DISP + '</a>' +
      '<div style="margin-top:12px"><a class="btn btn-ghost" href="menu.html">Back to menu</a></div></div>';
  }

  // ---------------------------------------------------------------
  // Build the shell ONCE, then patch mutable regions on each poll so
  // we never clobber what the customer is typing in the chat box.
  // ---------------------------------------------------------------
  function statusMap(data) {
    var m = {};
    (data.statuses || []).forEach(function (s) { m[s.key] = s; });
    return m;
  }

  function renderShell(data) {
    var o = data.order;
    root.innerHTML =
      '<div id="banner-slot"></div>' +
      '<div id="steps-slot"></div>' +
      '<div class="cancelrow" id="cancel-slot"></div>' +
      '<div class="card" id="items-slot"></div>' +
      '<div class="card"><h4>Chat with the store</h4>' +
        '<div class="chat">' +
          '<div class="hint">Questions about your order? Message us here. We usually reply during store hours.</div>' +
          '<div class="msgs" data-testid="chat-messages" id="chat-messages"></div>' +
          '<form id="chat-form" autocomplete="off">' +
            '<input data-testid="chat-input" id="chat-input" placeholder="Type a message…" maxlength="2000">' +
            '<button class="send" data-testid="chat-send" id="chat-send" type="submit">Send</button>' +
          '</form>' +
        '</div></div>' +
      '<div class="card"><h4>Order details</h4>' +
        '<div class="li"><span class="nm">Name</span><span>' + esc(o.customer_name) + '</span></div>' +
        '<div class="li"><span class="nm">Pickup</span><span>38 N Silicon Dr, Pueblo</span></div>' +
        '<div class="li"><span class="nm">Payment</span><span>Pay in store · 21+ w/ valid ID</span></div>' +
        (o.note ? '<div class="li"><span class="nm">Your note</span><span>' + esc(o.note) + '</span></div>' : '') +
      '</div>' +
      '<div class="card"><h4>Order timeline</h4><div data-testid="track-timeline" id="timeline-slot"></div></div>' +
      '<div class="card store"><h4>Visit Terps</h4>' +
        '<div class="row"><b>Address</b><span>38 N Silicon Dr<br>Pueblo, CO 81007</span></div>' +
        '<div class="row"><b>Phone</b><span><a href="tel:' + STORE_TEL + '">' + STORE_TEL_DISP + '</a></span></div>' +
        '<div class="row"><b>Mon–Sat</b><span>8:00am – 8:00pm</span></div>' +
        '<div class="row"><b>Sunday</b><span>10:00am – 5:00pm</span></div>' +
      '</div>';

    // wire chat submit once
    var form = $('#chat-form');
    form.addEventListener('submit', function (e) { e.preventDefault(); onSend(); });
  }

  function patchBanner(data) {
    var o = data.order, sm = statusMap(data), st = sm[o.status] || { label: o.status, color: '#8A8F98', is_terminal: false };
    var slot = $('#banner-slot');
    var cancelled = o.status === 'cancelled';
    var sub;
    if (cancelled) sub = 'This order was cancelled. Nothing to pick up. Questions? Message us below.';
    else if (o.status === 'ready') sub = 'Your order is ready! Come grab it at 38 N Silicon Dr. Bring a valid 21+ ID.';
    else if (o.status === 'completed') sub = 'Picked up — thanks for shopping with Terps!';
    else if (o.status === 'new') sub = 'We’ve got your reservation. We’ll email you as it moves along.';
    else if (o.status === 'confirmed') sub = 'Confirmed! We’ll start preparing it shortly.';
    else if (o.status === 'preparing') sub = 'We’re putting your order together now.';
    else sub = '';
    slot.innerHTML =
      '<div class="banner' + (cancelled ? ' cancelled' : '') + '" data-testid="track-status" style="background:' +
        esc(st.color) + '">' +
        '<div class="code">Order ' + esc(o.code) + '</div>' +
        '<div class="lbl">' + esc(st.label) + '</div>' +
        (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  function patchSteps(data) {
    var o = data.order, slot = $('#steps-slot');
    if (o.status === 'cancelled') { slot.innerHTML = ''; return; } // red banner replaces steps
    var nonTerminal = (data.statuses || [])
      .filter(function (s) { return !s.is_terminal; })
      .sort(function (a, b) { return a.rank - b.rank; });
    if (!nonTerminal.length) { slot.innerHTML = ''; return; }
    var sm = statusMap(data);
    var curRank = (sm[o.status] && sm[o.status].rank) || 0;
    // for a completed (terminal) order, light every non-terminal step as done
    var completed = o.status === 'completed';
    slot.innerHTML = '<div class="steps">' + nonTerminal.map(function (s) {
      var cls = completed || s.rank < curRank ? 'done' : (s.rank === curRank ? 'active' : '');
      return '<div class="step ' + cls + '"><div class="bar"></div><div class="t">' + esc(s.label) + '</div></div>';
    }).join('') + '</div>';
  }

  function patchCancel(data) {
    var o = data.order, slot = $('#cancel-slot');
    if (o.status !== 'new' && o.status !== 'confirmed') { slot.innerHTML = ''; return; }
    slot.innerHTML = '<button class="cbtn" data-testid="track-cancel" id="cancel-btn">Cancel this order</button>';
    $('#cancel-btn').addEventListener('click', onCancel);
  }

  function patchItems(data) {
    var slot = $('#items-slot');
    var rows = (data.items || []).map(function (i) {
      var line = i.line_total != null ? i.line_total : (i.qty * i.unit_price);
      return '<div class="li"><span><span class="q">' + i.qty + '× </span>' +
        '<span class="nm">' + esc(i.name) + '</span>' +
        (i.variant ? '<div class="vr">' + esc(i.variant) + '</div>' : '') +
        '</span><span class="pr">' + money(line) + '</span></div>';
    }).join('');
    slot.innerHTML = '<h4>Your items</h4>' + rows +
      '<div class="subtot"><span>Subtotal (pre-tax)</span><span>' + money(data.order.subtotal) + '</span></div>';
  }

  function patchTimeline(data) {
    var slot = $('#timeline-slot'), sm = statusMap(data);
    var evs = (data.events || []).slice();
    var html = evs.map(function (e) {
      var label, color = '#6E7681';
      if (e.type === 'created') { label = 'Order placed'; color = (sm['new'] && sm['new'].color) || color; }
      else if (e.type === 'status') {
        var s = sm[e.to_status];
        label = s ? s.label : e.to_status;
        color = s ? s.color : color;
        if (e.actor === 'customer' && e.to_status === 'cancelled') label += ' (by you)';
      } else if (e.type === 'note') { label = 'Note added'; }
      else { label = e.type; }
      return '<div class="tl"><span class="dot" style="background:' + esc(color) + '"></span>' +
        '<span class="txt">' + esc(label) + '</span><span class="tm">' + esc(fmtTime(e.created_at)) + '</span></div>';
    }).join('');
    slot.innerHTML = html || '<div class="tl"><span class="txt" style="color:var(--muted)">No activity yet.</span></div>';
  }

  function patchMessages(data) {
    var box = $('#chat-messages');
    if (!box) return;
    // preserve scroll-at-bottom behaviour
    var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    var msgs = data.messages || [];
    if (!msgs.length) {
      box.innerHTML = '<div class="empty">No messages yet. Say hi — we’re here to help.</div>';
      return;
    }
    box.innerHTML = msgs.map(function (m) {
      var who = m.sender === 'staff' ? 'Terps' : 'You';
      return '<div class="m ' + (m.sender === 'staff' ? 'staff' : 'customer') + '">' +
        '<div class="who">' + esc(who) + '</div>' +
        '<div>' + esc(m.body) + '</div>' +
        '<div class="tm">' + esc(fmtTime(m.created_at)) + '</div></div>';
    }).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  // full patch of every mutable region from fresh data
  function apply(data) {
    lastData = data;
    patchBanner(data); patchSteps(data); patchCancel(data);
    patchItems(data); patchTimeline(data); patchMessages(data);
    document.title = 'Order ' + data.order.code + ' · ' + (statusMap(data)[data.order.status] || {}).label + ' · Terps';
  }

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  async function onSend() {
    if (sending) return;
    var input = $('#chat-input'), btn = $('#chat-send');
    var body = (input.value || '').trim();
    if (!body) return;
    sending = true; btn.disabled = true; input.disabled = true;
    try {
      await Orders.sendMessage(CODE, TOKEN, body);
      input.value = '';
      // optimistic-ish: pull fresh state right away
      var data = await Orders.getOrder(CODE, TOKEN);
      if (data) apply(data);
      var box = $('#chat-messages'); if (box) box.scrollTop = box.scrollHeight;
    } catch (e) {
      alert('Message didn’t send. Please try again, or call us at ' + STORE_TEL_DISP + '.');
    } finally {
      sending = false;
      if (btn) btn.disabled = false;
      if (input) { input.disabled = false; input.focus(); }
    }
  }

  async function onCancel() {
    if (cancelling) return;
    if (!confirm('Cancel this order? This can’t be undone. If you just want to change it, message the store instead.')) return;
    var btn = $('#cancel-btn');
    cancelling = true; if (btn) { btn.disabled = true; btn.textContent = 'Cancelling…'; }
    try {
      var r = await Orders.cancelOrder(CODE, TOKEN);
      if (r && r.ok === false) {
        alert(r.reason || 'This order can no longer be cancelled online.');
      }
      var data = await Orders.getOrder(CODE, TOKEN);
      if (data) apply(data);
    } catch (e) {
      alert('Couldn’t cancel right now. Please call us at ' + STORE_TEL_DISP + '.');
    } finally {
      cancelling = false;
      var b = $('#cancel-btn'); if (b) { b.disabled = false; b.textContent = 'Cancel this order'; }
    }
  }

  // ---------------------------------------------------------------
  // Polling (only while visible)
  // ---------------------------------------------------------------
  async function tick() {
    if (document.hidden) return;
    try {
      var data = await Orders.getOrder(CODE, TOKEN);
      if (data && data.order) apply(data);
    } catch (e) { /* transient; keep last good render */ }
  }
  function startPolling() {
    stopPolling();
    poll = setInterval(tick, 6000);
  }
  function stopPolling() { if (poll) { clearInterval(poll); poll = null; } }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPolling();
    else { tick(); startPolling(); }
  });
  window.addEventListener('focus', tick);

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot() {
    if (!CODE) { renderRecent(); return; }
    if (!window.Orders || !Orders.getOrder) { renderNotFound(); return; }
    var data;
    try { data = await Orders.getOrder(CODE, TOKEN); }
    catch (e) { data = null; }
    if (!data || !data.order) { renderNotFound(); return; }
    // keep it in the locker so it shows up next visit even if opened via a
    // fresh link on this device
    try { Orders.saveMine({ code: data.order.code, token: TOKEN, name: data.order.customer_name, subtotal: data.order.subtotal, item_count: data.order.item_count }); } catch (e) {}
    renderShell(data);
    apply(data);
    if (!document.hidden) startPolling();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
