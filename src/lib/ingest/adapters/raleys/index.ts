/**
 * Raley's adapter — implements `Adapter` from ../../contract.ts.
 *
 * Strategy (verified 2026-05-05 via discover:raleys):
 *
 *   1. Fetch the homepage HTML once and extract the Next.js buildId
 *      from the embedded `__NEXT_DATA__` script tag. ~80 ms.
 *   2. Fetch the wine-beer-spirits sitemap (PMC18 by default) for the
 *      canonical product list. ~800 ms for 5,679 products.
 *   3. For each product, fetch /_next/data/{buildId}/en/product/{id}/
 *      {slug}.json with limited concurrency. Each fetch is ~50-300 ms.
 *      With concurrency of 10, total is ~3-5 minutes for the full
 *      catalog. Beer-only (PMC147) is much smaller — likely <1 min.
 *   4. Parse each response (Commercetools shape) → RaleysProduct.
 *   5. Sanity-check vs. most recent stored price; route glitches to
 *      quarantine_events.
 *   6. Persist via writePriceEvent (idempotent — no-op if unchanged).
 *
 * Why JSON over Playwright (per /design-consultation web audit):
 *   - 30x faster per ingestion run
 *   - Returns structured UPC for cross-chain product matching
 *   - Returns structured pack-count and serving size (no slug parsing)
 *   - Returns explicit discount field (no DOM heuristics)
 *   - Allowed by robots.txt (only /api/, /account/, /customer/ blocked;
 *     /_next/data/ is not disallowed)
 *
 * Playwright path remains in extract.ts for the discovery script and
 * as a fallback if Raley's restructures the JSON. Not used by the
 * adapter under normal operation.
 */

import type { Adapter, AdapterDeps, AdapterRun } from "../../contract";
import { isPriceSane } from "../../sanity";
import {
  getMostRecentPrice,
  upsertAliasAndCanonicalProduct,
  writePriceEvent,
  writeQuarantine,
} from "../../persist";
import { fetchRaleysBuildId } from "./buildId";
import { fetchProductJson, type RaleysProduct } from "./productJson";
import { fetchRaleysProductSitemap, type SitemapProduct } from "./sitemap";

const RALEYS_STORE_ID = "raleys-grass-valley";
/** Beer-only category. Wine-beer-spirits (PMC18) is the broader catalog. */
const DEFAULT_PMC_ID = 147;
/** Concurrency for the per-product JSON fetches. Higher = faster but
 * risks rate-limiting. 10 is a balance: ~3 min for ~6k products,
 * ~30 sec for the ~600 beer-only catalog. */
const FETCH_CONCURRENCY = 10;
/** Pause between fetches per worker, ms. Politeness throttle. */
const PER_FETCH_DELAY_MS = 50;

export interface RaleysAdapterOptions {
  /** PMC category ID. 18 = wine+beer+spirits, 147 = beer only. */
  pmcId?: number;
  /** Cap concurrent product-JSON fetches. */
  concurrency?: number;
}

export function makeRaleysAdapter(options: RaleysAdapterOptions = {}): Adapter {
  const pmcId = options.pmcId ?? DEFAULT_PMC_ID;
  const concurrency = options.concurrency ?? FETCH_CONCURRENCY;

  return {
    sourceId: "raleys",

    async run(deps: AdapterDeps): Promise<AdapterRun> {
      const startedAt = new Date();
      const t0 = Date.now();
      const run: AdapterRun = {
        sourceId: "raleys",
        runStartedAt: startedAt,
        productsObserved: 0,
        pricesWritten: 0,
        parseFailures: [],
        fetchErrors: [],
        durationMs: 0,
      };

      // 1. Discover buildId.
      let buildId: string;
      try {
        buildId = await fetchRaleysBuildId({ fetch: deps.fetch });
        deps.logger.info("raleys: discovered buildId", { buildId });
      } catch (err) {
        run.fetchErrors.push({
          url: "https://www.raleys.com/",
          status: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
        run.durationMs = Date.now() - t0;
        return run;
      }

      // 2. Fetch sitemap.
      let sitemap: SitemapProduct[];
      try {
        sitemap = await fetchRaleysProductSitemap({ pmcId, fetch: deps.fetch });
        deps.logger.info(
          `raleys: sitemap returned ${sitemap.length} products in PMC${pmcId}`,
        );
      } catch (err) {
        run.fetchErrors.push({
          url: `https://www.raleys.com/sitemap/products/PMC${pmcId}/products-sitemap.xml`,
          status: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
        run.durationMs = Date.now() - t0;
        return run;
      }

      // 3. Concurrent product-JSON fetches.
      const queue: SitemapProduct[] = [...sitemap];
      let totalAttempted = 0;
      const workers: Promise<void>[] = [];
      for (let i = 0; i < concurrency; i++) {
        workers.push(
          (async () => {
            while (queue.length > 0) {
              const item = queue.shift();
              if (!item) return;
              totalAttempted += 1;
              await processProduct(item, buildId, deps, run);
              if (PER_FETCH_DELAY_MS > 0) {
                await new Promise((r) => setTimeout(r, PER_FETCH_DELAY_MS));
              }
            }
          })(),
        );
      }
      await Promise.all(workers);
      run.productsObserved = totalAttempted;

      deps.logger.info(`raleys: run complete`, {
        attempted: totalAttempted,
        written: run.pricesWritten,
        parseFailures: run.parseFailures.length,
        fetchErrors: run.fetchErrors.length,
      });

      run.durationMs = Date.now() - t0;
      return run;
    },
  };
}

/** Default-configured adapter — beer category, default concurrency. */
export const raleysAdapter: Adapter = makeRaleysAdapter();

export default raleysAdapter;

/**
 * Fetch one product, sanity-check it, and either persist or quarantine.
 * All errors mutate `run` rather than throwing — adapter-level promise
 * never rejects on a single product's failure.
 */
async function processProduct(
  item: SitemapProduct,
  buildId: string,
  deps: AdapterDeps,
  run: AdapterRun,
): Promise<void> {
  let product: RaleysProduct;
  try {
    product = await fetchProductJson(buildId, item.raleysId, item.slug, {
      fetch: deps.fetch,
    });
  } catch (err) {
    run.fetchErrors.push({
      url: `/_next/data/${buildId}/en/product/${item.raleysId}/${item.slug}.json`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let canonicalProductId: number;
  try {
    const resolved = await upsertAliasAndCanonicalProduct({
      chainSku: `raleys/${product.raleysId}`,
      brand: product.brand,
      rawName: product.name,
      packCount: product.packCount,
      packUnitMl: product.packUnitMl,
    });
    canonicalProductId = resolved.canonicalProductId;
  } catch (err) {
    run.fetchErrors.push({
      url: `db:alias upsert raleys/${product.raleysId}`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prior: number | null = null;
  try {
    prior = await getMostRecentPrice(RALEYS_STORE_ID, canonicalProductId);
  } catch (err) {
    // DB unreachable. Funnel as fetchError so the run summary surfaces
    // it; processing continues for other products that may not need DB.
    run.fetchErrors.push({
      url: `db:price_events lookup ${canonicalProductId}`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const verdict = isPriceSane(prior, product.priceCents);
  if (!verdict.ok) {
    await writeQuarantine({
      storeId: RALEYS_STORE_ID,
      rawProductIdentifier: `raleys/${product.raleysId}`,
      attemptedPriceCents: product.priceCents,
      priorPriceCents: prior,
      reason: verdict.reason,
      rawSnippet: `name="${product.name}" upc=${product.upc ?? "?"}`,
    });
    return;
  }

  const wasPriceCents =
    product.regularPriceCents != null && product.regularPriceCents !== product.priceCents
      ? product.regularPriceCents
      : undefined;

  const wrote = await writePriceEvent({
    storeId: RALEYS_STORE_ID,
    canonicalProductId,
    priceCents: product.priceCents,
    wasPriceCents,
    source: "raleys",
  });
  if (wrote) run.pricesWritten += 1;
}
