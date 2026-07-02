# Terps Dispensary — Storefront

A standalone, SEO-first, **live** cannabis storefront for terpsdispensary.com.
Powered by the live Weave POS menu, enriched with Terps' own Weedmaps product photography.

**Live:** https://terpsdispensary.com/
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
                     #   flower priced /g, implausible flower THC suppressed), matches WM photos
download_images.py   # downloads + optimizes matched Weedmaps photos -> site/img/products/<id>.jpg
build_site.py        # generates index/menu/290 product pages + sitemap into site/
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
- Flower is priced **per gram** in the POS → displayed as `$/g`. Prerolls/edibles/concentrates per item.
- Photos matched by name+brand with a category gate (never shows a wrong-category photo; 263/290 have real photos, rest get a branded droplet placeholder).

## Going live on the domain
The site is served on the apex domain:
1. The repo `CNAME` file contains `terpsdispensary.com`.
2. In domain DNS: point the apex (`@`) A/ALIAS records at GitHub Pages, keeping Google Workspace MX records intact.
3. GitHub repo → Settings → Pages → custom domain = `terpsdispensary.com`.
