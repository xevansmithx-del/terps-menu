/* Terps menu page — filter, search, sort, live hydrate */
const CAT_LABEL={flower:'Flower',concentrate:'Concentrates',edible:'Edibles',topical:'Topicals',merchandise:'Gear'};
let ALL=[], live=null;
const state={q:'',cats:new Set(),brands:new Set(),subs:new Set(),priceMax:null,thcMin:0,sort:'featured'};
const $=s=>document.querySelector(s);
const FB='<div class="ph-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C9 6 5 8 5 13a7 7 0 0014 0c0-5-4-7-7-11z"/></svg><span>Terps</span></div>';

function priceStr(p){const u=p.unit||'';return p.price_min===p.price_max?money(p.price_min)+(u?`<small>${u}</small>`:''):`${money(p.price_min)}<small>–${money(p.price_max)}${u}</small>`;}
function card(p){
  const ph=p.photo?`<img src="${p.photo}" loading="lazy" alt="${p.name}">`:FB;
  const thc=p.thc_max?`<span class="thc">${Math.round(p.thc_max)}% THC</span>`:'';
  const strains=p.n_strains>1?`<span class="strains">${p.n_strains} strains</span>`:'<span class="strains">In stock</span>';
  const sold=(live&&live[p.id]===undefined&&live.__loaded)?' sold':'';
  return `<a class="card${sold}" href="product/${p.slug}.html">
   <div class="ph"><span class="tag">${CAT_LABEL[p.category]||p.category}</span>${thc}${ph}<div class="soldtag">Sold out</div></div>
   <div class="body"><div class="brand">${p.brand||'Terps'}</div><h3 class="name">${p.name}</h3>
   <div class="foot"><span class="price">${priceStr(p)}</span>${strains}</div></div></a>`;
}
function apply(){
  let r=ALL.slice();
  if(state.q){const q=state.q.toLowerCase();r=r.filter(p=>(p.name+' '+p.brand+' '+(p.strains||[]).map(s=>s.name).join(' ')).toLowerCase().includes(q));}
  if(state.cats.size)r=r.filter(p=>state.cats.has(p.category));
  if(state.brands.size)r=r.filter(p=>state.brands.has(p.brand));
  if(state.subs.size)r=r.filter(p=>state.subs.has(p.subcategory));
  if(state.priceMax!=null)r=r.filter(p=>p.price_min<=state.priceMax);
  if(state.thcMin>0)r=r.filter(p=>(p.thc_max||0)>=state.thcMin);
  const s=state.sort;
  if(s==='price')r.sort((a,b)=>a.price_min-b.price_min);
  else if(s==='price-d')r.sort((a,b)=>b.price_min-a.price_min);
  else if(s==='thc')r.sort((a,b)=>(b.thc_max||0)-(a.thc_max||0));
  else if(s==='name')r.sort((a,b)=>a.name.localeCompare(b.name));
  else r.sort((a,b)=>(b.photo?1:0)-(a.photo?1:0)||(b.thc_max||0)-(a.thc_max||0)); // featured
  $('#grid').innerHTML=r.length?r.map(card).join(''):'<p style="padding:40px;color:var(--muted)">No products match those filters. <a href="menu.html" style="color:var(--gold-600);font-weight:700">Clear all</a></p>';
  $('#count').textContent=`${r.length} product${r.length!==1?'s':''}`;
}
function chip(label,active,on){const b=document.createElement('button');b.className='chip'+(active?' active':'');b.textContent=label;b.onclick=on;return b;}
function renderChips(){
  const box=$('#chips');box.innerHTML='';
  box.appendChild(chip('All',state.cats.size===0,()=>{state.cats.clear();sync();}));
  Object.keys(CAT_LABEL).forEach(c=>{
    const n=ALL.filter(p=>p.category===c).length;if(!n)return;
    box.appendChild(chip(`${CAT_LABEL[c]} (${n})`,state.cats.has(c),()=>{state.cats.has(c)?state.cats.delete(c):(state.cats=new Set([c]));state.subs.clear();sync();}));
  });
}
function renderFilters(){
  const brands={};ALL.forEach(p=>{if(p.brand)brands[p.brand]=(brands[p.brand]||0)+1;});
  const top=Object.entries(brands).sort((a,b)=>b[1]-a[1]).slice(0,18);
  let h='<h4>Category</h4>';
  Object.keys(CAT_LABEL).forEach(c=>{const n=ALL.filter(p=>p.category===c).length;if(!n)return;
    h+=`<label class="frow"><input type="checkbox" ${state.cats.has(c)?'checked':''} onchange="tog('cats','${c}')">${CAT_LABEL[c]}<span class="n">${n}</span></label>`;});
  h+='<h4>Brand</h4>';
  top.forEach(([b,n])=>{h+=`<label class="frow"><input type="checkbox" ${state.brands.has(b)?'checked':''} onchange="tog('brands',this.dataset.b)" data-b="${b.replace(/"/g,'&quot;')}">${b}<span class="n">${n}</span></label>`;});
  // Type (subcategory) — relevant to current category selection
  const pool = state.cats.size ? ALL.filter(p=>state.cats.has(p.category)) : ALL;
  const subs={}; pool.forEach(p=>{if(p.subcategory)subs[p.subcategory]=(subs[p.subcategory]||0)+1;});
  const subList=Object.entries(subs).sort((a,b)=>b[1]-a[1]).slice(0,12);
  if(subList.length){
    h+='<h4>Type</h4>';
    subList.forEach(([s,n])=>{const lbl=s.charAt(0).toUpperCase()+s.slice(1);
      h+=`<label class="frow"><input type="checkbox" ${state.subs.has(s)?'checked':''} onchange="tog('subs',this.dataset.s)" data-s="${s.replace(/"/g,'&quot;')}">${lbl}<span class="n">${n}</span></label>`;});
  }
  h+='<h4>Max price</h4>';
  [10,20,30,50,100].forEach(v=>{h+=`<label class="frow"><input type="radio" name="pm" ${state.priceMax===v?'checked':''} onchange="state.priceMax=${v};apply()">Under $${v}</label>`;});
  h+=`<label class="frow"><input type="radio" name="pm" ${state.priceMax===null?'checked':''} onchange="state.priceMax=null;apply()">Any price</label>`;
  h+='<h4>Min THC</h4>';
  [0,15,20,25,30].forEach(v=>{h+=`<label class="frow"><input type="radio" name="thc" ${state.thcMin===v?'checked':''} onchange="state.thcMin=${v};apply()">${v?v+'%+':'Any'}</label>`;});
  h+='<button class="clear" onclick="clearAll()">Clear all filters</button>';
  $('#filters').innerHTML=h;
}
window.tog=(k,v)=>{state[k].has(v)?state[k].delete(v):state[k].add(v);if(k==='cats')state.subs.clear();apply();renderChips();renderFilters();};
window.clearAll=()=>{state.q='';state.cats.clear();state.brands.clear();state.subs.clear();state.priceMax=null;state.thcMin=0;if($('#msearch'))$('#msearch').value='';sync();};
function sync(){renderChips();renderFilters();apply();}

async function hydrate(){
  const l=await fetchLive();if(!l)return;l.__loaded=true;live=l;
  ALL.forEach(p=>{if(l[p.id]){p.price_min=Math.min(p.price_min,l[p.id].min);p.price_max=Math.max(p.price_max,l[p.id].max);}});
  apply();
}
(async function(){
  const u=new URLSearchParams(location.search);
  if(u.get('cat'))state.cats.add(u.get('cat'));
  if(u.get('q'))state.q=u.get('q');
  if(u.get('sort'))state.sort={price:'price','price-d':'price-d',thc:'thc',name:'name'}[u.get('sort')]||'featured';
  ALL=await (await fetch('data/catalog.json')).json();
  ALL.forEach(p=>{if(p.photo&&!p.photo.startsWith('img/'))p.photo='img/products/'+p.id+'.jpg';});
  const ms=$('#msearch');if(ms){ms.value=state.q;ms.oninput=()=>{state.q=ms.value;apply();};}
  const so=$('#sortsel');if(so){so.value=state.sort;so.onchange=()=>{state.sort=so.value;apply();};}
  const ft=$('#filtertoggle');if(ft)ft.onclick=()=>$('#filters').classList.toggle('open');
  sync();hydrate();
})();
