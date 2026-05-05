# Holiday Market — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Address:** 11324 Pleasant Valley Rd, Penn Valley, CA 95946
**Owner:** North State Grocery Inc.

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Two web surfaces:
  - `holiday-market.com/weekly-ad/` — likely static weekly-ad page
  - `shopholidaymarket.com` — full e-commerce shop with explicit BEER department
  - `shopholidaymarket.com/departments/from-our-weekly-ads` — weekly-ad subset
- Direct fetch of shopholidaymarket.com returned empty body → SPA, Playwright likely
- Holiday-market.com weekly-ad page may be SSR (untested) — cheaper if so
- Probably Toast for deli ordering — not relevant to beer

## Day-1 DevTools discovery (fill in)

### 1. Static weekly-ad check (holiday-market.com)
Visit `holiday-market.com/weekly-ad/`. Then `curl -A "Mozilla/5.0..."` it:

- [ ] Direct fetch returns rendered content? ___
- [ ] Beer/alcohol section in the ad? ___
- [ ] PDF download link? ___

### 2. shopholidaymarket.com investigation
DevTools on the BEER department page:

- [ ] JSON endpoint serving products: ___
- [ ] Endpoint requires auth? ___
- [ ] Pagination: ___
- [ ] Per-store pricing — does it know "Penn Valley" specifically? ___

### 3. Anti-bot signals
- [ ] Direct curl on either domain works? ___

## Decision

- [ ] **Path forward:** holiday-market.com SSR scrape / shopholidaymarket Playwright / hybrid
- [ ] **Notes:** ___

## Adapter status

Adapter file: `index.ts` (Week 4)
Test fixtures: `__fixtures__/` (Week 4)
