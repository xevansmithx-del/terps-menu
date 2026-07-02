#!/usr/bin/env python3
"""Generate unique, factual PDP descriptions for every catalog product.

Writes data/descriptions.json keyed by product id. Descriptions are built
deterministically from catalog fields (name, brand, category, strains, THC,
price/unit), 40-70 words each, with rotated sentence structures so no two
read alike. Recreational 21+ framing only; no medical or health claims.
"""
import json, os

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
cat = json.load(open(f'{DATA}/catalog.json'))

CATNAME = {'flower': 'flower', 'concentrate': 'concentrate', 'edible': 'edible',
           'topical': 'topical', 'merchandise': 'gear'}

SUBPHRASE = {
    'hybrid': 'hybrid flower', 'indica': 'indica flower', 'sativa': 'sativa flower',
    'cartridge': 'vape cartridge', 'wax': 'wax concentrate', 'solventless': 'solventless concentrate',
    'distillate': 'distillate', 'budder': 'budder concentrate', 'live extract': 'live extract',
    'shatter': 'shatter', 'vape': 'vape', 'syringe': 'concentrate syringe', 'resin': 'resin',
    'cured extract': 'cured extract', 'crumble': 'crumble concentrate',
    'candy': 'infused candy', 'gummies': 'infused gummies', 'drink': 'infused beverage',
    'chocolate': 'infused chocolate', 'capsule': 'THC capsules', 'tincture': 'tincture',
    'salve': 'cannabis-infused salve', 'balm': 'cannabis-infused balm',
    'patch': 'transdermal patch', 'lotion': 'cannabis-infused lotion',
    'accessory': 'smoking accessory', 'other': None,
}

def money(x):
    s = f'${x:.2f}'
    return s[:-3] if s.endswith('.00') else s

def art(word):
    return 'an' if word[0].lower() in 'aeiou' else 'a'

def kind(p):
    sp = SUBPHRASE.get(p['subcategory'])
    return sp or CATNAME.get(p['category'], p['category'])

# flower sells as pre-packaged eighths (owner directive 2026-07-02) — price
# phrasing must name the package, never "per gram" (unless unit_kind='per_gram',
# an explicit exception in data/unit_exceptions.json)
UNIT_TEXT = {'eighth': ' for a 3.5g eighth', 'quarter': ' for a 7g quarter',
             'half': ' for a 14g half-ounce', 'ounce': ' for a 28g ounce',
             'per_gram': ' per gram'}

def price_phrase(p, i):
    u = UNIT_TEXT.get(p.get('unit_kind') or '', '')
    if p['price_min'] == p['price_max']:
        opts = [f"priced at {money(p['price_min'])}{u}",
                f"on the shelf at {money(p['price_min'])}{u}",
                f"ringing up at {money(p['price_min'])}{u}",
                f"listed at {money(p['price_min'])}{u}"]
    else:
        opts = [f"running {money(p['price_min'])} to {money(p['price_max'])}{u} depending on your pick",
                f"priced from {money(p['price_min'])} up to {money(p['price_max'])}{u}",
                f"between {money(p['price_min'])} and {money(p['price_max'])}{u} across the lineup",
                f"starting at {money(p['price_min'])}{u}"]
    return opts[i % len(opts)]

def strain_phrase(p, i):
    names = [s['name'] for s in p['strains'] if s.get('name') and s['name'].lower() != 'loose']
    n = p['n_strains']
    if n > 1 and names:
        listed = ', '.join(names[:3])
        opts = [f"Choose from {n} options including {listed}",
                f"It comes in {n} varieties — {listed} among them",
                f"{n} selections are stocked, such as {listed}",
                f"Pick between {n} in-stock options like {listed}"]
        return opts[i % len(opts)] + '.'
    if names:
        nm = names[0]
        opts = [f"This batch features {nm}",
                f"The current cut on the shelf is {nm}",
                f"Right now it comes as {nm}",
                f"The strain in stock is {nm}"]
        return opts[i % len(opts)] + '.'
    return ''

def thc_phrase(p, i):
    if not p.get('thc_max'):
        return ''
    t = round(p['thc_max'], 1)
    t = int(t) if t == int(t) else t
    opts = [f"It tests at {t}% THC",
            f"Lab results show {t}% THC",
            f"Potency tops out at {t}% THC",
            f"THC comes in at {t}%"]
    return opts[i % len(opts)] + '.'

OPENERS = [
    "{name} is {a} {kind} from {brand}, stocked on the live menu at Terps Dispensary in Pueblo, Colorado.",
    "From {brand}, {name} brings {a} {kind} option to the Terps shelf in Pueblo.",
    "Terps Dispensary in Pueblo carries {name}, {a} {kind} made by {brand}.",
    "{brand} puts its stamp on {name}, {a} {kind} you can grab at Terps in Pueblo, Colorado.",
    "Ask our budtenders about {name} — {brands} {kind}, live on the Terps menu in Pueblo.",
    "Pueblo shoppers can find {name}, {a} {kind} by {brand}, on the Terps Dispensary shelf.",
    "{name} lands on the Terps Pueblo menu as {a} {kind} out of {brand}.",
    "{A} {kind} from {brand}, {name} is part of the current lineup at Terps Dispensary in Pueblo.",
]

CLOSERS = [
    "Reserve it online and pay in store at pickup — recreational sales only, 21+ with valid ID.",
    "Add it to a pickup order on our live menu; you must be 21 or older with a valid ID.",
    "Stock and pricing sync straight from our register, so reserve online for fast 21+ recreational pickup.",
    "Swing by 38 N Silicon Dr or reserve online first — adult-use 21+ with government-issued ID.",
    "It's available for online reservation and in-store pickup at our recreational shop, 21+ only.",
    "Order ahead on the live menu and pick it up in store — Colorado recreational rules apply, 21+.",
    "Grab it in store or reserve through the menu; valid 21+ ID required for all recreational purchases.",
    "Like everything on our shelf, it's live-priced from the register — reserve for 21+ pickup today.",
]

FILLERS = [
    "Our menu updates in real time, so what you see online is what's on the shelf.",
    "It sits alongside one of Pueblo's deepest recreational selections.",
    "Quantities move fast, and the live menu always reflects current stock.",
    "It's one of {count} {cat} picks currently stocked at Terps.",
]

counts = {}
for p in cat:
    counts[p['category']] = counts.get(p['category'], 0) + 1

out = {}
texts = set()
for idx, p in enumerate(sorted(cat, key=lambda x: x['id'])):
    brand = p['brand'] or 'Terps'
    k = kind(p)
    a = art(k)
    brands = brand + ("'" if brand.endswith('s') else "'s")
    parts = [OPENERS[(idx * 3) % len(OPENERS)].format(name=p['name'], brand=brand, brands=brands, kind=k, a=a, A=a.capitalize())]
    body = []
    tp = thc_phrase(p, idx)
    sp = strain_phrase(p, idx // 4)
    if tp: body.append(tp)
    if sp: body.append(sp)
    body.append("It is " + price_phrase(p, idx // 2) + '.')
    parts += body
    parts.append(CLOSERS[(idx * 5) % len(CLOSERS)])
    text = ' '.join(parts)
    wc = len(text.split())
    fi = 0
    while wc < 40 and fi < len(FILLERS):
        f = FILLERS[(idx + fi) % len(FILLERS)].format(count=counts[p['category']], cat=CATNAME.get(p['category'], p['category']))
        text = ' '.join(parts[:-1] + [f, parts[-1]])
        parts = parts[:-1] + [f, parts[-1]]
        wc = len(text.split())
        fi += 1
    if wc > 70:
        short_closer = min(CLOSERS, key=lambda c: len(c.split()))
        parts[-1] = short_closer
        text = ' '.join(parts)
        wc = len(text.split())
    if wc > 70 and sp:
        parts.remove(sp)
        text = ' '.join(parts)
        wc = len(text.split())
    assert 40 <= wc <= 70, (p['id'], wc, text)
    assert text not in texts, p['id']
    texts.add(text)
    out[p['id']] = text

json.dump(out, open(f'{DATA}/descriptions.json', 'w'), indent=1, ensure_ascii=False)
print(f'wrote {len(out)} descriptions')
