#!/usr/bin/env python3
"""Generate the Terps storefront: homepage, menu, 290 product pages, sitemap."""
import json, os, html, re
DATA='data'; SITE='site'; BASE='https://terpsdispensary.com'
cat=json.load(open(f'{DATA}/catalog.json'))
os.makedirs(f'{SITE}/product',exist_ok=True)
os.makedirs(f'{SITE}/data',exist_ok=True)

def e(s): return html.escape(str(s or ''))
def has_img(p): return os.path.exists(f"{SITE}/img/products/{p['id']}.jpg")
for p in cat: p['photo']= f"img/products/{p['id']}.jpg" if has_img(p) else ''
# slim catalog served to the client (menu page)
slim=[{'id':p['id'],'slug':p['slug'],'name':p['name'],'brand':p['brand'],'category':p['category'],
       'subcategory':p['subcategory'],'price_min':p['price_min'],'price_max':p['price_max'],'unit':p.get('unit',''),
       'thc_max':p['thc_max'],'n_strains':p['n_strains'],'photo':p['photo'],
       'strains':[{'name':s['name']} for s in p['strains']]} for p in cat]
json.dump(slim,open(f'{SITE}/data/catalog.json','w'))
CATS=[('flower','Flower','🌿'),('concentrate','Concentrates','💎'),('edible','Edibles','🍬'),
      ('topical','Topicals','🧴'),('merchandise','Gear','🧢')]
counts={c:sum(1 for p in cat if p['category']==c) for c,_,_ in CATS}
TOTAL=len(cat); STRAINS=sum(p['n_strains'] for p in cat)

FALLBACK_SVG='<div class="ph-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2C9 6 5 8 5 13a7 7 0 0014 0c0-5-4-7-7-11z"/></svg><span>Terps</span></div>'

def head(title,desc,canonical,extra=''):
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="{canonical}">
<meta property="og:image" content="{BASE}/img/og-card.jpg"><meta name="twitter:image" content="{BASE}/img/og-card.jpg"><meta name="theme-color" content="#0e3b2e">
<link rel="icon" href="img/icon-32.png"><link rel="apple-touch-icon" href="img/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,600&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{{CSS}}">{extra}</head><body>"""

def header(prefix=''):
    return f"""<div id="agegate"><div class="card"><img src="{prefix}img/badge.png" alt="Terps Dispensary">
<h2>Are you 21 or older?</h2><p>You must be 21+ with a valid government-issued ID to view this menu. Recreational · Pueblo, CO.</p>
<button class="btn btn-gold" id="age-yes">Yes, I'm 21 or older</button>
<button class="btn btn-ghost" id="age-no">No, take me back</button></div></div>
<div class="mobile-nav" id="mobilenav"><span class="x">&times;</span>
<a href="{prefix}menu.html">Menu</a><a href="{prefix}menu.html?cat=flower">Flower</a><a href="{prefix}menu.html?cat=concentrate">Concentrates</a>
<a href="{prefix}menu.html?cat=edible">Edibles</a><a href="{prefix}index.html#visit">Visit</a></div>
<header class="site"><div class="wrap nav">
<a class="logo" href="{prefix}index.html"><img src="{prefix}img/logo_horizontal.png" alt="Terps Dispensary"></a>
<nav><a href="{prefix}menu.html">Menu</a><a href="{prefix}menu.html?cat=flower">Flower</a>
<a href="{prefix}menu.html?cat=concentrate">Concentrates</a><a href="{prefix}menu.html?cat=edible">Edibles</a>
<a href="{prefix}index.html#visit">Visit</a></nav>
<div class="spacer"></div>
<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
<input id="headsearch" placeholder="Search 290+ products…"></div>
<button class="cartbtn" data-open-cart>🛍️ Order<span class="count" style="display:none">0</span></button>
<button class="menutoggle" id="menutoggle">☰</button>
</div></header>{cart_drawer(prefix)}"""

def cart_drawer(prefix=''):
    return f"""<div id="cartov"></div><aside id="cart">
<div class="chead"><h3>Your pickup order</h3><button class="x" onclick="closeCart()">&times;</button></div>
<div class="items" id="cart-items"></div>
<div class="foot"><div class="tot"><span>Subtotal</span><span id="cart-total">$0.00</span></div>
<div class="note">Send your order to reserve it — we'll have it ready. Pay in store at pickup (21+, valid ID). Questions? Call <a href="tel:7195471850">(719) 547-1850</a> · 38 N Silicon Dr, Pueblo.</div>
<button class="btn btn-gold" onclick="reservePickup()">Reserve for pickup →</button></div></aside>"""

def footer(prefix=''):
    links=''.join(f'<a href="{prefix}menu.html?cat={c}">{n}</a>' for c,n,_ in CATS)
    return f"""<footer class="site"><div class="wrap"><div class="cols">
<div><img class="flogo" src="{prefix}img/logo_horizontal.png" alt="Terps Dispensary">
<p>Pueblo's home for premium, locally-loved cannabis. Recreational 21+. Browse our full live menu and reserve for fast in-store pickup.</p></div>
<div><h4>Shop</h4><a href="{prefix}menu.html">Full menu</a>{links}</div>
<div><h4>Visit</h4><p>38 N Silicon Dr<br>Pueblo, CO 81007<br><br>Mon–Sat 8am–8pm<br>Sun 10am–5pm<br><br><a href="tel:7195471850">(719) 547-1850</a></p></div>
</div><div class="copy"><span>© 2026 Terps Dispensary. Rec 21+. Keep out of reach of children.</span>
<span>Live menu powered by our POS · Updated in real time</span></div></div></footer>
<script src="{prefix}js/config.js"></script><script src="{prefix}js/orders.js"></script><script src="{prefix}js/app.js"></script>"""

def price_str(p):
    u=p.get('unit','')
    us=f'<small>{u}</small>' if u else ''
    return (money(p['price_min'])+us) if p['price_min']==p['price_max'] else f"{money(p['price_min'])}<small>–{money(p['price_max'])}{u}</small>"
def money(x): return '$'+format(x,'.2f')

def card(p,prefix=''):
    ph=f'<img src="{prefix}{p["photo"]}" loading="lazy" alt="{e(p["name"])}">' if p['photo'] else FALLBACK_SVG
    thc=f'<span class="thc">{round(p["thc_max"])}% THC</span>' if p.get('thc_max') else ''
    strains=f'<span class="strains">{p["n_strains"]} strains</span>' if p['n_strains']>1 else '<span class="strains">In stock</span>'
    catname={c:n for c,n,_ in CATS}.get(p['category'],p['category'].title())
    return f"""<a class="card" href="{prefix}product/{p['slug']}.html" data-id="{p['id']}">
<div class="ph"><span class="tag">{e(catname)}</span>{thc}{ph}<div class="soldtag">Sold out</div></div>
<div class="body"><div class="brand">{e(p['brand'] or 'Terps')}</div>
<h3 class="name">{e(p['name'])}</h3>
<div class="foot"><span class="price" data-price>{price_str(p)}</span>{strains}</div></div></a>"""

# ---------------- HOMEPAGE ----------------
def build_home():
    cattiles=''.join(f'<a class="cat" href="menu.html?cat={c}"><div class="ic">{ic}</div><h3>{n}</h3><span>{counts.get(c,0)} products</span></a>' for c,n,ic in CATS)
    cattiles+=f'<a class="cat" href="menu.html"><div class="ic">✨</div><h3>Shop All</h3><span>{TOTAL} products</span></a>'
    withphoto=[p for p in cat if p['photo']]
    featured=sorted([p for p in withphoto if p['category']=='flower' and p.get('thc_max')],key=lambda p:-p['thc_max'])[:8]
    if len(featured)<8: featured=withphoto[:8]
    value=sorted(withphoto,key=lambda p:p['price_min'])[:8]
    feat_cards=''.join(card(p) for p in featured)
    val_cards=''.join(card(p) for p in value)
    ld={"@context":"https://schema.org","@type":"Store","name":"Terps Dispensary","image":f"{BASE}/img/badge.png",
        "@id":BASE,"url":BASE,"telephone":"+17195471850","priceRange":"$$",
        "address":{"@type":"PostalAddress","streetAddress":"38 N Silicon Dr","addressLocality":"Pueblo","addressRegion":"CO","postalCode":"81007","addressCountry":"US"},
        "geo":{"@type":"GeoCoordinates","latitude":38.3096,"longitude":-104.6810},
        "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],"opens":"08:00","closes":"20:00"},{"@type":"OpeningHoursSpecification","dayOfWeek":"Sunday","opens":"10:00","closes":"17:00"}]}
    h=head("Terps Dispensary — Pueblo's Best Rec 21+ Cannabis Menu & Online Ordering",
           "Browse Terps Dispensary's full live menu — 290+ cannabis products, 740+ strains, updated in real time. Flower, vapes, concentrates, edibles & more. Reserve online for fast in-store pickup in Pueblo, CO.",
           BASE+'/',f'\n<script type="application/ld+json">{json.dumps(ld)}</script>').replace('{CSS}','css/style.css')
    body=f"""{header()}
<section class="hero"><div class="wrap">
<div><div class="eyebrow">Pueblo, Colorado · Recreational 21+</div>
<h1>Pueblo's best shelf,<br>now <span class="hl">online</span>.</h1>
<p class="lede">Browse our entire live menu — {TOTAL}+ products and {STRAINS}+ strains, priced in real time. Reserve in seconds, pay in store.</p>
<div class="cta-row"><a class="btn btn-gold btn-lg" href="menu.html">Browse the menu →</a>
<a class="btn btn-ghost btn-lg" href="#visit" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.25)">Visit us</a></div>
<div class="stats"><div class="s"><b>{TOTAL}+</b><span>Products</span></div><div class="s"><b>{STRAINS}+</b><span>Strains</span></div><div class="s"><b>Live</b><span>Real-time stock</span></div></div>
</div><div class="badge-art"><img src="img/badge.png" alt="Terps Dispensary badge"></div>
</div></section>
<div class="trust"><div class="wrap"><span>🌿 <b>Locally owned</b> in Pueblo</span><span>⚡ <b>Live menu</b> — real-time stock</span><span>🛍️ <b>Reserve online</b>, pay in store</span><span>✔ Recreational <b>21+</b></span></div></div>

<section class="block"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Shop by category</div><h2>Find your thing</h2></div><a class="more" href="menu.html">All {TOTAL} products →</a></div>
<div class="cats">{cattiles}</div></div></section>

<section class="block" style="background:var(--paper);border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><div class="wrap">
<div class="sec-head"><div><div class="eyebrow">Top shelf</div><h2>Highest-potency picks</h2><p>The strongest flower on our shelf right now.</p></div><a class="more" href="menu.html?cat=flower&sort=thc">All flower →</a></div>
<div class="grid">{feat_cards}</div></div></section>

<section class="block"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Everyday value</div><h2>Best bang for your buck</h2><p>Quality that won't break the bank.</p></div><a class="more" href="menu.html?sort=price">Shop value →</a></div>
<div class="grid">{val_cards}</div></div></section>

<section class="block" style="background:var(--green-900)"><div class="wrap"><div class="sec-head"><div><div class="eyebrow" style="color:var(--gold)">Why Terps</div><h2 style="color:#fff">Built different</h2></div></div>
<div class="why">
<div class="w"><div class="ic">⚡</div><h3>Always live</h3><p>Our menu syncs straight from the register — what you see is really on the shelf, priced to the penny.</p></div>
<div class="w"><div class="ic">🌿</div><h3>Real selection</h3><p>{STRAINS}+ strains across flower, vapes, concentrates and edibles — one of Pueblo's deepest shelves.</p></div>
<div class="w"><div class="ic">🛍️</div><h3>Skip the wait</h3><p>Reserve online and your order's ready when you walk in. Pay in store, in and out.</p></div>
</div></div></section>

<section class="block" id="visit"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Come see us</div><h2>Visit Terps</h2></div></div>
<div class="visit"><div class="card-info">
<div class="row"><b>Address</b><span>38 N Silicon Dr<br>Pueblo, CO 81007</span></div>
<div class="row"><b>Phone</b><span><a href="tel:7195471850">(719) 547-1850</a></span></div>
<div class="row"><b>Mon–Fri</b><span>8:00am – 8:00pm</span></div>
<div class="row"><b>Saturday</b><span>8:00am – 8:00pm</span></div>
<div class="row"><b>Sunday</b><span>10:00am – 5:00pm</span></div>
<div class="row"><b>Menu</b><span><a href="menu.html" style="color:var(--gold-600);font-weight:700">Browse the full live menu →</a></span></div>
</div>
<div class="map"><iframe loading="lazy" src="https://maps.google.com/maps?q=38%20N%20Silicon%20Dr%2C%20Pueblo%2C%20CO%2081007&t=&z=15&ie=UTF8&iwloc=&output=embed"></iframe></div>
</div></div></section>
{footer()}</body></html>"""
    open(f'{SITE}/index.html','w').write(h+body)

# ---------------- MENU PAGE ----------------
def build_menu():
    h=head("Menu — Terps Dispensary Pueblo | Live Cannabis Menu Rec 21+",
           f"Shop Terps Dispensary's full live menu — {TOTAL}+ products, {STRAINS}+ strains. Filter flower, vapes, concentrates & edibles by brand, price and THC. Reserve for pickup in Pueblo, CO.",
           BASE+'/menu.html').replace('{CSS}','css/style.css')
    body=f"""{header()}
<div class="menu-head"><div class="wrap"><div class="eyebrow" style="color:var(--gold)">Live menu · updated in real time</div>
<h1>The full shelf</h1><p>{TOTAL} products · {STRAINS} strains · reserve online, pay in store</p></div></div>
<div class="wrap"><div class="menu-layout">
<aside class="filters" id="filters"></aside>
<div><div class="menu-toolbar">
<button class="chip filter-toggle" id="filtertoggle">☰ Filters</button>
<span class="count" id="count">Loading…</span><div class="spacer"></div>
<input class="msearch" id="msearch" placeholder="Search…">
<select id="sortsel"><option value="featured">Featured</option><option value="price">Price: low→high</option>
<option value="price-d">Price: high→low</option><option value="thc">THC: high→low</option><option value="name">Name A–Z</option></select>
</div>
<div class="chips" id="chips"></div>
<div class="grid" id="grid"></div>
</div></div></div>
{footer()}<script src="js/menu.js"></script></body></html>"""
    open(f'{SITE}/menu.html','w').write(h+body)

# ---------------- PRODUCT PAGES ----------------
def build_products():
    bycat={}
    for p in cat: bycat.setdefault(p['category'],[]).append(p)
    for p in cat:
        photo=f"../{p['photo']}" if p['photo'] else ''
        gal=f'<img src="{photo}" alt="{e(p["name"])} — {e(p["brand"])}">' if photo else FALLBACK_SVG
        pills=[]
        catname={c:n for c,n,_ in CATS}.get(p['category'],p['category'].title())
        pills.append(f'<span class="pill">{e(catname)}</span>')
        if p['subcategory']: pills.append(f'<span class="pill">{e(p["subcategory"].title())}</span>')
        if p.get('thc_max'): pills.append(f'<span class="pill gold">{round(p["thc_max"])}% THC</span>')
        if p['n_strains']>1: pills.append(f'<span class="pill">{p["n_strains"]} strains</span>')
        u=p.get('unit','')
        strain_opts=''.join(
            f'<button class="strain-opt" data-strain="{e(s["name"])}" data-price="{s["price"]}">'
            f'<div class="sn">{e(s["name"])}</div><div class="sd">{money(s["price"])}{u}{" · "+str(round(s["thc"]))+"% THC" if s.get("thc") else ""}</div></button>'
            for s in p['strains'])
        desc=p['description'] or f"{p['name']} by {p['brand'] or 'Terps'} — available now at Terps Dispensary in Pueblo, CO. {p['n_strains']} strain{'s' if p['n_strains']>1 else ''} in stock. Reserve online for fast in-store pickup."
        related=[x for x in bycat.get(p['category'],[]) if x['id']!=p['id'] and x['photo']][:4]
        rel=''.join(card(x,'../') for x in related)
        pr=price_str(p)
        ld={"@context":"https://schema.org","@type":"Product","name":p['name'],
            "brand":{"@type":"Brand","name":p['brand'] or 'Terps'},"category":catname,
            "description":re.sub('<[^>]+>','',desc)[:300],
            "image":f"{BASE}/{p['photo']}" if p['photo'] else f"{BASE}/img/badge.png",
            "offers":{"@type":"Offer","price":f"{p['price_min']:.2f}","priceCurrency":"USD","availability":"https://schema.org/InStock","url":f"{BASE}/product/{p['slug']}.html"}}
        canonical=f"{BASE}/product/{p['slug']}.html"
        title=f"{p['name']} — {p['brand'] or 'Terps'} | Terps Dispensary Pueblo"
        metadesc=re.sub('<[^>]+>','',desc)[:155]
        h=head(title,metadesc,canonical,f'\n<script type="application/ld+json">{json.dumps(ld)}</script>').replace('{CSS}','../css/style.css')
        body=f"""{header('../')}
<div class="wrap"><div class="breadcrumb"><a href="../index.html">Home</a> › <a href="../menu.html">Menu</a> › <a href="../menu.html?cat={p['category']}">{e(catname)}</a> › {e(p['name'])}</div></div>
<div class="wrap"><div class="pdp">
<div class="gallery">{gal}</div>
<div class="info">
<div class="brand">{e(p['brand'] or 'Terps')}</div><h1>{e(p['name'])}</h1>
<div class="meta">{''.join(pills)}</div>
<div class="priceline" id="priceline">{pr}</div>
<div class="strain-sel">{f'<h4>Choose a strain ({p["n_strains"]})</h4><div class="strain-grid">{strain_opts}</div>' if p['n_strains']>1 else ''}</div>
<div class="addrow"><div class="qty"><button onclick="qc(-1)">−</button><span id="qty">1</span><button onclick="qc(1)">+</button></div>
<button class="btn btn-gold btn-lg" style="flex:1;justify-content:center" onclick="addPDP()">Add to pickup order</button></div>
<div class="desc"><h4>About this product</h4><p>{e(desc)}</p></div>
<div class="disclaimer">Prices and availability update live from our register and may change. Reserve online, pay in store at pickup. Must be 21+ with valid ID. Keep out of reach of children.</div>
</div></div>
{f'<section class="block"><div class="sec-head"><h2>You may also like</h2></div><div class="grid">{rel}</div></section>' if rel else ''}
</div>
{footer('../')}
<script>
const PROD={json.dumps({'id':p['id'],'name':p['name'],'brand':p['brand'],'photo':('../'+p['photo']) if p['photo'] else '','price':p['price_min'],'unit':p.get('unit',''),'strains':p['strains']})};
let selStrain=PROD.strains.length===1?PROD.strains[0]:null, qty=1;
function qc(d){{qty=Math.max(1,qty+d);document.getElementById('qty').textContent=qty;}}
document.querySelectorAll('.strain-opt').forEach(b=>b.onclick=()=>{{
  document.querySelectorAll('.strain-opt').forEach(x=>x.classList.remove('sel'));b.classList.add('sel');
  selStrain={{name:b.dataset.strain,price:+b.dataset.price}};
  document.getElementById('priceline').innerHTML=money(selStrain.price)+(PROD.unit?'<small>'+PROD.unit+'</small>':'');
}});
function addPDP(){{
  if(PROD.strains.length>1 && !selStrain){{toast('Pick a strain first');return;}}
  const s=selStrain||{{name:'',price:PROD.price}};
  Cart.add({{id:PROD.id,name:PROD.name,strain:s.name,price:s.price,qty:qty,img:PROD.photo}});
  openCart();
}}
</script></body></html>"""
        open(f"{SITE}/product/{p['slug']}.html",'w').write(h+body)

# ---------------- SITEMAP / ROBOTS ----------------
def build_meta():
    urls=[f'{BASE}/',f'{BASE}/menu.html']+[f"{BASE}/product/{p['slug']}.html" for p in cat]
    sm='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for u in urls: sm+=f'  <url><loc>{u}</loc><changefreq>daily</changefreq></url>\n'
    sm+='</urlset>\n'
    open(f'{SITE}/sitemap.xml','w').write(sm)
    open(f'{SITE}/robots.txt','w').write(
        "User-agent: *\nAllow: /\n"
        "Disallow: /staff.html\nDisallow: /order.html\n"
        f"Sitemap: {BASE}/sitemap.xml\n")

build_home(); build_menu(); build_products(); build_meta()
print(f'built: index.html, menu.html, {len(cat)} product pages, sitemap({len(cat)+2} urls)')
print(f'photos on {sum(1 for p in cat if p["photo"])} products')
