# Walmart Grass Valley — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Address:** Walmart Grass Valley (specific street address TBD via store finder)

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Walmart's site (`walmart.com`) is a SPA but the underlying internal API is well-documented in the scraping community
- Per-store pricing requires a store ID; Walmart returns store-aware results when the right header/cookie is set
- API discovery is the **preferred path** — scraping the rendered SPA is much harder than calling the JSON endpoints directly
- Walmart has aggressive bot detection on `/products/` and `/search/` pages; less aggressive on internal APIs called by their own SPA when fingerprinted reasonably

## Day-1 DevTools discovery (fill in)

### 1. Find the Grass Valley Walmart store ID
Visit `walmart.com/store/finder`, search 95945, capture:

- [ ] Store ID: ___
- [ ] Store-specific URL pattern (e.g., `walmart.com/store/{id}/...`): ___

### 2. JSON endpoints for product browse
DevTools Network tab while browsing the alcohol section:

- [ ] Endpoint URL pattern: ___
- [ ] Required headers (especially a store-specific cookie or header): ___
- [ ] Response includes price + name + UPC + pack size? ___

### 3. Anti-bot defenses
- [ ] PerimeterX / Akamai signals in headers? ___
- [ ] User-Agent restrictions? ___

## Decision

- [ ] **Path forward:** Internal-API direct fetch / Playwright with fingerprint
- [ ] **Notes:** ___

## Adapter status

Adapter file: `index.ts` (Week 4)
Test fixtures: `__fixtures__/` (Week 4)
