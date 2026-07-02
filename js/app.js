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
function reservePickup(){
  const items=Cart.get(); if(!items.length){ toast('Add items first'); return; }
  let msg=`TERPS PICKUP ORDER%0a`;
  items.forEach(i=>{ msg+=`• ${i.qty}× ${i.name}${i.strain?' ('+i.strain+')':''} — ${money(i.price)}%0a`; });
  msg+=`Total (pre-tax): ${money(Cart.total())}%0a%0aName: `;
  // SMS handoff — compliant, pay in store at pickup
  window.location.href=`sms:${STORE_PHONE}&body=${msg}`;
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
