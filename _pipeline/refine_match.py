import json, re, unicodedata
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
BUCK={'flower':{'flower','pre roll','infused pre roll','preroll'},'concentrate':{'concentrates','vape pens','concentrate'},
 'edible':{'edibles','drinks','edible'},'topical':{'wellness','topicals','topical'},'merchandise':{'gear','accessory','merchandise'}}
def compat(wc, wmcat):
    wmcat=(wmcat or '').lower().strip(); b=BUCK.get(wc,set())
    if not wmcat: return True
    return any(x in wmcat or wmcat in x for x in b)

raw=json.load(open(f'{DATA}/menu_raw.json'))
wm=json.load(open(f'{DATA}/wm_items_pueblo.json'))
wmr=[]
for i in wm:
    img=i.get('img','')
    if not img or any(x in img for x in('avatar-placeholder','no_image','missing')): continue
    i['toks']=toks(i['name'],True); i['bc']=set(toks(i['cells'][0] if i['cells'] else '',True))
    i['cat']=(i['cells'][1] if len(i['cells'])>1 else ''); i['own']='/pictures/users/' in img
    i['distinct']=set(t for t in i['toks'] if len(t)>=4)
    wmr.append(i)

prods=json.load(open(f'{DATA}/products.json'))
def rematch(p):
    pt=toks(p['name'],True); vt=set(toks(p['brand'],True))
    pdistinct=set(t for t in pt if len(t)>=4)
    best,bs=None,0.0
    for i in wmr:
        if not compat(p['category'], i['cat']): 
            continue
        s=score(pt,i['toks'])
        brand_ok = bool(vt and (vt & i['bc'] or vt & set(i['toks'])))
        if brand_ok: s+=0.18
        if i['own']: s+=0.03
        # require a shared distinctive token OR brand agreement, else penalize hard
        if not (pdistinct & i['distinct']) and not brand_ok:
            s*=0.5
        if s>bs: best,bs=i,s
    return best,round(bs,3)

kept=0
for p in prods:
    b,s=rematch(p)
    if b and s>=0.55:
        p['wm_name']=b['name']; p['wm_img']=b['img']; p['wm_own']=b['own']; p['match_score']=s; kept+=1
    else:
        p['wm_name']=''; p['wm_img']=''; p['wm_own']=False; p['match_score']=s
json.dump(prods,open(f'{DATA}/products.json','w'),indent=1)
withimg=[p for p in prods if p['wm_img']]
print(f'total {len(prods)} | with photo (>=.55, cat-gated): {len(withimg)} = {round(100*len(withimg)/len(prods))}%')
import collections
byc=collections.Counter(p['category'] for p in prods)
byci=collections.Counter(p['category'] for p in withimg)
for c in byc: print(f'  {c:14} {byci[c]}/{byc[c]} photos')
print('\nspot-check formerly-bad:')
for nm in ('Mints','Egozi','Jupiter','Incredible','Yin Yang'):
    for p in prods:
        if p['name'].startswith(nm): print(f"  {p['match_score']} {p['name'][:34]:34}[{p['brand'][:14]}]-> {p['wm_name'][:40] or '(placeholder)'}"); break
