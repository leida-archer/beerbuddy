# BeerBuddy Ingestion Methods — Playbook

**Purpose.** When BeerBuddy expands beyond Nevada County, every new chain
needs a price-data source. This document is the **decision tree** for
which method to try first, what it costs, and where to stop. The Zero
User Labor principle in [`DESIGN.md`](../DESIGN.md) is the floor: we
**never** ask a customer to enter or correct prices. Customers can and
do lie; their data is unverifiable; their incentives are misaligned
with a price-comparison app. Every method below sits *above* that
floor.

The hierarchy is roughly: structured JSON > rendered HTML > human-in-the-loop > customer data. Always try the highest tier that
matches the source before dropping down.

## Tier framework

| Tier | Method | Build cost | Run cost | Reliability | Per-store accuracy |
|------|--------|------------|----------|-------------|---------------------|
| 1 | **Structured JSON endpoint via plain fetch** | Low | <1s/run | Highest | High when store ID is on the wire |
| 2 | **Browser fingerprint + internal JSON** | Medium | <5s/run | High while fingerprint holds | High |
| 3 | **Playwright DOM scrape on first-party site** | Medium | 10-30s/run | Medium — selector drift | High |
| 4 | **Playwright DOM scrape on third-party aggregator (Instacart, etc.)** | Medium | 15-45s/run | Medium — chain layout changes | High (delivery-zone-tied) |
| 5 | **PDF / image weekly circular → LLM extract (omitted as of 2026-05-10)** | Med-High | 30s + LLM tokens | Med-Low — OCR/layout drift | High |
| 6 | **`manual_parse_queue` → admin form** | Low | Human minutes/week | Highest (human-checked) | High |
| ✗ | **Bot-shielded retailer (PerimeterX / Akamai / DataDome)** | High one-time + perpetual maintenance | Stealth tooling + cookie warmup | Low — adversarial cat-and-mouse | High when working |
| ✗ | **Customer-submitted prices** | — | — | — | **Disallowed by product principle. Never implement.** |

Sub-rules:

- **Always probe Tier 1 first.** Open DevTools → Network on the live site, search for `application/json` responses while browsing the alcohol section. If the SPA fetches its own product list as JSON, that's your endpoint.
- **Tiers 1-4 must be store-aware** when the chain has multi-store inventory. A scraper that returns "Walmart's national catalog" is useless — we need *Walmart Grass Valley's* prices.
- **Tier 6 is the firewall, not the path of least resistance.** If a chain can only be served via the parse queue, the admin pays human time every week. Use it only when no machine path exists.
- **All Tier 3-4 adapters need a Fallback to the previous fixture** when extraction returns 0 — see `scripts/build-fixtures.ts` for the pattern. A silent-fail (bot block, hydration timeout) should not delete a chain from the live deal list.

## Cross-cutting techniques

These apply across multiple tiers:

### Next.js `_next/data` discovery (Tier 1 enabler)
Sites built with Next.js commonly expose their per-page server data at:
```
https://<host>/_next/data/<buildId>/<path>.json
```
The `buildId` is in the HTML at `<script id="__NEXT_DATA__">` or in the
`/_next/static/<buildId>/_buildManifest.js` path. Once you have it, you
can fetch any page's JSON props directly. Used by the Raley's adapter.
**Brittleness:** `buildId` rotates on each deploy. Refresh it at run
start. Don't cache across runs.

### Instacart storefront shape (Tier 4 enabler)
Many regional grocers (Save Mart, Grocery Outlet, Sprouts, etc.) sell
through Instacart's white-label storefront at:
```
https://shop.<chain>.com/store/<chain>/collections/n-<category>-<id>
```
Cards render as `<a href="/store/<chain>/products/<id>-<slug>">` with
inner text `Current price: $X.YY$XYY...<Product Name><Pack info>`. The
same Playwright extraction template applies to every Instacart-backed
chain — `src/lib/ingest/adapters/grocery-outlet/extract.ts` is a
reference implementation that mostly differs only in the category
slug and store-id constants.

### Headless bot-flag mitigation
- Set a realistic UA: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36`
- `chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] })`
- Bound every Playwright operation with a deadline (`setDefaultTimeout` + `Promise.race` on `browser.close()` to handle hung pages)
- `waitUntil: "domcontentloaded"` then a fixed hydration wait — `networkidle` hangs forever on sites with telemetry beacons

**These mitigations defeat naive UA-string detection. They do NOT defeat fingerprint-based shields (PerimeterX, DataDome, Akamai Bot Manager).** If you hit a `Robot or human?` press-and-hold challenge or a `/blocked?...` redirect, stop adapting the request and skip to the next tier — fingerprint shields require stealth-Playwright patches and active maintenance that is out of scope for a hobby data pipeline. See the Walmart 2026-05-17 decision log entry.

### Per-store identity
A chain with multiple stores often serves *different* prices per location. Always verify which store the adapter is hitting:
- Instacart storefronts: store identity is in the URL (`/store/<chain-store-slug>/`)
- Next.js commerce sites: a `storeId` is usually in a cookie or request body
- The active-store indicator on the page UI is the ground truth — capture it during discovery and assert against it in the adapter

## Per-chain inventory (as of 2026-05-17)

| Chain | Tier | Surface | Status |
|-------|------|---------|--------|
| Raley's | 1 | `_next/data/<buildId>/...` JSON | ✅ Production |
| Save Mart | 4 | `shop.savemart.com` (Instacart) | ✅ Production |
| Holiday Market | 3 | Penn Valley first-party site | ✅ Production |
| BevMo | 3 | `bevmo.com/pages/beer` | ✅ Production |
| Grocery Outlet | 4 | `shop.groceryoutlet.com` (Instacart) | ✅ Production (refreshed 2026-05-17; previously stale at 0) |
| ~~Walmart Lincoln NM #5979~~ | ✗ (dropped) | `walmart.com` SPA + PerimeterX bot shield | **DROPPED 2026-05-17** — see [docs/dropped-chains.md](./dropped-chains.md) |
| SPD Markets | 6 (admin) | No public alcohol surface — `ideal.sale/<storeId>` Grocery-only | ⏸ Admin parse-queue path; no adapter |

## Workflow: adding a new chain in a new region

1. **Inventory.** Does the chain operate stores in the new region? Capture each store's address, lat/lon, and chain-specific store ID.
2. **Web audit.** Visit the chain's site in a real browser logged in to the target region's ZIP. Note: home page, store finder, weekly ad page, online-shop entry point. Screenshot each.
3. **Verify alcohol is actually published.** Before adapter work, confirm the surface carries alcohol pricing. Some chains exclude beer/wine/spirits from public ad surfaces due to state liquor-advertising regulations (verified for SPD Markets via `ideal.sale` on 2026-05-17 — no alcohol category exists in their weekly ad). If alcohol is excluded, the only path is Tier 6 (admin parse queue) — no amount of adapter cleverness recovers data that isn't published.
4. **Tier probe.** In DevTools Network tab while browsing alcohol:
   - JSON responses fetched by the SPA → **Tier 1 or 2**
   - Server-rendered HTML with product cards → **Tier 3**
   - White-label storefront on Instacart / DoorDash / Caviar → **Tier 4**
   - PDF circular only → **Tier 6 (`manual_parse_queue`)** — Tier 5 was omitted 2026-05-10
5. **Smoke.** Build a `<chain>-smoke.ts` script that extracts ≥10 products with prices ≥ $1 and ≤ $200. If smoke passes, build the full adapter.
6. **Adapter contract.** Match `src/lib/ingest/contract.ts` — return `{ chainSku, brand, rawName, packCount, packUnitMl, priceCents, regularPriceCents }`. Pass the rest of the pipeline to existing alias resolution + persist helpers.
7. **Wire it in.** Add to `scripts/build-fixtures.ts` with sequential ordering (the parallel-Playwright bug from BevMo's history is a known regression). Add to the `counts` block. Add a `fallback` call to use the previous fixture on 0-extract.
8. **Document.** Append a per-chain entry to the inventory table above with the tier and surface chosen. Update `api-notes.md` in the adapter directory with the real findings (overwriting the TODO template).

## Decisions log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-10 | Tier 5 (LLM-parsed circulars) **omitted**; sources that would have used it route to `manual_parse_queue` (Tier 6) instead | Operational complexity, cost, and LLM trust boundary risk outweighed the benefit. Admin-paid human time is a cleaner failure mode than silent LLM hallucinations on price text. |
| 2026-05-16 | Customer-submitted prices added to playbook as the **disallowed floor** | Reinforces DESIGN.md Zero User Labor product principle. Documented here so future contributors don't propose it. |
| 2026-05-16 | Grocery Outlet stale-0 fixture diagnosed as previous-run bot-block masking by `fallback()` logic in `build-fixtures.ts` | Refresh via `bun run fixtures` re-populates. No adapter code change needed. The fallback behavior is correct (don't drop a chain on transient failure) but stale data can linger if no one re-runs the build. Suggests a CI job that runs `bun run fixtures` weekly. |
| 2026-05-17 | SPD Markets verified to have **no alcohol category** on its public weekly-ad surface (`spdiga.ideal.sale/30638` — Grass Valley; same for Nevada City store `30637`). Direct `spdmarket.com` still has invalid TLS cert. | The `ideal.sale` platform serves only the "Grocery" category for SPD. Body text contains zero matches for `beer\|wine\|ipa\|lager\|ale\|liquor\|spirits\|alcohol`. Likely a California liquor-advertising-regulation policy or platform-level choice. SPD beer prices cannot be obtained via web scraping. Only viable path: Tier 6 (admin manual_parse_queue, weekly in-store photo capture). Added Workflow step 3 ("Verify alcohol is actually published") to prevent future adapter work being started before this check. |
| 2026-05-17 | "Walmart Grass Valley" premise corrected: **no Walmart exists in Grass Valley**. Closest is Walmart Neighborhood Market #5979 in Lincoln, CA — 26.5 mi from 95945. Adapter dir renamed `walmart-gv/` → `walmart-lincoln/`. | The original README chain list was built from web-audit findings that didn't verify Walmart's actual store locations near 95945. Lincoln NM #5979 was selected as the closest viable proxy. |
| 2026-05-17 | **Walmart adapter DROPPED** from the chain list. PerimeterX shield blocks even fresh isolated browser contexts with empty cookies — fingerprint-level detection, not session-based. Walmart is also outside the 25 mi radius (Lincoln NM #5979 at 26.5 mi). Drop recorded in `docs/dropped-chains.md`; full discovery findings migrated there from the removed `walmart-lincoln/api-notes.md`. | Engineering cost (stealth-patched Playwright + ongoing maintenance vs. PX rotation, OR manual cookie warmup vs. weekly drives, OR paid proxy rotation) is disproportionate to the marginal coverage gain from one borderline-distance store. Decision reversible if BeerBuddy expands to regions where Walmart is the dominant grocer. Added the "Bot-shielded retailer" entry to the tier framework as an explicit infeasibility marker. README + DESIGN.md + page.tsx + adapters README updated to remove Walmart from the chain list ("seven chains" → "six chains"); docs/design.md updated with a callout in its Updates section. |
| 2026-05-17 | **`build-fixtures.ts` sequencing bug** identified: Grocery Outlet's Playwright extraction silently returns 0 when run last in the sequential chain pipeline (after Raley's + BevMo + Holiday + Save Mart), even though the standalone smoke (`scripts/grocery-outlet-smoke.ts`) returns 86 products in 15 sec. Same class of bug the existing build-fixtures comment warns about for BevMo when chains run in parallel. | Workaround landed: `scripts/refresh-grocery-outlet.ts` patches GO rows into the fixture in isolation — call after a full `bun run fixtures` to repair the GO count. **Proper fix (deferred):** restructure `build-fixtures.ts` to run each chain in a fresh `bun` subprocess, OR reorder so GO runs first, OR force a chromium process cleanup + delay between chains. The "first chain wins" pattern suggests a leaked file handle / port / shared chromium resource in Playwright's launcher when multiple `chromium.launch()` calls happen in one Node process. |
