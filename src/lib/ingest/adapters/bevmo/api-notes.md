# BevMo! Auburn — API discovery notes

**Status:** DONE (Shopify catalog path verified 2026-05-05, implemented in `index.ts`)
**Address:** 2745 Bell Rd, Auburn, CA 95603
**Store ID used in code:** `bevmo-auburn`

## Pre-audit hypothesis (superseded)

The original /design-consultation web audit (2026-05-04) read BevMo as a
custom SPA with prices loaded client-side, and suggested a hybrid
`fetch + cheerio` + Playwright approach. That was wrong — see
"Discovery" below.

## Discovery (2026-05-05)

BevMo runs on Shopify. The standard Shopify storefront API is open:

- `https://www.bevmo.com/products.json?limit=250&page=N`
- Returns paginated product JSON with `variants[].price`, `compare_at_price`, and `product_type` fields.
- `product_type` is the chain's beer/wine/spirits classifier — we filter on `/\bBeer\b/i`.
- Pack info (count + volume) is parsed from the title because Shopify's standard schema doesn't have these as structured fields. See `parse.ts` → `parsePackInfo`.

Robots.txt allows `/products.json`. BevMo's TOS prohibits "automated purchase
agents" — that doesn't cover scraping for price comparison (no cart, no
checkout).

## Per-store pricing caveat

`/products.json` returns the catalog's default price, not the Auburn-specific
price. For the seven chains we ingest, BevMo's "Auburn" pricing is identical
to its national catalog within the region (verified spot-check 2026-05-05).
If that ever changes, we'd need to add a store-selector header / cookie
preflight before fetching the catalog; documenting here so future-us doesn't
relearn this.

## Adapter file

- `index.ts` — the `Adapter` implementation, alias-resolved via `upsertAliasAndCanonicalProduct`.
- `catalog.ts` — pagination + filter logic over `/products.json`.
- `parse.ts` — Shopify product → `BevmoProduct` (also home of `parsePackInfo` which Save Mart / Holiday Market / Grocery Outlet adapters reuse).
- `extract.ts` — Playwright fallback. Unused under normal operation; kept as
  a backstop if Shopify ever rearranges its JSON.

## Why the `bevmo-auburn/` directory used to exist

Earlier scaffolding split the BevMo work into `bevmo/` (generic Shopify code)
and `bevmo-auburn/` (per-store config). Once it was clear that Auburn is the
only BevMo we ingest, that split added more confusion than value. Consolidated
into `bevmo/` on 2026-05-10; the per-store stub directory has been deleted.
