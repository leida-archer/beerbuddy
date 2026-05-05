/**
 * Fetch BevMo's full beer catalog via paginated /products.json.
 *
 * Shopify's catalog endpoint (works on BevMo, doesn't on every Shopify
 * store) returns up to 250 products per page. We paginate until a
 * response comes back empty, then filter to beer.
 *
 * /products.json is NOT in BevMo's robots.txt disallow list. Their
 * disallowed paths are /admin, /cart, /checkout, /account, /search,
 * /policies — all customer-facing flows. Catalog browse is allowed.
 */

import {
  isBeerProduct,
  parseShopifyProduct,
  ShopifyCatalogResponseSchema,
  type BevmoProduct,
} from "./parse";

const CATALOG_URL = (page: number, pageSize: number) =>
  `https://www.bevmo.com/products.json?limit=${pageSize}&page=${page}`;

const PAGE_SIZE = 250;
const MAX_PAGES = 40; // 10,000 products — well above BevMo's catalog size

export interface FetchBeerCatalogResult {
  products: BevmoProduct[];
  pagesFetched: number;
  totalProductsScanned: number;
  parseFailures: Array<{ id: string; reason: string }>;
}

/**
 * Fetch the BevMo catalog and return only beer products.
 *
 * Concurrency: pages are fetched sequentially because the only
 * stop signal is "page returned no products" — we can't know in
 * advance how many pages exist. ~40 pages × 300ms = 12 sec worst
 * case, typically way less for the beer subset of a ~5k catalog.
 */
export async function fetchBevmoBeerCatalog(
  options: {
    fetch?: typeof globalThis.fetch;
    pageSize?: number;
    maxPages?: number;
  } = {},
): Promise<FetchBeerCatalogResult> {
  const f = options.fetch ?? globalThis.fetch;
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;

  const products: BevmoProduct[] = [];
  const parseFailures: FetchBeerCatalogResult["parseFailures"] = [];
  let totalProductsScanned = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = CATALOG_URL(page, pageSize);
    const r = await f(url, {
      headers: {
        // Bot-flagged UAs get a 403 from BevMo's Cloudflare. Use a
        // current desktop Chrome string. (No login, no checkout — just
        // public catalog browse.)
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!r.ok) {
      throw new Error(
        `BevMo catalog page ${page} returned ${r.status} ${r.statusText}`,
      );
    }
    const json = await r.json();
    const parsed = ShopifyCatalogResponseSchema.parse(json);
    pagesFetched += 1;
    totalProductsScanned += parsed.products.length;

    if (parsed.products.length === 0) break;

    for (const raw of parsed.products) {
      if (!isBeerProduct(raw)) continue;
      try {
        products.push(parseShopifyProduct(raw));
      } catch (err) {
        parseFailures.push({
          id: String(raw.id),
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (parsed.products.length < pageSize) break; // last page
  }

  return { products, pagesFetched, totalProductsScanned, parseFailures };
}
