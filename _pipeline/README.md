# Terps Dispensary — Storefront

A standalone, SEO-first, **live** cannabis storefront for terpsdispensary.com.
Powered by the live Weave POS menu, enriched with Terps' own Weedmaps product photography.

**Live (staging):** https://xevansmithx-del.github.io/terps-menu/
**Repo:** github.com/xevansmithx-del/terps-menu (GitHub Pages, `main` branch root)

---

## What it is

- **Homepage** (`index.html`) — hero, category tiles, top-shelf & value grids, why-us, visit/map, age gate.
- **Menu** (`menu.html`) — all 290 products; live search, category chips, brand/price/THC filters, sort. Client-hydrates prices/stock from the live Weave API on load.
- **290 product pages** (`product/<slug>.html`) — one per product, strain selector w/ per-strain potency, cart, `schema.org/Product` JSON-LD. **Statically generated = individually crawlable/indexable** (the key SEO edge over competitors' iframe menus).
- **Cart / Reserve for pickup** — localStorage cart → SMS handoff to the store (719-547-1850). Compliant: browse & reserve online, pay in store. (Weave has no public order-submit API; official online-order integration is the planned upgrade.)
- **SEO** — `sitemap.xml` (292 URLs), `robots.txt`, canonical + OG tags, `Store` + `Product` structured data.

## Data pipeline (re-runnable)

```
build_catalog.py     # live Weave feed -> data/catalog.json (290 products, strains grouped,
                     #   flower priced per 3.5g-eighth package, implausible flower THC suppressed), matches WM photos
download_images.py   # downloads + optimizes matched Weedmaps photos -> site/img/products/<id>.jpg
build_site.py        # generates index/menu/290 product pages + sitemap into the repo root (run from _pipeline/)
```

Source data in `data/`:
- `menu_raw.json` — live Weave `/search/variant` snapshot (767 variants → 290 products)
- `wm_items_pueblo.json` — 2,757 Weedmaps items harvested from admin (2,704 w/ photos)
- `catalog.json` — canonical catalog

### Refresh the menu (prices/products/photos)
```
cd website-storefront
python3 -c "import urllib.request,json; ..."   # re-pull menu_raw.json from Weave (see build note)
python3 build_catalog.py && python3 download_images.py && python3 build_site.py
cd /tmp/terps-menu-deploy && cp -R ".../site/." . && git add -A && git commit -m "refresh" && git push
```
(Prices also self-refresh live in the browser via the Weave API on every page load, so a rebuild is only needed for new products/photos.)

## Key facts
- Weave location UUID: `bcb66b17-88c8-4139-a6d4-f8dd8099521e`
- Live menu API (public, CORS-open): `https://order.api.weaveiq.com/<loc>/search/variant`
- Flower sells as **pre-packaged 3.5g eighths** (owner directive 2026-07-02 — never by the gram unless a product explicitly says otherwise). The Weave POS models loose bud as a per-gram unit price, so the displayed eighth package price = per-gram × 3.5 (applied in `build_catalog.py` and mirrored in `js/app.js` live hydration). Prerolls/edibles/concentrates stay per item; branded prepacks (`Eighth`/`Half` variants, Greendot `3.5g/7g/14g`) keep their real package price with a weight label.
- Photos matched by name+brand with a category gate (never shows a wrong-category photo; 263/290 have real photos, rest get a branded droplet placeholder).

## Going live on the domain (the remaining step — needs Evan)
Recommended, reversible, zero email/blog risk:
1. Add a `CNAME` file (`shop.terpsdispensary.com`) to the repo.
2. In Wix domain DNS: add `CNAME  shop → xevansmithx-del.github.io`.
3. GitHub repo → Settings → Pages → custom domain = `shop.terpsdispensary.com`.
4. Point the Wix homepage "MENU" nav at `https://shop.terpsdispensary.com`.

Alternative (bigger): replace the apex entirely — migrate the blog, preserve Google Workspace MX. Do with Evan present.

## Auto-refresh (2026-07-02)

The site keeps itself in lockstep with the Weave POS — no human step:

- `.github/workflows/refresh.yml` runs ~6am / noon / 6pm Mountain (and on
  manual dispatch): `refresh_menu.py` (fail-closed live-feed pull, canonicalized
  so only real menu changes produce diffs) → `build_catalog.py` →
  `sync_images.py` → `build_site.py` → `verify_site.py` → commit + Pages deploy
  only if something changed.
- **Photos**: `sync_images.py` prefers photos uploaded in the Weave POS itself
  (feed `images[].url`), falls back to the 2026-07 Weedmaps harvest for
  products with no Weave photo, else the branded placeholder. The store team
  uploads photos in Weave; they appear on the site at the next refresh.
- Between refreshes the browser still live-hydrates stock/visibility from the
  Weave API on every page load (menu.js/app.js), so OFF-menu and sold-out are
  near-instant; the rebuild handles new products, removals, prices, photos, SEO.
- `download_images.py` (one-shot WM harvest, stale `site/` path) is superseded
  by `sync_images.py` for ongoing use.
