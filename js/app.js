/* ============================================================
   TERPS DISPENSARY storefront — shared app JS
   Age gate · cart (localStorage) · live Weave hydration · toast
   ============================================================ */
const WEAVE_LOC = 'bcb66b17-88c8-4139-a6d4-f8dd8099521e';
const WEAVE_API = `https://order.api.weaveiq.com/${WEAVE_LOC}/search/variant`;
const STORE_PHONE = '7195471850';
const money = c => '$' + Number(c).toFixed(2);
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
          <div class="st">${i.strain?i.strain+' · ':''}${money(i.price)} × ${i.qty}</div>
          <div class="rm" onclick="Cart.remove(${idx})">Remove</div></div>
        <div class="pr">${money(i.price*i.qty)}</div>
      </div>`).join('');
    const t=document.getElementById('cart-total'); if(t) t.textContent=money(this.total());
  }
};
function openCart(){ document.getElementById('cartov')?.classList.add('open'); document.getElementById('cart')?.classList.add('open'); }
function closeCart(){ document.getElementById('cartov')?.classList.remove('open'); document.getElementById('cart')?.classList.remove('open'); }
const STORE_EMAIL='info@terpsdispensary.com';
function reservePickup(){
  const items=Cart.get(); if(!items.length){ toast('Add items first'); return; }
  buildCheckout();
  document.getElementById('co-summary').innerHTML =
    items.map(i=>`<div class="co-li"><span>${i.qty}× ${i.name}${i.strain?' · '+i.strain:''}</span><b>${money(i.price*i.qty)}</b></div>`).join('')
    + `<div class="co-li co-tot"><span>Subtotal (pre-tax)</span><b>${money(Cart.total())}</b></div>`;
  document.getElementById('checkout').classList.add('open');
}
function buildCheckout(){
  if(document.getElementById('checkout')) return;
  const el=document.createElement('div'); el.id='checkout';
  el.innerHTML=`<div class="co-card">
    <button class="co-x" onclick="document.getElementById('checkout').classList.remove('open')">&times;</button>
    <div id="co-body">
      <h3>Reserve for pickup</h3>
      <p class="co-sub">We'll prep your order and send you updates. Pay in store at pickup (21+, valid ID).</p>
      <div class="co-summary" id="co-summary"></div>
      <label>Your name<input id="co-name" autocomplete="name" placeholder="First & last name"></label>
      <label>Mobile phone <span class="co-hint">(for order updates)</span><input id="co-phone" type="tel" autocomplete="tel" placeholder="(719) 000-0000"></label>
      <label>Email<input id="co-email" type="email" autocomplete="email" placeholder="you@email.com"></label>
      <label>Pickup time<select id="co-time"><option>As soon as possible</option><option>Within 1 hour</option><option>Later today</option><option>Tomorrow</option></select></label>
      <button class="co-submit" onclick="submitOrder()">Place pickup order →</button>
      <div class="co-alt">or <a href="#" onclick="emailOrder();return false;">email your order</a> · call <a href="tel:7195471850">(719) 547-1850</a></div>
    </div></div>`;
  document.body.appendChild(el);
}
async function submitOrder(){
  const name=document.getElementById('co-name').value.trim();
  const phone=document.getElementById('co-phone').value.trim();
  const email=document.getElementById('co-email').value.trim();
  const time=document.getElementById('co-time').value;
  if(!name||(!phone&&!email)){ toast('Add your name and a phone or email'); return; }
  const items=Cart.get();
  const order={customer:{name,phone,email},items,subtotal:Cart.total(),pickupTime:time,source:'terpsdispensary.com'};
  let saved=order;
  if(typeof Orders!=='undefined'){ try{ saved=await Orders.create(order); }catch(e){} }
  Cart.save([]);
  document.getElementById('co-body').innerHTML=`<div class="co-done">
    <div class="co-check">✓</div><h3>Order received!</h3>
    <p class="co-sub">Your order <b>#${saved.id||''}</b> is in. We'll ${phone?'text':'email'} you when it's ready for pickup at 38 N Silicon Dr.</p>
    <p class="co-sub" style="margin-top:8px">Bring a valid 21+ ID. Pay in store.</p>
    <button class="co-submit" onclick="document.getElementById('checkout').classList.remove('open')">Done</button></div>`;
  closeCart();
}
function emailOrder(){
  const items=Cart.get(); let body='TERPS PICKUP ORDER%0D%0A%0D%0A';
  items.forEach(i=>{ body+=`• ${i.qty} x ${i.name}${i.strain?' ('+i.strain+')':''} — ${money(i.price)}%0D%0A`; });
  body+=`%0D%0ASubtotal: ${money(Cart.total())}%0D%0A%0D%0AName:%0D%0APhone:%0D%0APickup time:`;
  window.location.href=`mailto:${STORE_EMAIL}?subject=${encodeURIComponent('Pickup order — Terps')}&body=${body}`;
}

/* ---------- Toast ---------- */
let toastT;
function toast(m){ let t=document.getElementById('toast'); if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);} t.textContent=m; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2200); }

/* ---------- Live Weave hydration ----------
   Refreshes prices & availability against the live POS so the
   static (SEO-indexed) pages always show current data. */
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
      const prices=vs.map(v=>v.price/100);
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
