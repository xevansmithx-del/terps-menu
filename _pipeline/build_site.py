#!/usr/bin/env python3
"""Generate the Terps storefront: homepage, menu, 290 product pages, blog, sitemap."""
import json, os, html, re, struct, datetime
DATA='data'; SITE='..'; BASE='https://terpsdispensary.com'
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOG_SRC=os.path.join(ROOT,'_content','blog-source')
cat=json.load(open(f'{DATA}/catalog.json'))
info=json.load(open(f'{DATA}/info.json'))
ADDR=info['address']
STREET=ADDR['street']; CITY=ADDR['city']; STATE=ADDR['state']; ZIP=ADDR['zip']
PHONE='(719) 547-1850'; PHONE_TEL='7195471850'
TODAY=datetime.date.today().isoformat()
os.makedirs(f'{SITE}/product',exist_ok=True)
os.makedirs(f'{SITE}/data',exist_ok=True)
os.makedirs(f'{SITE}/post',exist_ok=True)
os.makedirs(f'{SITE}/blog',exist_ok=True)

def e(s): return html.escape(str(s or ''))
def has_img(p): return os.path.exists(f"{SITE}/img/products/{p['id']}.jpg")

def jpeg_size(path):
    with open(path,'rb') as f: d=f.read()
    i=2
    while i<len(d)-9:
        if d[i]!=0xFF: i+=1; continue
        m=d[i+1]
        if 0xC0<=m<=0xCF and m not in (0xC4,0xC8,0xCC):
            h,w=struct.unpack('>HH',d[i+5:i+9]); return w,h
        i+=2+struct.unpack('>H',d[i+2:i+4])[0]
    return None

DIMS={}
for p in cat:
    p['photo']= f"img/products/{p['id']}.jpg" if has_img(p) else ''
    if p['photo']:
        wh=jpeg_size(f"{SITE}/{p['photo']}")
        if wh: DIMS[p['id']]=wh

def imgdims(p):
    wh=DIMS.get(p['id'])
    return f' width="{wh[0]}" height="{wh[1]}"' if wh else ''
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

def head(title,desc,canonical,extra='',ogtype='website',ogimage=None,prefix=''):
    ogimage=ogimage or f'{BASE}/img/og-card.jpg'
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="{ogtype}"><meta property="og:url" content="{canonical}">
<meta property="og:site_name" content="Terps Dispensary"><meta property="og:locale" content="en_US">
<meta property="og:image" content="{ogimage}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}"><meta name="twitter:image" content="{ogimage}">
<meta name="theme-color" content="#0e3b2e">
<link rel="icon" href="{prefix}img/icon-32.png"><link rel="apple-touch-icon" href="{prefix}img/icon-180.png">
<link rel="preload" href="{{CSS}}" as="style">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,600&family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{{CSS}}">{extra}</head><body>"""

def header(prefix=''):
    return f"""<div id="agegate" role="dialog" aria-modal="true" aria-label="Age verification"><div class="card"><img src="{prefix}img/badge.png" alt="Terps Dispensary">
<h2>Are you 21 or older?</h2><p>You must be 21+ with a valid government-issued ID to view this menu. Recreational · Pueblo, CO.</p>
<button class="btn btn-gold" id="age-yes">Yes, I'm 21 or older</button>
<button class="btn btn-ghost" id="age-no">No, take me back</button></div></div>
<div class="mobile-nav" id="mobilenav" role="navigation" aria-label="Mobile menu"><span class="x">&times;</span>
<a href="{prefix}menu.html">Menu</a><a href="{prefix}menu.html?cat=flower">Flower</a><a href="{prefix}menu.html?cat=concentrate">Concentrates</a>
<a href="{prefix}menu.html?cat=edible">Edibles</a><a href="{prefix}blog/index.html">Blog</a><a href="{prefix}index.html#visit">Visit</a></div>
<header class="site"><div class="wrap nav">
<a class="logo" href="{prefix}index.html"><img src="{prefix}img/logo_horizontal.png" alt="Terps Dispensary"></a>
<nav><a href="{prefix}menu.html">Menu</a><a href="{prefix}menu.html?cat=flower">Flower</a>
<a href="{prefix}menu.html?cat=concentrate">Concentrates</a><a href="{prefix}menu.html?cat=edible">Edibles</a>
<a href="{prefix}blog/index.html">Blog</a><a href="{prefix}index.html#visit">Visit</a></nav>
<div class="spacer"></div>
<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
<input id="headsearch" placeholder="Search 290+ products…"></div>
<button class="cartbtn" data-open-cart>🛍️ Order<span class="count" style="display:none">0</span></button>
<button class="menutoggle" id="menutoggle">☰</button>
</div></header>{cart_drawer(prefix)}"""

def cart_drawer(prefix=''):
    return f"""<div id="cartov"></div><aside id="cart" aria-label="Pickup order">
<div class="chead"><h3>Your pickup order</h3><button class="x" onclick="closeCart()">&times;</button></div>
<div class="items" id="cart-items"></div>
<div class="foot"><div class="tot"><span>Subtotal</span><span id="cart-total">$0.00</span></div>
<div class="note">Send your order to reserve it — we'll have it ready. Pay in store at pickup (21+, valid ID). Questions? Call <a href="tel:7195471850">(719) 547-1850</a> · 38 N Silicon Dr, Pueblo.</div>
<button class="btn btn-gold" onclick="reservePickup()">Reserve for pickup →</button></div></aside>"""

def footer(prefix=''):
    links=''.join(f'<a href="{prefix}menu.html?cat={c}">{n} in Pueblo</a>' for c,n,_ in CATS)
    return f"""</main><footer class="site"><div class="wrap"><div class="cols">
<div><img class="flogo" src="{prefix}img/logo_horizontal.png" alt="Terps Dispensary">
<p>Pueblo's home for premium, locally-loved cannabis. Recreational 21+. Browse our full live menu and reserve for fast in-store pickup.</p></div>
<div><p class="h4">Shop</p><a href="{prefix}menu.html">Full dispensary menu</a>{links}<a href="{prefix}blog/index.html">Blog</a></div>
<div><p class="h4">Visit</p><p>{e(STREET)}<br>{e(CITY)}, {e(STATE)} {e(ZIP)}<br><br>Mon–Sat 8am–8pm<br>Sun 10am–5pm<br><br><a href="tel:{PHONE_TEL}">{PHONE}</a></p></div>
</div><div class="copy"><span>© 2026 Terps Dispensary. Rec 21+. Keep out of reach of children.</span>
<span>Live menu powered by our POS · Updated in real time</span></div></div></footer>
<script src="{prefix}js/config.js"></script><script src="{prefix}js/orders.js"></script><script src="{prefix}js/app.js"></script>"""

def price_str(p):
    u=p.get('unit','')
    us=f'<small>{u}</small>' if u else ''
    return (money(p['price_min'])+us) if p['price_min']==p['price_max'] else f"{money(p['price_min'])}<small>–{money(p['price_max'])}{u}</small>"
def money(x): return '$'+format(x,'.2f')

def card(p,prefix=''):
    catname_a={c:n for c,n,_ in CATS}.get(p['category'],p['category'].title())
    alt=f"{p['name']} by {p['brand'] or 'Terps'} — {catname_a.lower()} at Terps Dispensary in Pueblo, CO"
    ph=f'<img src="{prefix}{p["photo"]}" loading="lazy" decoding="async"{imgdims(p)} alt="{e(alt)}">' if p['photo'] else FALLBACK_SVG
    thc=f'<span class="thc">{round(p["thc_max"])}% THC</span>' if p.get('thc_max') else ''
    strains=f'<span class="strains">{p["n_strains"]} strains</span>' if p['n_strains']>1 else '<span class="strains">In stock</span>'
    catname={c:n for c,n,_ in CATS}.get(p['category'],p['category'].title())
    return f"""<a class="card" href="{prefix}product/{p['slug']}.html" data-id="{p['id']}">
<div class="ph"><span class="tag">{e(catname)}</span>{thc}{ph}<div class="soldtag">Sold out</div></div>
<div class="body"><div class="brand">{e(p['brand'] or 'Terps')}</div>
<p class="name">{e(p['name'])}</p>
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
    ld={"@context":"https://schema.org","@type":["Store","LocalBusiness"],"name":"Terps Dispensary","image":f"{BASE}/img/badge.png",
        "@id":BASE,"url":BASE,"telephone":"+17195471850","priceRange":"$$",
        "address":{"@type":"PostalAddress","streetAddress":STREET,"addressLocality":CITY,"addressRegion":STATE,"postalCode":ZIP,"addressCountry":"US"},
        "geo":{"@type":"GeoCoordinates","latitude":38.3096,"longitude":-104.6810},
        "openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],"opens":"08:00","closes":"20:00"},{"@type":"OpeningHoursSpecification","dayOfWeek":"Sunday","opens":"10:00","closes":"17:00"}]}
    faqs=[
        ("Do I need to be 21 to shop at Terps Dispensary in Pueblo?",
         "Yes. Terps is a licensed recreational dispensary — you must be 21 or older with a valid government-issued photo ID to enter and purchase. No medical card is required."),
        ("What are your hours?",
         f"We're open Monday through Saturday 8:00am–8:00pm and Sunday 10:00am–5:00pm at {STREET}, {CITY}, {STATE} {ZIP}."),
        ("Can I order cannabis online for pickup in Pueblo?",
         "Yes — browse our live menu, add products to your order, and reserve online. Your order is ready when you walk in; you pay in store at pickup (21+, valid ID required)."),
        ("What payment methods do you accept?",
         f"You pay in store at pickup. Call us at {PHONE} for current accepted payment options before your visit."),
        ("Can out-of-state visitors buy at your dispensary?",
         "Yes. Colorado allows recreational cannabis sales to any adult 21+ with a valid government-issued ID — out-of-state and international IDs are accepted."),
        ("How much cannabis can I buy in Colorado?",
         "Colorado law allows adults 21+ to purchase up to 1 ounce of flower (or its equivalent in concentrates or edibles) per transaction."),
        ("What should I bring for my first visit?",
         "Just a valid, unexpired government-issued photo ID proving you're 21+. Our budtenders will walk you through the menu and help you find the right product."),
        ("Is your online menu accurate?",
         "Yes — our menu syncs live from our point of sale, so products, prices, and stock levels update in real time throughout the day."),
    ]
    faq_ld={"@context":"https://schema.org","@type":"FAQPage",
        "mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in faqs]}
    faq_html=''.join(f'<details class="faq-item"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q,a in faqs)
    h=head("Dispensary Pueblo CO — Terps Dispensary | Rec 21+ Menu",
           "Terps Dispensary — recreational dispensary in Pueblo, Colorado. 290+ cannabis products with live prices: flower, edibles, concentrates. Order online for pickup. 21+."[:155],
           BASE+'/',f'\n<script type="application/ld+json">{json.dumps(ld)}</script>\n<script type="application/ld+json">{json.dumps(faq_ld)}</script>').replace('{CSS}','css/style.css')
    body=f"""{header()}<main>
<section class="hero"><div class="wrap">
<div><div class="eyebrow">Pueblo, Colorado · Recreational 21+</div>
<h1>Pueblo's best shelf,<br>now <span class="hl">online</span>.</h1>
<p class="lede">Browse our entire live menu — {TOTAL}+ products and {STRAINS}+ strains, priced in real time. Reserve in seconds, pay in store.</p>
<div class="cta-row"><a class="btn btn-gold btn-lg" href="menu.html">Browse the menu →</a>
<a class="btn btn-ghost btn-lg" href="#visit" style="background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.25)">Visit us</a></div>
<div class="stats"><div class="s"><b>{TOTAL}+</b><span>Products</span></div><div class="s"><b>{STRAINS}+</b><span>Strains</span></div><div class="s"><b>Live</b><span>Real-time stock</span></div></div>
</div><div class="badge-art"><img src="img/badge.png" width="471" height="568" fetchpriority="high" alt="Terps Dispensary badge — recreational cannabis dispensary in Pueblo, Colorado"></div>
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
<div class="row"><b>Menu</b><span><a href="menu.html" style="color:var(--gold-text);font-weight:700">Browse the full live menu →</a></span></div>
</div>
<div class="map"><iframe loading="lazy" title="Map to Terps Dispensary, 38 N Silicon Dr, Pueblo, CO" src="https://maps.google.com/maps?q=38%20N%20Silicon%20Dr%2C%20Pueblo%2C%20CO%2081007&t=&z=15&ie=UTF8&iwloc=&output=embed"></iframe></div>
</div></div></section>

<section class="block" id="faq"><div class="wrap"><div class="sec-head"><div><div class="eyebrow">Good to know</div><h2>Dispensary FAQs</h2></div></div>
<div class="faq">{faq_html}</div></div></section>
{footer()}</body></html>"""
    open(f'{SITE}/index.html','w').write(h+body)

# ---------------- MENU PAGE ----------------
def build_menu():
    h=head("Weed Menu Pueblo CO — Terps Dispensary Live Menu 21+",
           f"Live dispensary menu in Pueblo, Colorado — {TOTAL}+ cannabis products, {STRAINS}+ strains. Filter flower, vapes, concentrates & edibles by price and THC. Pickup 21+."[:155],
           BASE+'/menu.html').replace('{CSS}','css/style.css')
    body=f"""{header()}<main>
<div class="menu-head"><div class="wrap"><div class="eyebrow" style="color:var(--gold)">Live menu · updated in real time</div>
<h1>The full shelf</h1><p>{TOTAL} products · {STRAINS} strains · reserve online, pay in store</p></div></div>
<div class="wrap"><div class="menu-layout">
<aside class="filters" id="filters"></aside>
<div><div class="menu-toolbar">
<button class="chip filter-toggle" id="filtertoggle">☰ Filters</button>
<span class="count" id="count">Loading…</span><div class="spacer"></div>
<input class="msearch" id="msearch" placeholder="Search…">
<select id="sortsel" aria-label="Sort products"><option value="featured">Featured</option><option value="price">Price: low→high</option>
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
        catname={c:n for c,n,_ in CATS}.get(p['category'],p['category'].title())
        photo=f"../{p['photo']}" if p['photo'] else ''
        gal_alt=f"{p['name']} by {p['brand'] or 'Terps'} — {catname.lower()} available at Terps Dispensary, Pueblo, CO"
        gal=f'<img src="{photo}" fetchpriority="high" decoding="async"{imgdims(p)} alt="{e(gal_alt)}">' if photo else FALLBACK_SVG
        pills=[]
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
        pool=[x for x in bycat.get(p['category'],[]) if x['id']!=p['id'] and x['photo']]
        related=([x for x in pool if x['subcategory']==p['subcategory']]+[x for x in pool if x['subcategory']!=p['subcategory']])[:4]
        rel=''.join(card(x,'../') for x in related)
        pr=price_str(p)
        canonical=f"{BASE}/product/{p['slug']}.html"
        pimg=f"{BASE}/{p['photo']}" if p['photo'] else f"{BASE}/img/badge.png"
        if p['price_min']==p['price_max']:
            offers={"@type":"Offer","price":f"{p['price_min']:.2f}","priceCurrency":"USD","availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition","url":canonical}
        else:
            offers={"@type":"AggregateOffer","lowPrice":f"{p['price_min']:.2f}","highPrice":f"{p['price_max']:.2f}","priceCurrency":"USD","offerCount":p['n_strains'],"availability":"https://schema.org/InStock","url":canonical}
        ld={"@context":"https://schema.org","@type":"Product","name":p['name'],"sku":p['id'],
            "brand":{"@type":"Brand","name":p['brand'] or 'Terps'},"category":catname,
            "description":re.sub('<[^>]+>','',desc)[:300],
            "image":pimg,"offers":offers}
        crumbs_ld={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
            {"@type":"ListItem","position":1,"name":"Home","item":BASE+'/'},
            {"@type":"ListItem","position":2,"name":"Menu","item":BASE+'/menu.html'},
            {"@type":"ListItem","position":3,"name":catname,"item":f"{BASE}/menu.html?cat={p['category']}"},
            {"@type":"ListItem","position":4,"name":p['name'],"item":canonical}]}
        title=f"{p['name']} — {p['brand'] or 'Terps'} | Terps Pueblo CO"
        if len(title)>60: title=f"{p['name']} | Terps Pueblo CO"
        if len(title)>60: title=f"{p['name'][:44]}… | Terps Pueblo CO"
        metadesc=re.sub('<[^>]+>','',desc)
        if len(metadesc)>155: metadesc=metadesc[:152].rstrip()+'…'
        h=head(title,metadesc,canonical,
               f'\n<script type="application/ld+json">{json.dumps(ld)}</script>\n<script type="application/ld+json">{json.dumps(crumbs_ld)}</script>',
               ogtype='product',ogimage=pimg,prefix='../').replace('{CSS}','../css/style.css')
        body=f"""{header('../')}<main>
<div class="wrap"><div class="breadcrumb"><a href="../index.html">Home</a> › <a href="../menu.html">Menu</a> › <a href="../menu.html?cat={p['category']}">{e(catname)}</a> › {e(p['name'])}</div></div>
<div class="wrap"><div class="pdp">
<div class="gallery">{gal}</div>
<div class="info">
<div class="brand">{e(p['brand'] or 'Terps')}</div><h1>{e(p['name'])}</h1>
<div class="meta">{''.join(pills)}</div>
<div class="priceline" id="priceline">{pr}</div>
<div class="strain-sel">{f'<p class="h4">Choose a strain ({p["n_strains"]})</p><div class="strain-grid">{strain_opts}</div>' if p['n_strains']>1 else ''}</div>
<div class="addrow"><div class="qty"><button onclick="qc(-1)">−</button><span id="qty">1</span><button onclick="qc(1)">+</button></div>
<button class="btn btn-gold btn-lg" style="flex:1;justify-content:center" onclick="addPDP()">Add to pickup order</button></div>
<div class="desc"><p class="h4">About this product</p><p>{e(desc)}</p></div>
<div class="disclaimer">Prices and availability update live from our register and may change. Reserve online, pay in store at pickup. Must be 21+ with valid ID. Keep out of reach of children.</div>
</div></div>
{f'<section class="block"><div class="sec-head"><div><h2>More {e(catname.lower())} at Terps in Pueblo</h2></div><a class="more" href="../menu.html?cat={p["category"]}">Shop all {e(catname.lower())} in Pueblo, CO →</a></div><div class="grid">{rel}</div></section>' if rel else ''}
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

# ---------------- BLOG ----------------
def load_posts():
    posts=[]
    if not os.path.isdir(BLOG_SRC): return posts
    for fn in sorted(os.listdir(BLOG_SRC)):
        if not fn.endswith('.md'): continue
        raw=open(f'{BLOG_SRC}/{fn}').read()
        m=re.match(r'(?s)^---\n(.*?)\n---\n(.*)$',raw)
        fm,body=m.groups()
        meta={}
        for line in fm.splitlines():
            km=re.match(r'^(\w+):\s*(.*)$',line)
            if km: meta[km.group(1)]=km.group(2).strip().strip('"')
        posts.append({'title':meta['title'],'slug':meta['slug'],'date':meta['date'],
                      'description':meta['description'],'body':body.strip()})
    posts.sort(key=lambda p:(p['date'],p['slug']),reverse=True)
    return posts

def fmt_date(d): return datetime.date.fromisoformat(d).strftime('%b %-d, %Y')

def md_html(md):
    def inline(s):
        s=e(s)
        return re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s)
    out=[];ul=[]
    def flush():
        if ul: out.append('<ul>'+''.join(f'<li>{i}</li>' for i in ul)+'</ul>'); ul.clear()
    for block in re.split(r'\n\s*\n',md):
        b=re.sub(r'\s+',' ',block.strip())
        if not b: continue
        if b.startswith('- '): ul.append(inline(b[2:])); continue
        flush()
        if b.startswith('### '): out.append(f'<h3>{inline(b[4:])}</h3>')
        elif b.startswith('## '): out.append(f'<h2>{inline(b[3:])}</h2>')
        else: out.append(f'<p>{inline(b)}</p>')
    flush()
    return '\n'.join(out)

def post_hero(slug,prefix=''):
    src=f'img/blog/{slug}/hero.jpg'
    local=os.path.exists(f'{SITE}/{src}') or os.path.exists(os.path.join(ROOT,src))
    return f'{prefix}{src}' if local else ''

BLOG_CSS='<link rel="stylesheet" href="{PREFIX}css/blog.css">'

def build_blog():
    posts=load_posts()
    for p in posts:
        canonical=f"{BASE}/post/{p['slug']}"
        hero=post_hero(p['slug'],'../')
        ld={"@context":"https://schema.org","@type":"Article","headline":p['title'],
            "datePublished":p['date'],"description":p['description'],
            "mainEntityOfPage":canonical,"author":{"@type":"Person","name":"Evan Smith"},
            "publisher":{"@type":"Organization","name":"Terps Dispensary",
                         "logo":{"@type":"ImageObject","url":f"{BASE}/img/badge.png"}}}
        if hero: ld["image"]=f"{BASE}/img/blog/{p['slug']}/hero.jpg"
        extra=f'\n{BLOG_CSS.replace("{PREFIX}","../")}\n<script type="application/ld+json">{json.dumps(ld)}</script>'
        h=head(f"{p['title']} | Terps Dispensary Blog",p['description'][:155],canonical,extra,ogtype='article',prefix='../').replace('{CSS}','../css/style.css')
        heroimg=f'<figure class="post-hero"><img src="{hero}" alt="{e(p["title"])}"></figure>' if hero else ''
        body=f"""{header('../')}
<article class="post"><div class="wrap">
<div class="breadcrumb"><a href="../index.html">Home</a> › <a href="../blog/index.html">Blog</a> › {e(p['title'])}</div>
<header class="post-head"><div class="eyebrow">Terps Dispensary Blog</div>
<h1>{e(p['title'])}</h1>
<div class="post-meta">By Evan Smith · <time datetime="{p['date']}">{fmt_date(p['date'])}</time></div></header>
{heroimg}
<div class="post-body">
{md_html(p['body'])}
</div>
<aside class="post-cta"><div class="eyebrow">Visit us in Pueblo</div>
<h3>Shop Pueblo's deepest shelf</h3>
<p>Browse 290+ products and 740+ strains on our live menu — priced in real time. Reserve online, pay in store.</p>
<a class="btn btn-gold" href="../menu.html">Browse the live menu →</a></aside>
</div></article>
{footer('../')}</body></html>"""
        open(f"{SITE}/post/{p['slug']}.html",'w').write(h+body)
    # blog index
    cards=''
    for p in posts:
        hero=post_hero(p['slug'],'../')
        thumb=f'<img src="{hero}" loading="lazy" alt="{e(p["title"])}">' if hero else FALLBACK_SVG
        cards+=f"""<a class="blog-card" href="../post/{p['slug']}.html">
<div class="ph">{thumb}</div>
<div class="body"><time datetime="{p['date']}">{fmt_date(p['date'])}</time>
<h2>{e(p['title'])}</h2><p>{e(p['description'][:180].rstrip())}…</p>
<span class="more">Read more →</span></div></a>"""
    extra='\n'+BLOG_CSS.replace('{PREFIX}','../')
    h=head("Blog — Terps Dispensary Pueblo | Cannabis News & Guides",
           "News and guides from Terps Dispensary in Pueblo, CO — Colorado cannabis industry insights, dispensary guides and market updates.",
           f'{BASE}/blog/',extra,prefix='../').replace('{CSS}','../css/style.css')
    body=f"""{header('../')}
<div class="menu-head"><div class="wrap"><div class="eyebrow" style="color:var(--gold)">From the Terps team</div>
<h1>The Terps blog</h1><p>Colorado cannabis news, guides and market insights</p></div></div>
<div class="wrap"><div class="blog-grid">{cards}</div></div>
{footer('../')}</body></html>"""
    open(f'{SITE}/blog/index.html','w').write(h+body)
    return posts

# ---------------- SITEMAP / ROBOTS ----------------
def build_meta(posts):
    def entry(loc,img=None,img_title=None):
        s=f'  <url><loc>{loc}</loc><lastmod>{TODAY}</lastmod><changefreq>daily</changefreq>'
        if img: s+=f'<image:image><image:loc>{img}</image:loc><image:title>{e(img_title or "")}</image:title></image:image>'
        return s+'</url>\n'
    sm=('<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n')
    sm+=entry(f'{BASE}/',f'{BASE}/img/og-card.jpg','Terps Dispensary — Pueblo, Colorado')
    sm+=entry(f'{BASE}/menu.html')
    for p in cat:
        img=f"{BASE}/{p['photo']}" if p['photo'] else None
        sm+=entry(f"{BASE}/product/{p['slug']}.html",img,f"{p['name']} — Terps Dispensary Pueblo" if img else None)
    sm+=entry(f'{BASE}/blog/')
    for p in posts:
        sm+=entry(f"{BASE}/post/{p['slug']}")
    sm+='</urlset>\n'
    open(f'{SITE}/sitemap.xml','w').write(sm)
    open(f'{SITE}/robots.txt','w').write(
        "User-agent: *\nAllow: /\n"
        "Disallow: /staff.html\nDisallow: /order.html\n"
        f"Sitemap: {BASE}/sitemap.xml\n")

build_home(); build_menu(); build_products(); posts=build_blog(); build_meta(posts)
print(f'built: index.html, menu.html, {len(cat)} product pages, {len(posts)} blog posts + blog index, sitemap({len(cat)+3+len(posts)} urls)')
print(f'photos on {sum(1 for p in cat if p["photo"])} products')
