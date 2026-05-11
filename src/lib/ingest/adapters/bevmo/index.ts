/**
 * BevMo Auburn adapter — Shopify catalog ingestion.
 *
 * Architecture (verified 2026-05-05):
 *
 *   1. Fetch /products.json?limit=250&page=N until empty (or capped).
 *   2. Filter by product_type matching /\bBeer\b/i.
 *   3. Parse each into a BevmoProduct (parsePackInfo extracts pack
 *      count + unit ml from the title — Shopify's standard schema
 *      doesn't have these fields).
 *   4. Sanity-check vs. most recent stored price; quarantine glitches.
 *   5. Persist via writePriceEvent (idempotent).
 *
 * BevMo's robots.txt allows /products.json. Their policy text covers
 * "automated purchase agents" — data scraping for price comparison
 * (no cart, no checkout) is unrestricted.
 */

import type { Adapter, AdapterDeps, AdapterRun } from "../../contract";
import { isPriceSane } from "../../sanity";
import {
  getMostRecentPrice,
  upsertAliasAndCanonicalProduct,
  writePriceEvent,
  writeQuarantine,
} from "../../persist";
import { fetchBevmoBeerCatalog } from "./catalog";
import type { BevmoProduct } from "./parse";

const BEVMO_STORE_ID = "bevmo-auburn";

export const bevmoAdapter: Adapter = {
  sourceId: "bevmo",

  async run(deps: AdapterDeps): Promise<AdapterRun> {
    const startedAt = new Date();
    const t0 = Date.now();
    const run: AdapterRun = {
      sourceId: "bevmo",
      runStartedAt: startedAt,
      productsObserved: 0,
      pricesWritten: 0,
      parseFailures: [],
      fetchErrors: [],
      durationMs: 0,
    };

    let result;
    try {
      result = await fetchBevmoBeerCatalog({ fetch: deps.fetch });
    } catch (err) {
      run.fetchErrors.push({
        url: "https://www.bevmo.com/products.json",
        status: err instanceof Error ? err.name : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
      run.durationMs = Date.now() - t0;
      return run;
    }

    deps.logger.info(
      `bevmo: fetched ${result.totalProductsScanned} products across ${result.pagesFetched} pages; ${result.products.length} are beer`,
    );

    for (const f of result.parseFailures) {
      run.parseFailures.push({
        rawSnippet: `id=${f.id}`,
        reason: f.reason,
      });
    }

    run.productsObserved = result.products.length;
    for (const product of result.products) {
      await processProduct(product, deps, run);
    }

    deps.logger.info(`bevmo: run complete`, {
      written: run.pricesWritten,
      parseFailures: run.parseFailures.length,
      fetchErrors: run.fetchErrors.length,
    });

    run.durationMs = Date.now() - t0;
    return run;
  },
};

async function processProduct(
  product: BevmoProduct,
  deps: AdapterDeps,
  run: AdapterRun,
): Promise<void> {
  let canonicalProductId: number;
  try {
    const resolved = await upsertAliasAndCanonicalProduct({
      chainSku: `bevmo/${product.bevmoId}`,
      brand: product.brand,
      rawName: product.title,
      packCount: product.packCount,
      packUnitMl: product.packUnitMl,
    });
    canonicalProductId = resolved.canonicalProductId;
  } catch (err) {
    run.fetchErrors.push({
      url: `db:alias upsert bevmo/${product.bevmoId}`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prior: number | null = null;
  try {
    prior = await getMostRecentPrice(BEVMO_STORE_ID, canonicalProductId);
  } catch (err) {
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
      storeId: BEVMO_STORE_ID,
      rawProductIdentifier: `bevmo/${product.bevmoId}`,
      attemptedPriceCents: product.priceCents,
      priorPriceCents: prior,
      reason: verdict.reason,
      rawSnippet: `title="${product.title}"`,
    });
    return;
  }

  const wasPriceCents =
    product.regularPriceCents != null && product.regularPriceCents > product.priceCents
      ? product.regularPriceCents
      : undefined;

  const wrote = await writePriceEvent({
    storeId: BEVMO_STORE_ID,
    canonicalProductId,
    priceCents: product.priceCents,
    wasPriceCents,
    source: "bevmo",
  });
  if (wrote) run.pricesWritten += 1;
}

export default bevmoAdapter;
