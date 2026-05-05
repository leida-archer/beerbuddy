# Grocery Outlet — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Address:** Grass Valley, CA (specific store TBD)

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Primary site: `groceryoutlet.com`
- Weekly ad publishes every Wednesday, valid for 6 days — perfect cron cadence (run Wed evening)
- Multiple third-party mirrors confirm structured weekly-ad data exists (LadySavings, OfferMate, MyWeeklyAds, Kimbino, HotCouponWorld, BeFrugal, WeeklyAdPro, Wesselmans)
- Help center confirms users can view the ad online + via mobile app
- **Likely the primary LLM-parsed circular target for Week 3** (the design doc names this chain as proving the Haiku + Zod path)

## Day-1 DevTools discovery (fill in)

### 1. Find the Grass Valley store + weekly-ad URL
Visit `groceryoutlet.com/stores/`, locate Grass Valley, capture URLs:

- [ ] Store page URL: ___
- [ ] Weekly-ad URL for this store: ___
- [ ] Is the ad served as a PDF, an image, or HTML? ___

### 2. JSON endpoints
- [ ] Does the weekly-ad page fetch its data via XHR? ___
- [ ] Endpoint URL: ___

### 3. PDF availability (preferred for Haiku parsing)
- [ ] Direct PDF URL: ___
- [ ] PDF size: ___
- [ ] Number of pages with alcohol content: ___

### 4. Alt aggregator paths
- [ ] LadySavings `groceryoutlet-weekly-ad/` — usable as fallback?

## Decision

- [ ] **Path forward:** PDF + Haiku / HTML scrape / aggregator mirror
- [ ] **Notes:** ___

## Adapter status

Adapter file: `index.ts` (Week 3 — first LLM-parsed circular)
Test fixtures: `__fixtures__/` (Week 3)
