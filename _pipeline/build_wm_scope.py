#!/usr/bin/env python3
"""build_wm_scope.py -- generate data/wm_scope_allowlist.json (WM-mirror launch scope).

LAUNCH DIRECTIVE (Evan, 2026-07-02): the shop site must show ONLY products that
are live on the store's Weedmaps menu ("Mirror WM exactly"). This script turns
the WM parity harness's matching into a committed, re-runnable allowlist that
build_catalog.py enforces behind the "enabled" flag in the output file.

REVERSIBILITY: this generator only WRITES the allowlist. To restore the full
menu, set "enabled": false in data/wm_scope_allowlist.json (or delete the
file) and rebuild (cd _pipeline && python3 build_catalog.py && python3
build_site.py). Nothing else is touched: photos, prices and descriptions for
hidden products stay committed and come back exactly as they were.

MATCHING IS NOT REINVENTED: this imports parity_harness.py (the gate row 11
harness, which itself reuses repos/terps-pricematcher normalization) and
replays its exact match pipeline -- aliases -> match_item -> uncorroborated
demotion probe -> liveness split -> shop->WM set-diff. It then FAILS CLOSED
(exit 1, writes nothing) unless every number and every example string agrees
with the published parity summary for the same snapshot:
  * matched_live / tiers / exceptions / failures equal the summary,
  * the excluded set size equals d_setdiff.live_shop_products_absent_from_wm,
  * duplicate-listing count equals the summary,
  * the summary's live_shop_absent_examples (first 40) equal ours verbatim,
  * input file hashes equal the summary's recorded hashes (same evidence),
  * allowed + excluded partition the live-in-catalog product set exactly.

This is an OPERATOR tool (needs the AI Native workspace: WM snapshot, feed
snapshot, harness, pricematcher). CI never runs it; CI only consumes the
committed allowlist via build_catalog.py.

USAGE (defaults find the newest snapshot in the AI Native workspace):
  python3 build_wm_scope.py
  python3 build_wm_scope.py --ai-root "/Users/smith/Claude/Projects/AI Native"
"""
from __future__ import annotations
import argparse, datetime, hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
AI_ROOT_CANDIDATES = [
    "/sessions/lucid-practical-newton/mnt/AI Native",
    "/Users/smith/Claude/Projects/AI Native",
]

def sha16(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]

def newest(dirpath, pat):
    cands = sorted(f for f in os.listdir(dirpath) if re.match(pat, f))
    if not cands:
        sys.exit("FAIL-CLOSED: no %s in %s" % (pat, dirpath))
    return os.path.join(dirpath, cands[-1])

def main():
    ap = argparse.ArgumentParser(description="WM-mirror scope allowlist generator")
    ap.add_argument("--ai-root", default=next((r for r in AI_ROOT_CANDIDATES
                                               if os.path.isdir(r)), None))
    ap.add_argument("--wm"); ap.add_argument("--feed"); ap.add_argument("--catalog")
    ap.add_argument("--aliases"); ap.add_argument("--summary")
    ap.add_argument("--harness-dir"); ap.add_argument("--pm-src")
    ap.add_argument("--out", default=os.path.join(HERE, "data", "wm_scope_allowlist.json"))
    args = ap.parse_args()
    if not args.ai_root:
        sys.exit("FAIL-CLOSED: no AI Native root found; pass --ai-root")
    wmp = os.path.join(args.ai_root, "website-storefront", "wm_parity")
    hdir = args.harness_dir or wmp
    wm_path = args.wm or newest(wmp, r"wm_menu_.*\.json$")
    feed_path = args.feed or newest(wmp, r"weave_feed_.*\.json$")
    cat_path = args.catalog or os.path.join(args.ai_root, "website-storefront",
                                            "site", "data", "catalog.json")
    ali_path = args.aliases or os.path.join(wmp, "aliases.json")
    sum_path = args.summary or newest(wmp, r"parity_summary_.*\.json$")
    pm_src = args.pm_src or os.path.join(args.ai_root, "repos",
                                         "terps-pricematcher", "src")

    sys.path.insert(0, hdir)
    import parity_harness as PH  # reuse, do not reinvent (fails closed if absent)

    pm = PH.load_pricematcher(pm_src)   # exits 2 if pricematcher unavailable
    nrm = PH.Norm(pm)
    wm_items = PH.jload(wm_path)
    catalog = PH.jload(cat_path)
    feed_obj = PH.jload(feed_path)
    summary = PH.jload(sum_path)

    # ---- prove we run on the summary's exact evidence (fail closed) ------
    diffs = []
    def expect(label, got, want):
        if got != want:
            diffs.append("%s: got %r, summary says %r" % (label, got, want))
    expect("wm snapshot sha16", sha16(wm_path), summary["inputs"]["wm_snapshot"]["sha256_16"])
    expect("catalog sha16", sha16(cat_path), summary["inputs"]["catalog"]["sha256_16"])

    # ---- replicate parity_harness.main() liveness index (verbatim logic) --
    rows = PH.feed_rows(feed_obj)
    live_by_id = {}
    for r in rows:
        pid = r.get("id")
        ent = live_by_id.setdefault(pid, {"live": False, "prices": [], "variants": [],
                                          "name": r.get("name"),
                                          "brand": (r.get("vendor") or {}).get("name")})
        for v in r.get("variants") or []:
            lv = PH.variant_live(v)
            ent["variants"].append({"name": v.get("name"), "live": lv,
                                    "price": round((v.get("price") or 0) / 100.0, 2),
                                    "qty": v.get("quantity", 0)})
            if lv:
                ent["live"] = True
                ent["prices"].append(round(v["price"] / 100.0, 2))
    expect("feed rows", len(rows), summary["inputs"]["feed"]["rows"])
    expect("feed products", len(live_by_id), summary["inputs"]["feed"]["products"])
    expect("feed live products", sum(1 for v in live_by_id.values() if v["live"]),
           summary["inputs"]["feed"]["live_products"])

    probe = PH.FeedProbe(rows, live_by_id, nrm)
    idx = PH.CatalogIndex(catalog, live_by_id, nrm)
    aliases = {}
    if os.path.exists(ali_path):
        aliases = {str(k): v for k, v in PH.jload(ali_path).items()}
    rec_by_pid = {rec["p"]["id"]: rec for rec in idx.products}

    # ---- replicate the match loop (aliases -> match -> demotion) ---------
    matched, unmatched = [], []
    for it in sorted(wm_items, key=lambda i: (i.get("name") or "", i.get("id") or 0)):
        al = aliases.get(str(it.get("id")))
        if al and al.get("catalog_id") in rec_by_pid:
            matched.append((it, {"tier": "MANUAL-ALIAS",
                                 "prod": rec_by_pid[al["catalog_id"]],
                                 "score": 1.0, "why": "alias"}))
            continue
        m = PH.match_item(it, idx, nrm)
        if m["tier"] in ("EXACT", "STRONG") and not m["corroborated"]:
            missing, _, _ = probe.probe(it.get("name") or "")
            if missing:
                m = dict(m, tier="NONE")
        if m["tier"] in ("EXACT", "STRONG"):
            matched.append((it, m))
        else:
            unmatched.append((it, m))

    # ---- replicate liveness split + exception classification -------------
    matched_final, n_exc, n_fail = [], 0, 0
    for it, m in matched:
        if m["prod"]["live"] is not True:
            n_exc += 1
        else:
            matched_final.append((it, m))
    for it, m in unmatched:
        name = it.get("name") or ""
        missing, best_row, best_live = probe.probe(name)
        if name.lower().startswith("silver lake"):
            n_exc += 1
        elif missing:
            n_exc += 1  # delisted-from-shop or not-in-shop-feed
        elif "|" in name and m["score"] > 0:
            n_exc += 1  # brand-prefix-unresolved
        elif (it.get("category") or {}).get("name") == "Gear":
            n_exc += 1
        else:
            n_fail += 1
    from collections import Counter
    tiers = dict(Counter(m["tier"] for _, m in matched_final))
    expect("matched_live", len(matched_final), summary["a_match"]["matched_live"])
    expect("tiers", tiers, summary["a_match"]["tiers"])
    expect("explained_exceptions", n_exc, summary["a_match"]["explained_exceptions"])
    expect("unexplained_FAIL", n_fail, summary["a_match"]["unexplained_FAIL"])

    # ---- replicate d_setdiff shop -> WM ----------------------------------
    matched_pids = {m["prod"]["p"]["id"] for _, m in matched_final}
    matched_keys = set()
    for _, m in matched_final:
        p = m["prod"]["p"]
        matched_keys.add(nrm.key((p.get("brand") or "") + (p.get("name") or "")))
    shop_absent, shop_dupe = [], []
    n_live_in_catalog = 0
    for rec in idx.products:
        if rec["live"]:
            n_live_in_catalog += 1
        if rec["live"] and rec["p"]["id"] not in matched_pids:
            p = rec["p"]
            k = nrm.key((p.get("brand") or "") + (p.get("name") or ""))
            (shop_dupe if k in matched_keys else shop_absent).append(p)
    shop_absent.sort(key=lambda p: (p["category"], p["name"]))
    expect("excluded (shop-only) count", len(shop_absent),
           summary["d_setdiff"]["live_shop_products_absent_from_wm"])
    expect("duplicate-listings count", len(shop_dupe),
           summary["d_setdiff"]["live_shop_duplicate_listings_of_matched"])
    ex_strings = ["%s (%s, %s)" % (p["name"], p.get("brand"), p["category"])
                  for p in shop_absent[:40]]
    expect("first-40 excluded examples", ex_strings,
           summary["d_setdiff"]["live_shop_absent_examples"])

    # ---- partition sanity -------------------------------------------------
    allowed_ids = sorted(matched_pids | {p["id"] for p in shop_dupe})
    excluded_ids = sorted(p["id"] for p in shop_absent)
    if set(allowed_ids) & set(excluded_ids):
        diffs.append("allowed and excluded overlap: %r"
                     % sorted(set(allowed_ids) & set(excluded_ids)))
    expect("allowed+excluded == live-in-catalog",
           len(allowed_ids) + len(excluded_ids), n_live_in_catalog)

    if diffs:
        print("FAIL-CLOSED: scope does NOT reproduce the parity report; "
              "wrote nothing. Diffs:")
        for d in diffs:
            print("  * " + d)
        sys.exit(1)

    out = {
        "_readme": ("WM-mirror launch scope (Evan directive 2026-07-02). "
                    "build_catalog.py drops any product whose id is not in "
                    "allowed_ids when enabled=true. REVERSAL: set enabled=false "
                    "(or delete this file) and rebuild -- full menu returns. "
                    "Regenerate against a fresh WM snapshot with "
                    "_pipeline/build_wm_scope.py (operator tool)."),
        "enabled": True,
        "snapshot_date": summary["date"],
        "generated_utc": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inputs": {
            "wm_snapshot": {"file": os.path.basename(wm_path), "sha256_16": sha16(wm_path),
                            "items": len(wm_items)},
            "feed_snapshot": {"file": os.path.basename(feed_path), "sha256_16": sha16(feed_path)},
            "catalog": {"file": os.path.basename(cat_path), "sha256_16": sha16(cat_path),
                        "products": len(catalog)},
            "parity_summary": {"file": os.path.basename(sum_path), "sha256_16": sha16(sum_path)},
            "aliases": {"file": os.path.basename(ali_path), "sha256_16": sha16(ali_path)},
        },
        "counts": {
            "wm_items": len(wm_items),
            "wm_matched_live_shop": len(matched_final),
            "live_shop_products_in_catalog": n_live_in_catalog,
            "allowed": len(allowed_ids),
            "excluded_shop_only": len(excluded_ids),
            "duplicate_listings_kept": len(shop_dupe),
        },
        "allowed_ids": allowed_ids,
        "excluded": [{"id": p["id"], "name": p["name"], "brand": p.get("brand"),
                      "category": p["category"], "subcategory": p.get("subcategory"),
                      "price_min": p.get("price_min"), "price_max": p.get("price_max"),
                      "unit": p.get("unit")} for p in shop_absent],
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1)
    print("ALL ASSERTS PASS vs %s" % os.path.basename(sum_path))
    print("live-in-catalog=%d allowed=%d excluded=%d dupes-kept=%d"
          % (n_live_in_catalog, len(allowed_ids), len(excluded_ids), len(shop_dupe)))
    print("wrote: %s" % args.out)

if __name__ == "__main__":
    main()
