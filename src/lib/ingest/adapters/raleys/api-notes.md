# Raley's — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Store ID for Grass Valley:** 213 (per `raleys.com/store/213`)
**Address:** 692 Freeman Ln, Grass Valley, CA 95949

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Primary site: `raleys.com/stores/raleys-freeman-grass-valley-california/` and `raleys.com/store/213`
- Direct fetch of the store page returned an empty body → SPA, client-rendered
- Online ordering exists, prices visible in the e-commerce flow
- Available via Instacart (`instacart.com/retailer/raleys-delivery/ca/...`) — Instacart is also a SPA but exposes per-store pricing
- Available via DoorDash for "Raley's Beer, Wine & Spirits" — DoorDash returned 403 on direct fetch (Cloudflare anti-bot)
- Likely path forward: **Playwright** for the chain site, OR API discovery to find the GraphQL/REST endpoint that powers product browsing

## Day-1 DevTools discovery (fill in)

### 1. Browse the alcohol section
URL walked: ___
Time: ___

### 2. JSON / GraphQL endpoints found
Open Network tab, filter by XHR/Fetch, browse to a beer category. Capture:

- [ ] Endpoint URL: ___
- [ ] HTTP method: ___
- [ ] Required headers (auth, store ID, session): ___
- [ ] Request body shape: ___
- [ ] Response shape (does it include price, name, pack size, SKU?): ___
- [ ] Pagination mechanism: ___

### 3. Anti-bot signals
- [ ] Does plain `curl <endpoint>` work? ___
- [ ] Cloudflare challenge / `cf-ray` headers? ___
- [ ] User-Agent restrictions? ___
- [ ] Rate limit observed (requests per minute before block)? ___

### 4. Per-store awareness
Does the endpoint require a store ID parameter? Is the price returned store-specific or chain-uniform? ___

## Decision (fill in at end of Day 1)

- [ ] **Path forward:** API direct / Playwright / hybrid
- [ ] **Notes for adapter implementation:** ___

## Adapter implementation status

Adapter file: `index.ts` (not yet created — Week 1)
Test fixtures: `__fixtures__/` (not yet created — Week 1)
