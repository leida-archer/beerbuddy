# Save Mart — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Address:** 735 Zion St, Nevada City, CA 95959

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Primary sites:
  - `savemart.com/flyers/{store_id}` — weekly ad page
  - `shop.savemart.com/store/savemart/collections/rc-weekly-ad` — e-commerce front
- Direct fetch of `shop.savemart.com` returned an empty body → SPA. URL pattern (`collections/rc-weekly-ad`) suggests Shopify-ish architecture
- Third-party ad-aggregator sites mirror the weekly ad (TheWeeklyAd, MyWeeklyAds, LadySavings, HotCouponWorld, OfferMate) — useful as cross-validation, not as a primary source
- Likely paths: (a) Shopify Storefront API endpoint discovery, (b) the static weekly-ad PDF if one exists at `savemart.com/flyers/...`, (c) Playwright fallback

## Day-1 DevTools discovery (fill in)

### 1. Find the Nevada City store ID
Visit savemart.com/stores/, look up Nevada City, capture store ID for the URL path. ___

### 2. JSON / GraphQL endpoints found
Open Network tab, filter XHR/Fetch on shop.savemart.com:

- [ ] Endpoint URL: ___
- [ ] Shopify Storefront API? (look for `/api/...` or `*.myshopify.com`): ___
- [ ] Headers (storefront access token, etc.): ___
- [ ] Request/response shape: ___

### 3. Static weekly-ad PDF check
- [ ] Does `savemart.com/flyers/{store_id}` link to a downloadable PDF? ___
- [ ] PDF URL pattern: ___

### 4. Anti-bot signals
- [ ] Direct `curl` works? ___
- [ ] Rate limits? ___

## Decision

- [ ] **Path forward:** Shopify API / PDF + Haiku / Playwright
- [ ] **Notes:** ___

## Adapter status

Adapter file: `index.ts` (Week 2)
Test fixtures: `__fixtures__/` (Week 2)
