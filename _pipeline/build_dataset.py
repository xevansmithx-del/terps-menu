#!/usr/bin/env python3
"""Build canonical Terps product dataset from live Weave menu + match Weedmaps photos."""
import json, re, unicodedata
from difflib import SequenceMatcher

DATA = 'data'
STOP = {'the','and','by','of','a','an','with','for','online','exclusive','only','ordering','deal','special','new'}
SIZE = re.compile(r'\b\d+(\.\d+)?\s*(mg|g|gram|grams|ml|oz|ounce|pk|pack|ct|count|x|pc|pcs|piece|pieces)\b|\b(1/8|1/4|1/2|3\.5g?|7g|14g|28g|eighth|quarter|half)\b', re.I)
PUNCT = re.compile(r'[^a-z0-9\s]')
BRANDWORDS = re.compile(r'\b(llc|inc|co|company|labs?|extracts?|farms?|brands?|sciences?|cannabis|concentrates?|buds?)\b', re.I)

def strip_accents(s):
    return unicodedata.normalize('NFKD', s or '').encode('ascii','ignore').decode()

def core_tokens(s, drop_brand=False):
    s = strip_accents(s).lower()
    s = SIZE.sub(' ', s)
    if drop_brand: s = BRANDWORDS.sub(' ', s)
    s = PUNCT.sub(' ', s)
    toks = [t for t in s.split() if t not in STOP and len(t) > 1 and not t.isdigit()]
    return toks

def score(a, b):
    if not a or not b: return 0.0
    A, B = set(a), set(b)
    jacc = len(A & B) / len(A | B)
    seq = SequenceMatcher(None, ' '.join(a), ' '.join(b)).ratio()
    contain = len(A & B) / max(1, len(A))  # how much of weave name is in wm
    return 0.30*jacc + 0.25*seq + 0.45*contain

# ---- load live menu (source of truth for what's live) ----
raw = json.load(open(f'{DATA}/menu_raw.json'))
results = raw['results']

def clean_products(results):
    out = []
    for p in results:
        variants = p.get('variants') or []
        vs = [v for v in variants if not v.get('hidden_from_menu') and (v.get('quantity',0) or 0) > 0 and (v.get('price',0) or 0) >= 50]
        if not vs: continue
        if re.search(r'sample', p['name'], re.I): continue
        # cheapest visible variant as display price
        vs_sorted = sorted(vs, key=lambda v: v['price'])
        v0 = vs_sorted[0]
        pot = (v0.get('potency_result') or {}).get('thc') or {}
        thc_min = pot.get('min_percentage'); thc_max = pot.get('max_percentage')
        out.append({
            'id': p['id'],
            'name': p['name'].strip(),
            'brand': (p.get('vendor') or {}).get('name','').strip(),
            'category': (p.get('category') or '').strip(),
            'subcategory': (p.get('subcategory') or '').strip(),
            'price': round(v0['price']/100.0, 2),
            'price_max': round(vs_sorted[-1]['price']/100.0, 2),
            'variant_name': v0.get('name',''),
            'n_variants': len(vs),
            'thc_min': thc_min, 'thc_max': thc_max,
            'cpc': v0.get('cpc',''),
            'description': (p.get('description') or '').strip(),
        })
    return out

prods = clean_products(results)
print(f'live clean products: {len(prods)}')

# ---- load weedmaps images ----
wm = json.load(open(f'{DATA}/wm_items_pueblo.json'))
wm_real = []
for i in wm:
    img = i.get('img','')
    if not img or any(x in img for x in ('avatar-placeholder','no_image','missing')): continue
    i['toks'] = core_tokens(i['name'], drop_brand=True)
    i['brand_cell'] = (i['cells'][0] if i['cells'] else '')
    i['is_own'] = '/pictures/users/' in img
    wm_real.append(i)
print(f'weedmaps items with photos: {len(wm_real)}')

# ---- match ----
def match(p):
    p_toks = core_tokens(p['name'], drop_brand=True)
    v_toks = set(core_tokens(p['brand'], drop_brand=True))
    best, best_s = None, 0.0
    for i in wm_real:
        s = score(p_toks, i['toks'])
        # brand agreement bonus
        bc = set(core_tokens(i['brand_cell'], drop_brand=True))
        if v_toks and (v_toks & bc or v_toks & set(i['toks'])):
            s += 0.18
        # prefer our own uploads slightly
        if i['is_own']: s += 0.03
        if s > best_s:
            best, best_s = i, s
    return best, round(best_s,3)

for p in prods:
    b, s = match(p)
    p['wm_name'] = b['name'] if b else ''
    p['wm_img'] = b['img'] if b else ''
    p['wm_own'] = b['is_own'] if b else False
    p['match_score'] = s

json.dump(prods, open(f'{DATA}/products.json','w'), indent=1)

hi  = [p for p in prods if p['match_score'] >= 0.62]
mid = [p for p in prods if 0.48 <= p['match_score'] < 0.62]
lo  = [p for p in prods if p['match_score'] < 0.48]
print(f'\nMATCH TIERS: HIGH(>=.62)={len(hi)}  MID={len(mid)}  LOW(<.48)={len(lo)}')
print(f'coverage HIGH+MID = {len(hi)+len(mid)}/{len(prods)} = {round(100*(len(hi)+len(mid))/len(prods))}%')
print('\n--- 10 HIGH samples ---')
for p in hi[:10]: print(f"  {p['match_score']} {p['name'][:42]:42} [{p['brand'][:16]}] -> {p['wm_name'][:46]}")
print('\n--- 10 LOW samples (need review/fallback) ---')
for p in lo[:10]: print(f"  {p['match_score']} {p['name'][:42]:42} [{p['brand'][:16]}]")
