#!/usr/bin/env python3
"""Pull the live Weave menu feed -> data/menu_raw.json (canonicalized).

Fail-closed: on any anomaly (HTTP error, short feed, missing ids) this exits
non-zero WITHOUT touching menu_raw.json, so a glitched feed can never wipe
the published menu.

Canonicalized output (stable sort, sorted keys, variant quantity flattened to
0/1 -- downstream only ever tests quantity>0) means the file only changes when
something menu-visible changed: the auto-refresh workflow therefore only
commits real changes, not stock-count jitter.
"""
import json, sys, time, urllib.request

LOC = 'bcb66b17-88c8-4139-a6d4-f8dd8099521e'
URL = f'https://order.api.weaveiq.com/{LOC}/search/variant'
OUT = 'data/menu_raw.json'
MIN_ROWS = 400   # live feed carries ~770 rows; a partial feed must never overwrite good data
MIN_LIVE = 150   # products with at least one visible, in-stock, priced variant


def pull():
    last = None
    for i in range(3):
        try:
            req = urllib.request.Request(URL, headers={'Accept': 'application/json',
                                                       'User-Agent': 'terps-menu-refresh'})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(5 * (i + 1))
    sys.exit(f'FAIL-CLOSED: feed pull failed after 3 attempts: {last}')

d = pull()
rows = d.get('results') or []
if len(rows) < MIN_ROWS:
    sys.exit(f'FAIL-CLOSED: feed returned {len(rows)} rows (<{MIN_ROWS}) -- refusing to overwrite')
bad = sum(1 for r in rows if not r.get('id') or not (r.get('name') or '').strip())
if bad:
    sys.exit(f'FAIL-CLOSED: {bad} rows missing id/name')

live = 0
for r in rows:
    for v in (r.get('variants') or []):
        v['quantity'] = 1 if (v.get('quantity') or 0) > 0 else 0  # de-jitter: only in/out of stock matters
    if any(v['quantity'] and not v.get('hidden_from_menu') and (v.get('price') or 0) >= 50
           for v in (r.get('variants') or [])):
        live += 1
if live < MIN_LIVE:
    sys.exit(f'FAIL-CLOSED: only {live} live products (<{MIN_LIVE})')

rows.sort(key=lambda r: (r['id'], r.get('slug') or ''))
out = {'brands': d.get('brands'), 'categories': d.get('categories'),
       'hits': d.get('hits'), 'results': rows}
json.dump(out, open(OUT, 'w'), indent=1, sort_keys=True)
print(f'feed OK: {len(rows)} rows, {live} live products -> {OUT}')
