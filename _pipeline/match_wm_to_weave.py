import json, re, unicodedata
from difflib import SequenceMatcher

STOP = {'the','and','by','of','a','an','with','in','oz','ct','pk','pack','each'}
SIZE_RE = re.compile(r'\b\d+(\.\d+)?\s*(mg|g|gram|grams|ml|oz|ounce|pk|pack|ct|count|x)\b|\b(1/8|1/4|1/2|3\.5g|eighth|quarter|half)\b', re.I)
PUNCT_RE = re.compile(r'[^a-z0-9\s]')

def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii','ignore').decode()
    s = s.lower()
    s = SIZE_RE.sub(' ', s)
    s = PUNCT_RE.sub(' ', s)
    toks = [t for t in s.split() if t not in STOP and not t.isdigit()]
    return toks

def score(a_toks, b_toks):
    if not a_toks or not b_toks: return 0.0
    a_set, b_set = set(a_toks), set(b_toks)
    jacc = len(a_set & b_set) / len(a_set | b_set)
    seq = SequenceMatcher(None, ' '.join(a_toks), ' '.join(b_toks)).ratio()
    # containment: weave name tokens fully inside wm name
    contain = len(a_set & b_set) / max(1, len(a_set))
    return 0.35*jacc + 0.3*seq + 0.35*contain

_d = json.load(open('data/menu_raw.json'))
weave = _d if isinstance(_d,list) else (_d.get('data') or _d.get('variants') or _d.get('results') or list(_d.values())[0])
wm = json.load(open('data/wm_items_pueblo.json'))
wm_real = [i for i in wm if i['img'] and not any(x in i['img'] for x in ('avatar-placeholder','no_image','missing'))]
for i in wm_real:
    i['brand_cell'] = i['cells'][0] if i['cells'] else ''
    i['toks'] = norm(i['name'])
    i['brand_toks'] = set(norm(i['brand_cell']))

results = []
for p in weave:
    # skip clearly hidden/sample
    if re.search(r'sample', p['name'], re.I): continue
    p_toks = norm(p['name'])
    vendor = (p.get('vendor') or {}).get('name','') or ''
    v_toks = set(norm(vendor))
    best, best_s = None, 0.0
    for i in wm_real:
        s = score(p_toks, i['toks'])
        # brand agreement bonus
        if v_toks and (v_toks & i['brand_toks'] or v_toks & set(i['toks'])):
            s += 0.15
        if s > best_s:
            best, best_s = i, s
    results.append({
        'weave_id': p['id'], 'weave_name': p['name'], 'vendor': vendor,
        'category': p.get('category',''), 'cpc': (p.get('variants') or [{}])[0].get('cpc',''),
        'wm_name': best['name'] if best else '', 'wm_img': best['img'] if best else '',
        'score': round(best_s, 3)
    })

results.sort(key=lambda r: -r['score'])
json.dump(results, open('data/match_results.json','w'), indent=1)
hi = [r for r in results if r['score'] >= 0.75]
mid = [r for r in results if 0.55 <= r['score'] < 0.75]
lo = [r for r in results if r['score'] < 0.55]
print(f'weave products scored: {len(results)}')
print(f'HIGH (>=0.75): {len(hi)}  MID (0.55-0.75): {len(mid)}  LOW (<0.55): {len(lo)}')
print('\n--- sample HIGH ---')
for r in hi[:8]: print(f"  {r['score']} | {r['weave_name']} [{r['vendor']}]  ->  {r['wm_name']}")
print('\n--- sample MID ---')
for r in mid[:8]: print(f"  {r['score']} | {r['weave_name']} [{r['vendor']}]  ->  {r['wm_name']}")
