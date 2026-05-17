# SPD Markets — API discovery notes

**Status:** Discovery complete 2026-05-17. **Adapter routed to Tier 6 (admin manual_parse_queue) per product decision 2026-05-17. No automated adapter to build.**
**Stores:**
- SPD IGA Grass Valley — `ideal.sale/30638`
- SPD IGA Nevada City — `ideal.sale/30637`
- (Earlier api-notes mentioned a Penn Valley store; only Grass Valley + Nevada City surfaced on `spd.iga.com`. Penn Valley appears not to exist as an SPD/IGA location.)
**Affiliated with:** IGA (Independent Grocers Alliance)
**Weekly-ad platform:** Ideal™ at `spdiga.ideal.sale/<storeId>/browse`

## Discovery findings (2026-05-17)

### Surface accessibility

| URL | Result |
|-----|--------|
| `spd.iga.com/WeeklyAd/Index/` | ✅ Loads in real browser (Chrome DevTools MCP). 403 via WebFetch (Cloudflare) — gated to real browsers. Lists "Nevada City SPD IGA Ad" + "Grass Valley SPD IGA Ad" with redirects to `ideal.sale`. |
| `spdiga.ideal.sale/30638` (Grass Valley) | ✅ Loads. Hydrates fine. Renders weekly deals via Ideal™ platform. |
| `spdiga.ideal.sale/30637` (Nevada City) | ✅ Same platform. |
| `spdmarket.com/specials.html` (direct) | ❌ TLS cert error — `net::ERR_CERT_AUTHORITY_INVALID`. Site abandoned or misconfigured. |

### Critical product-level finding: no alcohol category

The Ideal™ weekly-ad surface for SPD Grass Valley exposes **only the "Grocery" category**. Visible deals on 2026-05-17:

- $.50 Off IGA Brand Frozen Garlic Bread
- $1.00 Off (2) Coca-Cola Brand 20 fl oz bottles
- $.50 Off Dove Chocolate Promises
- $1.50 Off Jolly Rancher Ropes/Gummies

Programmatic check: body text returns **zero matches** for `beer|wine|ipa|lager|ale|liquor|spirits|alcohol`.

Categories navigation has a single button: "Grocery". No "Beer & Wine", "Adult Beverages", or "Liquor" entry.

### Why no alcohol?

Most likely a California state regulation around online liquor advertising for small IGA platform participants, or a platform-level policy on `ideal.sale`. SPD almost certainly sells beer in-store — they're a full-service grocer — but does not publish those prices to any public web surface accessible to a scraper.

### Format issue (secondary)

Even setting aside the missing alcohol category, the Ideal™ surface format is **discount coupons** ("$1.00 off 2 bottles"), not absolute retail prices. BeerBuddy's data model wants `priceCents` + `regularPriceCents` per SKU — discount-only data is incompatible.

## Decision

**Routed to Tier 6: admin manual_parse_queue.** Per product decision 2026-05-17, SPD beer prices will be entered by the admin via the existing parse-queue workflow. Cadence: weekly (matches the SPD weekly ad refresh).

**What's NOT built today:**
- No `index.ts` adapter (nothing to automate)
- No `extract.ts` (no machine source)
- No entry in `scripts/build-fixtures.ts` (don't add SPD stores to STORES until admin data exists; an empty SPD chain would pollute the deal list with a phantom store and no deals)

**What's expected of the admin going forward:**
1. Walk SPD Grass Valley (or Nevada City) weekly, photograph beer end-cap signs
2. Enter prices via `/admin/parse-queue` (current pattern from 2026-05-10 cutover from LLM parsing)
3. Or, if a dedicated SPD-input form is built later, use that

**When to revisit:**
- If California regulations change and SPD publishes alcohol prices online
- If SPD migrates off the Ideal™ platform to a competitor that does include alcohol (Instacart, Mercato, etc.)
- If admin labor proves not sustainable — at that point, drop SPD from the chain list and update README/DESIGN.md

See `docs/ingestion-methods.md` Workflow step 3 — "Verify alcohol is actually published" — which was added 2026-05-17 specifically to prevent future regions repeating this discovery overhead on the same class of chain.
