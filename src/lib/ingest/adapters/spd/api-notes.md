# SPD Markets — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Addresses:** Two stores — 129 W McKnight Way (Grass Valley) + Nevada City + Penn Valley
**Affiliated with:** IGA (Independent Grocers Alliance)

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Direct site: `spdmarket.com` (specials page at `/specials.html`)
- IGA-hosted weekly ad: `spd.iga.com/WeeklyAd/Index/`
- IGA pages tend to be traditional server-rendered (PHP/IGA platform), so likely the **easiest scrape target** of the seven chains
- No anti-bot expected — small-chain IGA site

## Day-1 web discovery (2026-05-05) — partial findings

Both endpoints failed via WebFetch (server-side fetch with strict TLS):

- `spd.iga.com/WeeklyAd/Index/` returned **403 Forbidden**. Likely IGA platform / Cloudflare bot detection.
- `spdmarket.com/specials.html` returned **certificate has expired**. SPD's HTTPS cert is broken at the time of this audit. This is a real operational issue on their side, but it also signals a less actively maintained tech stack — typically correlates with simpler scrape feasibility once accessed normally via a real browser (which may bypass the cert error or simply ignore it).

Implication: web-based discovery from outside a browser is inconclusive for SPD. The path forward needs in-browser verification.

### In-browser tasks (developer at laptop)

### 1. spd.iga.com/WeeklyAd
- [ ] Open in Chrome — does it load when accessed normally? (Browsers send different headers than server-side fetchers.) ___
- [ ] Fetch returns server-rendered HTML with product data when scraped via Playwright with realistic User-Agent? ___
- [ ] Per-store filter (Grass Valley vs Penn Valley vs Nevada City)? ___
- [ ] Beer category present? ___

### 2. spdmarket.com/specials.html
- [ ] Does Chrome show a security warning for the expired cert, or has it been renewed since the audit? ___
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
