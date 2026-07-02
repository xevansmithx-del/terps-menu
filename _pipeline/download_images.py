#!/usr/bin/env python3
"""Download + optimize matched Weedmaps photos into repo img/ keyed by weave id."""
import json, os, io, urllib.request, concurrent.futures as cf
from PIL import Image

DATA='data'; OUT='site/img/products'
os.makedirs(OUT, exist_ok=True)
prods=json.load(open(f'{DATA}/catalog.json'))
todo=[(p['id'], p['wm_img']) for p in prods if p.get('wm_img')]
# dedupe by url -> download once, map to all ids
url_ids={}
for pid,url in todo: url_ids.setdefault(url,[]).append(pid)
print(f'{len(todo)} matched products, {len(url_ids)} unique image urls')

HDR={'User-Agent':'Mozilla/5.0','Accept':'image/*'}
def fetch(url):
    try:
        req=urllib.request.Request(url,headers=HDR)
        raw=urllib.request.urlopen(req,timeout=25).read()
        im=Image.open(io.BytesIO(raw)).convert('RGB')
        # square-ish thumb: max 600px longest side
        w,h=im.size; m=max(w,h)
        if m>600:
            im=im.resize((int(w*600/m),int(h*600/m)), Image.LANCZOS)
        return url, im
    except Exception as e:
        return url, None

ok=0; fail=0; failed=[]
with cf.ThreadPoolExecutor(max_workers=16) as ex:
    for url,im in ex.map(fetch, url_ids.keys()):
        if im is None: fail+=1; failed.append(url); continue
        for pid in url_ids[url]:
            im.save(f'{OUT}/{pid}.jpg','JPEG',quality=82,optimize=True)
        ok+=1
print(f'downloaded {ok} images, {fail} failed')
# record which products actually have a local image
have=set()
for url,ids in url_ids.items():
    if os.path.exists(f'{OUT}/{ids[0]}.jpg'):
        have.update(ids)
for p in prods:
    p['has_photo']= p['id'] in have
json.dump(prods,open(f'{DATA}/catalog.json','w'),indent=1)
n=sum(1 for p in prods if p.get('has_photo'))
print(f'products with local photo: {n}/{len(prods)}')
sz=sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
print(f'img dir size: {round(sz/1e6,1)} MB, {len(os.listdir(OUT))} files')
if failed: json.dump(failed,open(f'{DATA}/failed_imgs.json','w'))
