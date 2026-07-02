#!/usr/bin/env python3
"""Canonical Terps catalog: group live Weave feed by product, strains as options, match photos."""
import json, re, unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
DATA='data'
STOP={'the','and','by','of','a','an','with','for','online','exclusive','only','ordering','deal','special','new','i'}
SIZE=re.compile(r'\b\d+(\.\d+)?\s*(mg|g|gram|grams|ml|oz|ounce|pk|pack|ct|count|x|pc|pcs|piece|pieces)\b|\b(1/8|1/4|1/2|3\.5g?|7g|14g|28g|eighth|quarter|half)\b',re.I)
PUNCT=re.compile(r'[^a-z0-9\s]'); BRAND=re.compile(r'\b(llc|inc|co|company|labs?|extracts?|farms?|brands?|sciences?|cannabis|concentrates?|buds?|manufacturing)\b',re.I)
def sa(s): return unicodedata.normalize('NFKD',s or '').encode('ascii','ignore').decode()
def toks(s,db=False):
    s=sa(s).lower(); s=SIZE.sub(' ',s)
    if db: s=BRAND.sub(' ',s)
    s=PUNCT.sub(' ',s); return [t for t in s.split() if t not in STOP and len(t)>1 and not t.isdigit()]
def score(a,b):
    if not a or not b: return 0.0
    A,B=set(a),set(b); jacc=len(A&B)/len(A|B); seq=SequenceMatcher(None,' '.join(a),' '.join(b)).ratio(); contain=len(A&B)/max(1,len(A))
    return 0.30*jacc+0.25*seq+0.45*contain
def slugify(s):
    s=sa(s).lower(); s=re.sub(r'[^a-z0-9]+','-',s).strip('-'); return s[:80] or 'item'

raw=json.load(open(f'{DATA}/menu_raw.json'))['results']
byid=defaultdict(list)
for p in raw: byid[p['id']].append(p)

# ---- units --------------------------------------------------------------
# Owner directive (2026-07-02): "We do not sell by the gram, we only sell
# pre-packaged 1/8th oz increments on all our flower unless it specifically
# says otherwise. Joints and everything else are case by case."
# The Weave POS models loose bud as a per-gram unit price (an eighth rings up
# as 3500mg x $/g — verified against real register transactions), so the
# package price of an eighth = per-gram cents x 3.5.
EIGHTH_G=3.5
# Real per-gram prices at Terps run $1.21-$3.71/g. A "loose" variant at >=$10/g
# is a package price that was entered as loose in the POS (e.g. the $45
# half-ounce deals) — display it as-is, never multiply.
MAX_LOOSE_PER_GRAM_CENTS=1000
NOT_BUD=re.compile(r'pre.?roll|cone|joint|blunt|infused|\bpack\b|\bpk\b|\bkief\b|caviar',re.I)
try: UX=json.load(open(f'{DATA}/unit_exceptions.json'))
except FileNotFoundError: UX={}
PER_GRAM_OK=set(UX.get('per_gram_ok') or [])
NO_EIGHTH_MATH=set(UX.get('no_eighth_math') or [])
PREPACK_KIND={3500:'eighth',7000:'quarter',14000:'half',28000:'ounce'}
UNIT_LABEL={'eighth':' · 3.5g eighth','quarter':' · 7g quarter','half':' · 14g half',
            'ounce':' · 28g ounce','per_gram':'/g','package':'','':''}

def visible_variants(rows):
    out=[]
    for r in rows:
        name=(r.get('name') or '').strip()
        bud=(r.get('category')=='flower') and not NOT_BUD.search(name)
        for v in (r.get('variants') or []):
            if v.get('hidden_from_menu'): continue
            if (v.get('quantity',0) or 0)<=0: continue
            if (v.get('price',0) or 0)<50: continue
            pot=(v.get('potency_result') or {}).get('thc') or {}
            cents=v['price']; kind=''
            if bud and v.get('type')=='loose':
                if name in PER_GRAM_OK: kind='per_gram'
                elif cents>=MAX_LOOSE_PER_GRAM_CENTS or name in NO_EIGHTH_MATH: kind='package'
                else: cents=int(cents*EIGHTH_G+0.5); kind='eighth'
            elif bud and v.get('type')=='prepack':
                kind=PREPACK_KIND.get((v.get('packaging') or {}).get('thc_weight'),'package')
            out.append({
                'strain': (v.get('name') or name or '').strip(),
                'price': round(cents/100.0,2),
                'kind': kind,
                'thc_min': pot.get('min_percentage'), 'thc_max': pot.get('max_percentage'),
                'sub': r.get('subcategory',''),
            })
    return out

cat=[]
seen_slug=set()
for pid,rows in byid.items():
    r0=rows[0]
    name=(r0.get('name') or '').strip()
    if not name or re.search(r'sample',name,re.I): continue
    vs=visible_variants(rows)
    if not vs: continue
    prices=[v['price'] for v in vs]
    thcs=[v['thc_max'] for v in vs if v.get('thc_max')]
    # dedupe strains by name keeping cheapest
    bystrain={}
    for v in vs:
        k=v['strain']
        if k not in bystrain or v['price']<bystrain[k]['price']: bystrain[k]=v
    strains=sorted(bystrain.values(), key=lambda v:v['strain'].lower())
    base=slugify(f"{name}")
    slug=base; n=2
    while slug in seen_slug: slug=f"{base}-{n}"; n+=1
    seen_slug.add(slug)
    category=(r0.get('category') or '').strip()
    kinds=set(v['kind'] for v in vs)
    if len(kinds)==1:
        unit_kind=kinds.pop()
    else:
        unit_kind=''  # mixed pricing kinds in one product: label nothing, prices stay per-variant-correct
        print(f'WARN: mixed unit kinds {sorted(kinds)} on "{name}" — no unit label')
    unit=UNIT_LABEL.get(unit_kind,'')
    thc_max = max(thcs) if thcs else None
    if category=='flower' and thc_max and thc_max>42: thc_max=None
    def cs(t): return None if (category=='flower' and t and t>42) else t
    cat.append({
        'id':pid,'slug':slug,'name':name,
        'brand':(r0.get('vendor') or {}).get('name','').strip(),
        'category':category,
        'subcategory':(r0.get('subcategory') or '').strip(),
        'price_min':min(prices),'price_max':max(prices),'unit':unit,'unit_kind':unit_kind,
        'thc_max':thc_max,
        'n_strains':len(strains),
        'strains':[{'name':s['strain'],'price':s['price'],'thc':cs(s.get('thc_max'))} for s in strains],
        'description':(r0.get('description') or '').strip(),
    })
print(f'distinct products: {len(cat)}')

# ---- photo match (per product) ----
wm=json.load(open(f'{DATA}/wm_items_pueblo.json'))
wmr=[]
for i in wm:
    img=i.get('img','')
    if not img or any(x in img for x in('avatar-placeholder','no_image','missing')): continue
    i['toks']=toks(i['name'],True); i['bc']=set(toks(i['cells'][0] if i['cells'] else '',True))
    i['cat']=(i['cells'][1] if len(i['cells'])>1 else ''); i['own']='/pictures/users/' in img
    i['distinct']=set(t for t in i['toks'] if len(t)>=4); wmr.append(i)
BUCK={'flower':{'flower','pre roll','infused pre roll','preroll'},'concentrate':{'concentrates','vape pens','concentrate'},
 'edible':{'edibles','drinks','edible'},'topical':{'wellness','topicals','topical'},'merchandise':{'gear','accessory','merchandise'}}
def compat(wc,wmcat):
    wmcat=(wmcat or '').lower().strip(); b=BUCK.get(wc,set())
    return True if not wmcat else any(x in wmcat or wmcat in x for x in b)
def best_photo(p):
    # try product name; also try product name + first strain (helps single-strain lines)
    cand_names=[p['name']]
    if p['n_strains']==1: cand_names.append(f"{p['name']} {p['strains'][0]['name']}")
    vt=set(toks(p['brand'],True)); best,bs=None,0.0
    for nm in cand_names:
        pt=toks(nm,True); pd=set(t for t in pt if len(t)>=4)
        for i in wmr:
            if not compat(p['category'],i['cat']): continue
            s=score(pt,i['toks']); bok=bool(vt and (vt&i['bc'] or vt&set(i['toks'])))
            if bok: s+=0.18
            if i['own']: s+=0.03
            if not (pd & i['distinct']) and not bok: s*=0.5
            if s>bs: best,bs=i,s
    return best,round(bs,3)
for p in cat:
    b,s=best_photo(p)
    p['wm_img']= b['img'] if (b and s>=0.55) else ''
    p['match_score']=s
withimg=sum(1 for p in cat if p['wm_img'])
print(f'photo matches (cat-gated >=.55): {withimg}/{len(cat)} = {round(100*withimg/len(cat))}%')
json.dump(cat,open(f'{DATA}/catalog.json','w'),indent=1)
import collections
byc=collections.Counter(p['category'] for p in cat); bci=collections.Counter(p['category'] for p in cat if p['wm_img'])
for c in byc: print(f'  {c:12} {bci[c]}/{byc[c]}')
print('total strains across catalog:', sum(p['n_strains'] for p in cat))
