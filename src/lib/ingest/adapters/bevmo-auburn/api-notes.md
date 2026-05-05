# BevMo! Auburn — API discovery notes

**Status:** TODO (Day 1 of Week 1)
**Address:** 2745 Bell Rd, Auburn, CA 95603

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Primary site: `bevmo.com`
- Product URL pattern: `bevmo.com/products/{id}` (cleanest URL pattern of the seven chains)
- Direct fetch on a product page returned **static metadata yes (name, ABV, country, region, SKU, description) but the price is loaded client-side by JavaScript**
- Implication: a hybrid approach works — `fetch` + cheerio captures everything except the price; Playwright is needed only for the price + per-store availability
- Confirmed live prices: Sierra Nevada Pale Ale 24-pack = $21.99; Truly variety 12-pack = $15.99
- 170 stores nationwide, well-engineered SPA

## Day-1 DevTools discovery (fill in)

### 1. Find the Auburn store availability mechanism
Browse a product page while signed in to the Auburn store:

- [ ] How is store selection persisted (cookie, query param, header)? ___
- [ ] Endpoint that returns price + availability for the selected store: ___
- [ ] Request body / params: ___
- [ ] Response shape (does it include club price too?): ___

### 2. Catalog browse endpoint
For ingesting a full beer catalog (not just one product at a time):

- [ ] Endpoint URL: ___
- [ ] Pagination: ___
- [ ] Maximum page size: ___

### 3. URL enumeration strategy
With clean `/products/{id}` URLs, can we enumerate the beer catalog by:
- [ ] Sequential ID iteration? ___
- [ ] Sitemap.xml at `bevmo.com/sitemap.xml` or `bevmo.com/sitemap_products.xml`? ___
- [ ] Category page enumeration? ___

## Decision

- [ ] **Path forward:** Hybrid (static fetch + Playwright for price) / pure Playwright / API discovery if backend endpoint is found
- [ ] **Notes:** ___

## Adapter status

Adapter file: `index.ts` (Week 4)
Test fixtures: `__fixtures__/` (Week 4)
