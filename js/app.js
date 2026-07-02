/* ============================================================
   TERPS DISPENSARY storefront — shared app JS
   Age gate · cart (localStorage) · live Weave hydration · toast
   ============================================================ */
const WEAVE_LOC = 'bcb66b17-88c8-4139-a6d4-f8dd8099521e';
const WEAVE_API = `https://order.api.weaveiq.com/${WEAVE_LOC}/search/variant`;
const STORE_PHONE = '7195471850';
const money = c => '$' + Number(c).toFixed(2);
const TAX_FACTOR = 1.2375; // Gabriela 7/2: $12 -> $14.85, $8 -> $9.90 out the door
const otd = c => money(Number(c) * TAX_FACTOR);
const CATEGORY_ICON = {flower:'🌿',concentrate:'💎',edible:'🍬',topical:'🧴',merchandise:'🧢','pre roll':'🚬'};

/* ---------- Age gate ---------- */
function initAgeGate(){
  const g = document.getElementById('agegate');
  if(!g) return;
  if(localStorage.getItem('terps_age_ok')==='1'){ g.classList.add('hidden'); return; }
  document.body.style.overflow='hidden';
  g.querySelector('#age-yes').onclick=()=>{ localStorage.setItem('terps_age_ok','1'); g.classList.add('hidden'); document.body.style.overflow=''; };
  g.querySelector('#age-no').onclick=()=>{ location.href='https://www.google.com'; };
}

/* ---------- Cart ---------- */
const Cart = {
  key:'terps_cart_v1',
  get(){ try{return JSON.parse(localStorage.getItem(this.key))||[]}catch(e){return[]} },
  save(items){ localStorage.setItem(this.key,JSON.stringify(items)); this.render(); },
  add(item){
    const items=this.get();
    const ex=items.find(i=>i.id===item.id && i.strain===item.strain);
    if(ex) ex.qty+=item.qty; else items.push(item);
    this.save(items); toast(`Added to pickup order`);
  },
  remove(idx){ const items=this.get(); items.splice(idx,1); this.save(items); },
  count(){ return this.get().reduce((n,i)=>n+i.qty,0); },
  total(){ return this.get().reduce((s,i)=>s+i.price*i.qty,0); },
  render(){
    document.querySelectorAll('.cartbtn .count').forEach(el=>{
      const c=this.count(); el.textContent=c; el.style.display=c?'flex':'none';
    });
    const box=document.getElementById('cart-items'); if(!box) return;
    const items=this.get();
    if(!items.length){ box.innerHTML='<div class="empty">Your pickup order is empty.<br>Browse the menu to add items.</div>'; }
    else box.innerHTML=items.map((i,idx)=>`
      <div class="ci">
        <img src="${i.img||''}" onerror="this.style.visibility='hidden'" alt="">
        <div class="info"><div class="nm">${i.name}</div>
          <div class="st">${i.strain?i.strain+' · ':''}${money(i.price)}${i.unit?' · '+i.unit:''} × ${i.qty}</div>
          <div class="rm" onclick="Cart.remove(${idx})">Remove</div></div>
        <div class="pr">${money(i.price*i.qty)}</div>
      </div>`).join('');
    const t=document.getElementById('cart-total'); if(t) t.textContent=money(this.total());
    const o=document.getElementById('cart-otd'); if(o) o.textContent='≈ '+otd(this.total())+' out the door';
  }
};
function openCart(){ document.getElementById('cartov')?.classList.add('open'); document.getElementById('cart')?.classList.add('open'); }
function closeCart(){ document.getElementById('cartov')?.classList.remove('open'); document.getElementById('cart')?.classList.remove('open'); }
const STORE_EMAIL='info@terpsdispensary.com';
const STORE_PHONE_DISPLAY='(719) 547-1850';
/* escape untrusted strings before injecting into innerHTML */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function validEmail(v){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }

/* one-time injection of checkout-specific styles (keeps style.css untouched) */
function injectCheckoutCSS(){
  if(document.getElementById('co-xcss')) return;
  const s=document.createElement('style'); s.id='co-xcss';
  s.textContent=`
  #checkout .co-req{color:var(--coral)}
  #checkout .co-err{background:#fdecea;border:1px solid #f5b5ae;color:#8a2a20;border-radius:10px;padding:10px 12px;font-size:.85rem;margin-bottom:14px;display:none}
  #checkout .co-err.show{display:block}
  #checkout .co-fielderr{color:var(--coral);font-size:.76rem;font-weight:700;margin-top:4px;display:none}
  #checkout label.bad input{border-color:var(--coral)}
  #checkout label.bad .co-fielderr{display:block}
  #checkout .co-submit[disabled]{opacity:.6;cursor:default}
  #checkout .co-spin{width:16px;height:16px;border:2px solid rgba(11,46,34,.35);border-top-color:var(--green-900);border-radius:50%;display:inline-block;animation:cospin .7s linear infinite;vertical-align:-3px;margin-right:8px}
  @keyframes cospin{to{transform:rotate(360deg)}}
  #checkout .co-compliance{font-size:.76rem;color:var(--muted);text-align:center;margin-top:12px;line-height:1.5}
  #checkout .co-code{font-family:var(--serif);font-weight:700;font-size:2.4rem;letter-spacing:.02em;color:var(--green-900);background:var(--cream);border:1.5px dashed var(--gold-600);border-radius:14px;padding:14px 10px;margin:6px 0 14px;text-align:center;user-select:all}
  #checkout .co-track{display:flex;flex-direction:column;gap:10px;margin-top:6px}
  #checkout .co-track .btn{width:100%;justify-content:center}
  #checkout .co-track a.co-tracklink{color:var(--teal);font-weight:700;font-size:.85rem;text-align:center}
  #checkout .co-errbox{text-align:center}
  #checkout .co-errbox .co-x-icon{width:60px;height:60px;background:var(--coral);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;margin:0 auto 14px}`;
  document.head.appendChild(s);
}

function reservePickup(){
  const items=Cart.get(); if(!items.length){ toast('Add items first'); return; }
  buildCheckout();
  renderCheckoutSummary();
  // reset to the form view every time it opens
  const body=document.getElementById('co-body');
  body.dataset.state='form';
  document.getElementById('checkout').classList.add('open');
  document.body.style.overflow='hidden';
  setTimeout(()=>document.getElementById('checkout-name')?.focus(),60);
}
function renderCheckoutSummary(){
  const items=Cart.get();
  const el=document.getElementById('co-summary'); if(!el) return;
  el.innerHTML =
    items.map(i=>`<div class="co-li"><span>${i.qty}× ${esc(i.name)}${i.strain?' · '+esc(i.strain):''}${i.unit?' ('+esc(i.unit)+')':''}</span><b>${money(i.price*i.qty)}</b></div>`).join('')
    + `<div class="co-li co-tot"><span>Subtotal (pre-tax)</span><b>${money(Cart.total())}</b></div>`
    + `<div class="co-li co-otd"><span>Est. total with taxes (what you'll pay in store)</span><b>${otd(Cart.total())}</b></div>`;
}
function closeCheckout(){
  document.getElementById('checkout')?.classList.remove('open');
  document.body.style.overflow='';
}
function buildCheckout(){
  injectCheckoutCSS();
  if(document.getElementById('checkout')) return;
  const el=document.createElement('div'); el.id='checkout';
  el.innerHTML=`<div class="co-card">
    <button class="co-x" aria-label="Close" onclick="closeCheckout()">&times;</button>
    <div id="co-body" data-state="form">
      <h3>Reserve for pickup</h3>
      <p class="co-sub">Reserve your items and we'll have them ready. We'll email you as your order moves along.</p>
      <div class="co-err" id="co-err"></div>
      <div class="co-summary" id="co-summary"></div>
      <label for="checkout-name">Your name <span class="co-req">*</span>
        <input id="checkout-name" data-testid="checkout-name" autocomplete="name" placeholder="First & last name">
        <span class="co-fielderr">Please enter your name.</span></label>
      <label for="checkout-phone">Mobile phone <span class="co-req">*</span> <span class="co-hint">(so we can reach you)</span>
        <input id="checkout-phone" data-testid="checkout-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(719) 000-0000">
        <span class="co-fielderr">Please enter a valid phone number.</span></label>
      <label for="checkout-email">Email <span class="co-req">*</span> <span class="co-hint">(we'll email you order updates)</span>
        <input id="checkout-email" data-testid="checkout-email" type="email" inputmode="email" autocomplete="email" placeholder="you@email.com">
        <span class="co-fielderr">Please enter a valid email so we can send updates.</span></label>
      <label for="checkout-note">Note <span class="co-hint">(optional)</span>
        <input id="checkout-note" data-testid="checkout-note" maxlength="500" placeholder="Pickup time, questions…"></label>
      <button class="co-submit" id="checkout-submit" data-testid="checkout-submit" onclick="submitOrder()">Reserve for pickup →</button>
      <div class="co-compliance">Pay in store · 21+ w/ valid ID · This is a reservation, not a sale.</div>
      <div class="co-alt">Questions? Call <a href="tel:7195471850">${STORE_PHONE_DISPLAY}</a></div>
    </div></div>`;
  document.body.appendChild(el);
}
function markBad(id,bad){
  const inp=document.getElementById(id); if(!inp) return;
  inp.closest('label')?.classList.toggle('bad',!!bad);
}
async function submitOrder(){
  const nameEl=document.getElementById('checkout-name');
  const phoneEl=document.getElementById('checkout-phone');
  const emailEl=document.getElementById('checkout-email');
  const noteEl=document.getElementById('checkout-note');
  const name=(nameEl?.value||'').trim();
  const phone=(phoneEl?.value||'').trim();
  const email=(emailEl?.value||'').trim();
  const note=(noteEl?.value||'').trim();

  // client-side validation — all three required
  const badName=name.length<2;
  const badPhone=phone.replace(/[^0-9]/g,'').length<7;
  const badEmail=!validEmail(email);
  markBad('checkout-name',badName); markBad('checkout-phone',badPhone); markBad('checkout-email',badEmail);
  const err=document.getElementById('co-err'); err.classList.remove('show');
  if(badName||badPhone||badEmail){
    err.textContent='Please fill in your name, phone and email so we can hold your order and send updates.';
    err.classList.add('show');
    (badName?nameEl:badPhone?phoneEl:emailEl)?.focus();
    return;
  }

  const items=Cart.get();
  if(!items.length){ closeCheckout(); toast('Your order is empty'); return; }

  const btn=document.getElementById('checkout-submit');
  const orig=btn.innerHTML;
  btn.disabled=true; btn.innerHTML='<span class="co-spin"></span>Reserving…';

  try{
    if(typeof Orders==='undefined'||!Orders.placeOrder) throw new Error('unavailable');
    const {code,token}=await Orders.placeOrder(items,{name,phone,email},note);
    // remember for returning-visitor lookup
    try{ Orders.saveMine({code,token,name,subtotal:Cart.total(),item_count:Cart.count()}); }catch(e){}
    Cart.save([]);
    showCheckoutSuccess(code,token);
    closeCart();
  }catch(e){
    btn.disabled=false; btn.innerHTML=orig;
    showCheckoutError();
  }
}
/* order.html lives at the site root; product pages sit one level down in
   /product/, so prefix the tracking link accordingly (works for local file
   preview AND GitHub Pages, regardless of domain). */
function siteRootPrefix(){ return /\/product\//.test(location.pathname) ? '../' : ''; }
function showCheckoutSuccess(code,token){
  const url=siteRootPrefix()+'order.html?c='+encodeURIComponent(code)+'&t='+encodeURIComponent(token);
  const body=document.getElementById('co-body'); body.dataset.state='done';
  body.innerHTML=`<div class="co-done" data-testid="checkout-success">
    <div class="co-check">✓</div>
    <h3>You're all set!</h3>
    <p class="co-sub">Your reservation is in. Show this code at the counter:</p>
    <div class="co-code">${esc(code)}</div>
    <p class="co-sub">We'll email you when it's ready for pickup at 38 N Silicon Dr. Bring a valid 21+ ID and pay in store.</p>
    <div class="co-track">
      <a class="btn btn-gold" data-testid="track-link" href="${esc(url)}">Track your order →</a>
      <a class="btn btn-ghost" href="#" onclick="closeCheckout();return false;">Keep shopping</a>
    </div></div>`;
}
function showCheckoutError(){
  const body=document.getElementById('co-body'); body.dataset.state='error';
  body.innerHTML=`<div class="co-errbox">
    <div class="co-x-icon">!</div>
    <h3>We couldn't place that</h3>
    <p class="co-sub">Something went wrong reserving your order. Your cart is saved — please try again, or give us a call and we'll set it aside for you.</p>
    <div class="co-track">
      <button class="btn btn-gold" onclick="reservePickup()">Try again</button>
      <a class="btn btn-ghost" href="tel:7195471850">Call ${STORE_PHONE_DISPLAY}</a>
    </div></div>`;
}

/* ---------- Toast ---------- */
let toastT;
function toast(m){ let t=document.getElementById('toast'); if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);} t.textContent=m; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2200); }

/* ---------- Live Weave hydration ----------
   Refreshes prices & availability against the live POS so the
   static (SEO-indexed) pages always show current data. */
/* Flower sells as pre-packaged 3.5g eighths (owner directive 2026-07-02).
   The Weave POS prices loose bud per gram, so the eighth package price =
   per-gram cents x 3.5 — MUST mirror _pipeline/build_catalog.py exactly
   (same not-bud regex, same >=$10/g package-price guard; if per_gram_ok
   exceptions are ever added there, mirror them here). */
const NOT_BUD_RE=/pre.?roll|cone|joint|blunt|infused|\bpack\b|\bpk\b|\bkief\b|caviar/i;
function liveVariantPrice(p,v){
  if(p.category==='flower' && v.type==='loose' && v.price<1000 && !NOT_BUD_RE.test(p.name||''))
    return Math.round(v.price*3.5)/100;   // per-gram -> 3.5g eighth package price
  return v.price/100;
}
async function fetchLive(){
  try{
    const r=await fetch(WEAVE_API,{headers:{'Accept':'application/json'}});
    if(!r.ok) return null;
    const d=await r.json();
    const rows=d.results||[];
    const byId={};
    rows.forEach(p=>{
      const vs=(p.variants||[]).filter(v=>!v.hidden_from_menu && (v.quantity||0)>0 && (v.price||0)>=50);
      if(!vs.length) return;
      const prices=vs.map(v=>liveVariantPrice(p,v));
      byId[p.id]=byId[p.id]||{min:Infinity,max:0,live:true};
      byId[p.id].min=Math.min(byId[p.id].min,...prices);
      byId[p.id].max=Math.max(byId[p.id].max,...prices);
    });
    return byId;
  }catch(e){ return null; }
}

/* ---------- Header interactions ---------- */
function initChrome(){
  Cart.render();
  document.querySelectorAll('[data-open-cart]').forEach(b=>b.onclick=openCart);
  document.getElementById('cartov')?.addEventListener('click',closeCart);
  const mt=document.getElementById('menutoggle'), mn=document.getElementById('mobilenav');
  if(mt&&mn){ mt.onclick=()=>mn.classList.add('open'); mn.querySelector('.x').onclick=()=>mn.classList.remove('open'); mn.querySelectorAll('a').forEach(a=>a.onclick=()=>mn.classList.remove('open')); }
  const hs=document.getElementById('headsearch');
  if(hs) hs.addEventListener('keydown',e=>{ if(e.key==='Enter'&&hs.value.trim()) location.href='menu.html?q='+encodeURIComponent(hs.value.trim()); });
}
document.addEventListener('DOMContentLoaded',()=>{ initAgeGate(); initChrome(); });
