# Raley's — API discovery notes

**Status:** PARTIAL (web-based discovery done 2026-05-05; in-browser DevTools still open)
**Store ID for Grass Valley:** 213 (per `raleys.com/store/213`)
**Address:** 692 Freeman Ln, Grass Valley, CA 95949

## Web-audit pre-findings (from /design-consultation, 2026-05-04)

- Primary site: `raleys.com/stores/raleys-freeman-grass-valley-california/` and `raleys.com/store/213`
- Direct fetch of the store page returned an empty body → SPA, client-rendered
- Online ordering exists, prices visible in the e-commerce flow
- Available via Instacart (`instacart.com/retailer/raleys-delivery/ca/...`) and DoorDash; both are also SPAs with anti-bot protection

## Day-1 web discovery (2026-05-05) — what's known so far

### robots.txt — what's allowed / disallowed

Fetched `https://raleys.com/robots.txt`:

```
User-agent: *
Disallow: /account
Disallow: /api
Disallow: /customer
Allow: /
Sitemap: https://www.raleys.com/sitemap.xml
```

**Implication:** `/api` is explicitly disallowed. We must NOT scrape the internal JSON API directly. The public-facing `/category/...` and `/product/...` URLs are allowed. Acting as a real browser via Playwright (which calls the API as a side-effect of rendering) is ethically distinct from hitting `/api` directly with curl.

### Sitemap structure — gold for enumeration

`raleys.com/sitemap.xml` is a sitemap index pointing to 5 child sitemaps:

- `sitemap/content-sitemap.xml`
- `sitemap/categories-sitemap.xml`
- `sitemap/products-sitemap.xml` ← **the one we use**
- `sitemap/collections-sitemap.xml`
- `sitemap/stores-sitemap.xml`

The products-sitemap is itself a meta-index pointing to 18 per-category sitemaps:

```
https://www.raleys.com/sitemap/products/PMC{N}/products-sitemap.xml
```

PMC18 = wine-beer-spirits. Contains ~400+ product URLs.

**Sample wine-beer-spirits product URLs (verified 2026-05-05):**

```
/product/10260018/bogle-chardonnay
/product/10261825/tito_s-handmade-vodka
/product/30500041/don-julio-don-julio-reposado-reposado-tequila
/product/10200449/coors-light-4-2-abv-30-pack
/product/10270244/hennessy-v-s-cognac
```

**URL pattern:** `/product/{numeric-id}/{slug}` — clean, stable, includes pack info in slug.

**Lastmod timestamps:** all products in PMC18 share the same lastmod (`2026-05-04T22:19:05Z`) — sitemap is bulk-updated, so we cannot use sitemap lastmod as a freshness signal for individual products. We have to fetch each one (or the category page) to detect price changes.

### Server-rendering check — confirmed SPA

Fetched `raleys.com/product/10200449/coors-light-4-2-abv-30-pack` directly: empty body, no product data, no JSON-LD. **The product detail page is fully client-rendered.** Same for `raleys.com/category/PMC147/beer` (the beer category browse).

### Instacart fallback

If Raley's primary path becomes too brittle, Instacart's per-store pricing is a sibling source. Instacart is also a SPA + Cloudflare. It's a delivery-aggregator adapter (deferred to Week 4+ per design doc), not a primary surface.

## Recommended adapter strategy (proposal — confirm during Week 1 build)

```
Strategy: Playwright + sitemap enumeration + category-page render

  STEP 1  Fetch sitemap/products/PMC18/products-sitemap.xml (plain fetch, allowed)
          → list of ~400 product URLs + slugs + numeric IDs

  STEP 2  Playwright session → set Grass Valley store (cookie/localStorage)
          → navigate to /category/PMC18/wine-beer-spirits (or PMC147 for
            beer specifically)
          → wait for product cards to render
          → scroll to trigger lazy loading until all products are visible
          → extract { numeric_id, name, price, pack_size, was_price }
            from rendered DOM using selectors

  STEP 3  Cross-reference STEP 1 sitemap (canonical URL list) against
          STEP 2 extracted set. Products in sitemap but missing from page
          render → quarantine_event (could be out-of-stock or rendering bug).

  STEP 4  Persist via persist.ts (price-change-event semantics, only
          write on actual price change).
```

**Estimated runtime per ingestion run:**
- Sitemap fetch: ~1s
- Playwright cold start: ~3s
- Page render + scroll-load all 400 products: ~15-25s
- DOM extraction + persist: ~2s

**Total:** ~25-30s per run. Daily orchestrator budget: well under GH Actions free-tier minutes.

## Day-1 in-browser DevTools tasks (still pending — needs developer)

These cannot be answered without an actual browser session at the laptop:

- [ ] Confirm Grass Valley store can be set via a setStore(213) cookie or query param
- [ ] Capture the cookie/localStorage shape after selecting Grass Valley as the store
- [ ] Identify the product-card CSS selectors on the rendered category page (class names tend to be hashed in Next.js builds; need to use stable structural selectors or aria-labels)
- [ ] Confirm whether scroll-to-load triggers cleanly in headless Chromium
- [ ] Verify pack size is present as structured text on the card (vs. only in the slug)

## Decision

- **Path forward:** Playwright + sitemap-enumerated category render
- **Why not pure API:** robots.txt disallow + ethical posture
- **Why not pure HTML:** confirmed SPA, plain fetch returns empty bodies

## Adapter status

Adapter file: `index.ts` (Week 1 — build during the next session)
Test fixtures: `__fixtures__/raleys-pmc18-2026-05-05.html` (capture once Playwright session works, freeze for unit tests)
