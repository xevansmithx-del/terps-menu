/* ============================================================
   TERPS order client — CONSUMER side (storefront + tracking page)
   Talks to Supabase SECURITY DEFINER RPCs via plain fetch (no supabase-js).
   Contract: backend/schema.sql
     place_order(p)                       -> {ok, code, token}
     get_order(p_code, p_token)           -> {order, items, events, messages, statuses} | null
     customer_message(p_code,p_token,p_body) -> {ok}
     customer_cancel(p_code, p_token)     -> {ok} | {ok:false, reason}

   Modes:
     LIVE  — window.TERPS_BACKEND has real supabaseUrl + anon key.
     DEMO  — placeholders still in place (local preview): localStorage only.
             The demo path is preserved so `open site/menu.html` works with
             no backend, and so the tracking page has something to read.

   Exposed: window.Orders = { placeOrder, getOrder, sendMessage, cancelOrder,
                               isLive, saveMine, listMine }
   ============================================================ */
(function () {
  'use strict';

  var CFG = (window.TERPS_BACKEND) || {};
  var PLACEHOLDER = /^__.*__$/; // e.g. "__SUPABASE_URL__"
  function looksReal(v) { return typeof v === 'string' && v.length > 0 && !PLACEHOLDER.test(v); }
  var LIVE = looksReal(CFG.supabaseUrl) && looksReal(CFG.supabaseAnonKey);

  // ---- helpers ---------------------------------------------------------
  function rpcUrl(fn) {
    return String(CFG.supabaseUrl).replace(/\/+$/, '') + '/rest/v1/rpc/' + fn;
  }
  function headers() {
    return {
      'apikey': CFG.supabaseAnonKey,
      'Authorization': 'Bearer ' + CFG.supabaseAnonKey,
      'Content-Type': 'application/json'
    };
  }
  // Call an RPC. Throws Error(message) on any failure so callers can show a
  // friendly state. Returns the parsed JSON body of the function.
  async function rpc(fn, args) {
    var res;
    try {
      res = await fetch(rpcUrl(fn), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(args || {})
      });
    } catch (e) {
      throw new Error('network'); // offline / DNS / CORS at transport level
    }
    var text = await res.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = text; } }
    if (!res.ok) {
      // PostgREST error shape: {message, hint, details, code}
      var msg = (data && (data.message || data.hint)) || ('http_' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  // Map a cart line {id,name,strain,price,qty,img,brand?} -> RPC item shape.
  function toItem(ci) {
    var qty = Math.max(1, Math.min(99, parseInt(ci.qty, 10) || 1));
    var price = Number(ci.price);
    if (!isFinite(price) || price < 0) price = 0;
    if (price > 10000) price = 10000;
    return {
      product_id: ci.id != null ? String(ci.id) : null,
      name: String(ci.name || '').slice(0, 200),
      brand: ci.brand != null && ci.brand !== '' ? String(ci.brand) : null,
      variant: ci.strain != null && ci.strain !== '' ? String(ci.strain) : null,
      qty: qty,
      unit_price: price
    };
  }

  // ---- "my orders" locker (returning-visitor convenience) --------------
  var MINE_KEY = 'terps_my_orders';
  function listMine() {
    try {
      var a = JSON.parse(localStorage.getItem(MINE_KEY));
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveMine(entry) {
    // entry = {code, token, at, name?, subtotal?, item_count?}
    if (!entry || !entry.code || !entry.token) return;
    var a = listMine().filter(function (o) { return o.code !== entry.code; });
    a.unshift({
      code: entry.code,
      token: entry.token,
      at: entry.at || Date.now(),
      name: entry.name || '',
      subtotal: entry.subtotal != null ? entry.subtotal : null,
      item_count: entry.item_count != null ? entry.item_count : null
    });
    if (a.length > 25) a = a.slice(0, 25);
    try { localStorage.setItem(MINE_KEY, JSON.stringify(a)); } catch (e) {}
  }

  /* ====================================================================
     DEMO fallback — localStorage only. Kept faithful so the site is fully
     clickable with no backend. Shapes mirror the RPC payloads so track.js
     needs no branching.
     ==================================================================== */
  var Demo = {
    KEY: 'terps_demo_orders_v2',
    SEQ: 'terps_demo_seq',
    STATUSES: [
      { key: 'new',       label: 'New',              rank: 10, color: '#D4A72C', is_terminal: false },
      { key: 'confirmed', label: 'Confirmed',        rank: 20, color: '#7FB069', is_terminal: false },
      { key: 'preparing', label: 'Preparing',        rank: 30, color: '#58A6FF', is_terminal: false },
      { key: 'ready',     label: 'Ready for pickup', rank: 40, color: '#2EA043', is_terminal: false },
      { key: 'completed', label: 'Completed',        rank: 50, color: '#6E7681', is_terminal: true  },
      { key: 'cancelled', label: 'Cancelled',        rank: 60, color: '#F85149', is_terminal: true  }
    ],
    _all: function () { try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { return {}; } },
    _save: function (o) { try { localStorage.setItem(this.KEY, JSON.stringify(o)); } catch (e) {} },
    _code: function () {
      var n = parseInt(localStorage.getItem(this.SEQ) || '1042', 10) + 1;
      localStorage.setItem(this.SEQ, String(n));
      return 'TD-' + n;
    },
    _token: function () {
      var s = '';
      for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
      return s;
    },
    place: function (items, customer, note) {
      var lines = items.map(toItem);
      var sub = 0, count = 0;
      lines = lines.map(function (l) {
        var lt = Math.round(l.qty * l.unit_price * 100) / 100;
        sub += lt; count += l.qty;
        l.line_total = lt;
        return l;
      });
      sub = Math.round(sub * 100) / 100;
      var code = this._code(), token = this._token(), now = new Date().toISOString();
      var rec = {
        order: {
          code: code, status: 'new',
          customer_name: customer.name, customer_phone: customer.phone,
          customer_email: customer.email || null,
          note: note || null, subtotal: sub, item_count: count,
          created_at: now, updated_at: now
        },
        items: lines,
        events: [{ type: 'created', from_status: null, to_status: 'new', actor: 'customer', created_at: now }],
        messages: [],
        statuses: this.STATUSES,
        _token: token
      };
      var all = this._all(); all[code] = rec; this._save(all);
      return { ok: true, code: code, token: token };
    },
    get: function (code, token) {
      var rec = this._all()[code];
      if (!rec || rec._token !== token) return null;
      var out = {};
      out.order = rec.order; out.items = rec.items; out.events = rec.events;
      out.messages = rec.messages; out.statuses = rec.statuses;
      return out;
    },
    message: function (code, token, body) {
      var all = this._all(), rec = all[code];
      if (!rec || rec._token !== token) throw new Error('order not found');
      rec.messages.push({ sender: 'customer', sender_name: rec.order.customer_name, body: String(body).trim(), created_at: new Date().toISOString() });
      this._save(all);
      return { ok: true };
    },
    cancel: function (code, token) {
      var all = this._all(), rec = all[code];
      if (!rec || rec._token !== token) throw new Error('order not found');
      if (rec.order.status !== 'new' && rec.order.status !== 'confirmed') {
        return { ok: false, reason: 'Order is already being prepared — message the store instead.' };
      }
      var now = new Date().toISOString();
      rec.events.push({ type: 'status', from_status: rec.order.status, to_status: 'cancelled', actor: 'customer', created_at: now });
      rec.order.status = 'cancelled'; rec.order.updated_at = now;
      this._save(all);
      return { ok: true };
    }
  };

  /* ====================================================================
     PUBLIC API
     ==================================================================== */
  var Orders = {
    isLive: LIVE,

    // placeOrder(cart, customer, note) -> {code, token}
    // cart: array of {id,name,strain,price,qty,img,brand?}
    // customer: {name, phone, email}
    async placeOrder(cart, customer, note) {
      var items = (cart || []).filter(function (i) { return i && i.name; });
      if (!items.length) throw new Error('empty cart');
      if (items.length > 50) items = items.slice(0, 50);
      customer = customer || {};
      var noteStr = note ? String(note).slice(0, 500) : null;

      if (!LIVE) {
        var d = Demo.place(items, customer, noteStr);
        return { code: d.code, token: d.token };
      }
      var payload = {
        p: {
          customer: {
            name: String(customer.name || '').trim(),
            phone: String(customer.phone || '').trim(),
            email: customer.email ? String(customer.email).trim() : null
          },
          note: noteStr,
          items: items.map(toItem)
        }
      };
      var r = await rpc('place_order', payload);
      if (!r || !r.ok || !r.code || !r.token) throw new Error((r && r.reason) || 'order failed');
      return { code: r.code, token: r.token };
    },

    // getOrder(code, token) -> payload | null
    async getOrder(code, token) {
      if (!code || !token) return null;
      if (!LIVE) return Demo.get(code, token);
      return await rpc('get_order', { p_code: code, p_token: token });
    },

    // sendMessage(code, token, body) -> {ok}
    async sendMessage(code, token, body) {
      var b = String(body || '').trim();
      if (!b) throw new Error('empty message');
      if (b.length > 2000) b = b.slice(0, 2000);
      if (!LIVE) return Demo.message(code, token, b);
      return await rpc('customer_message', { p_code: code, p_token: token, p_body: b });
    },

    // cancelOrder(code, token) -> {ok} | {ok:false, reason}
    async cancelOrder(code, token) {
      if (!LIVE) return Demo.cancel(code, token);
      return await rpc('customer_cancel', { p_code: code, p_token: token });
    },

    saveMine: saveMine,
    listMine: listMine
  };

  window.Orders = Orders;
})();
