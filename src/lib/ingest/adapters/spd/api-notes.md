# SPD Markets — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Addresses:** Two stores — 129 W McKnight Way (Grass Valley) + Nevada City + Penn Valley
**Affiliated with:** IGA (Independent Grocers Alliance)

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Direct site: `spdmarket.com` (specials page at `/specials.html`)
- IGA-hosted weekly ad: `spd.iga.com/WeeklyAd/Index/`
- IGA pages tend to be traditional server-rendered (PHP/IGA platform), so likely the **easiest scrape target** of the seven chains
- No anti-bot expected — small-chain IGA site

## Day-1 DevTools discovery (fill in)

### 1. spd.iga.com/WeeklyAd
- [ ] Fetch returns server-rendered HTML with product data? ___
- [ ] Per-store filter (Grass Valley vs Penn Valley vs Nevada City)? ___
- [ ] Beer category present? ___

### 2. spdmarket.com/specials.html
- [ ] Same content as IGA page or different? ___
- [ ] PDF link? ___

### 3. Cross-verification
Compare a known sale (e.g., a featured beer this week) on both URLs to make sure they match.

## Decision

- [ ] **Path forward:** Plain `fetch` + cheerio (most likely) / Playwright (unlikely)
- [ ] **Notes:** ___

## Adapter status

Adapter file: `index.ts` (Week 4)
Test fixtures: `__fixtures__/` (Week 4)
