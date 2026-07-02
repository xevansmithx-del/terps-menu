#!/usr/bin/env python3
"""Sync product photos into img/products/<weave-id>.jpg (repo root).

Preference per product:
  1. Photo uploaded in the Weave POS itself (feed `images[].url` /
     `default_image`) -- the team-controlled source of truth going forward.
     A photo added or replaced in Weave lands here on the next refresh.
  2. Weedmaps-harvest match from catalog.json (`wm_img`) -- fills products
     that have no Weave photo yet and no local file (e.g. new products).
  3. Nothing -> the site renders the branded droplet placeholder.

Never deletes existing images; a failed download leaves the old file alone.
data/image_sources.json records which URL each local file came from, so a
changed photo re-downloads and unchanged ones are skipped. Run AFTER
build_catalog.py (needs fresh catalog.json), from _pipeline/.

Image download failures are logged but do not fail the run: a broken image
CDN must never block a stock/price refresh.
"""
import io, json, os, urllib.request
from PIL import Image

DATA = 'data'
OUT = '../img/products'
os.makedirs(OUT, exist_ok=True)

raw = json.load(open(f'{DATA}/menu_raw.json'))['results']
cat = json.load(open(f'{DATA}/catalog.json'))
try:
    src = json.load(open(f'{DATA}/image_sources.json'))
except FileNotFoundError:
    src = {}

def weave_img(rows):
    """First non-empty http image url on any feed row of this product."""
    for r in rows:
        for im in (r.get('images') or []):
            u = (im.get('url') or '').strip()
            if u.startswith('http'):
                return u
        u = (r.get('default_image') or '').strip()
        if u.startswith('http'):
            return u
    return ''

byid = {}
for r in raw:
    byid.setdefault(r['id'], []).append(r)

todo = []  # (product_id, url)
for pid, rows in byid.items():
    u = weave_img(rows)
    if u and src.get(pid) != u:
        todo.append((pid, u))          # new or changed Weave photo: always wins
n_weave = len(todo)

for p in cat:                          # WM fallback only where no file exists yet
    u = (p.get('wm_img') or '').strip()
    pid = p['id']
    if u.startswith('http') and not os.path.exists(f'{OUT}/{pid}.jpg') \
            and not any(t[0] == pid for t in todo):
        todo.append((pid, u))

print(f'{len(byid)} products in feed; {n_weave} weave new/changed, '
      f'{len(todo) - n_weave} wm fill-ins')

HDR = {'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*'}
ok = fail = 0
for pid, u in todo:
    try:
        req = urllib.request.Request(u, headers=HDR)
        blob = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(blob)).convert('RGB')
        w, h = im.size
        m = max(w, h)
        if m > 600:
            im = im.resize((int(w * 600 / m), int(h * 600 / m)), Image.LANCZOS)
        im.save(f'{OUT}/{pid}.jpg', 'JPEG', quality=82, optimize=True)
        src[pid] = u
        ok += 1
    except Exception as e:
        print(f'  ! {pid}: {e}')
        fail += 1

json.dump(src, open(f'{DATA}/image_sources.json', 'w'), indent=1, sort_keys=True)
print(f'downloaded {ok}, failed {fail} (existing files kept on failure)')
