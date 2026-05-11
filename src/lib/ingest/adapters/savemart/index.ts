/**
 * Save Mart Nevada City adapter — Playwright catalog ingestion.
 *
 * Strategy (verified 2026-05-05):
 *
 *   1. Drive a headless Chromium session to the Instacart-powered
 *      beer category page (extract.ts encapsulates this).
 *   2. Parse each rendered card into ScrapedSavemartProduct via
 *      extract.ts. Pack info comes from the card title text (Instacart
 *      doesn't surface packSize/packUnitMl as structured fields).
 *   3. Resolve each chain SKU to a canonical_product_id via the alias
 *      bridge (auto-stub on first sighting; admin merges duplicates
 *      across chains).
 *   4. Sanity-check vs. most recent stored price; route glitches to
 *      quarantine_events.
 *   5. Persist via writePriceEvent (idempotent — no-op if unchanged).
 *
 * Heads-up for runners: extract.ts performs real browser navigation,
 * so this adapter needs a Playwright runtime in the environment
 * (already a workspace dep). The default factory accepts an injected
 * extractor for test/mock usage.
 */

import type { Adapter, AdapterDeps, AdapterRun } from "../../contract";
import { isPriceSane } from "../../sanity";
import {
  getMostRecentPrice,
  upsertAliasAndCanonicalProduct,
  writePriceEvent,
  writeQuarantine,
} from "../../persist";
import {
  extractSavemartBeerProducts,
  type ScrapedSavemartProduct,
} from "./extract";

const SAVEMART_STORE_ID = "savemart-nevada-city";

export interface SavemartAdapterOptions {
  /** Override extractor for tests. Defaults to live Playwright extraction. */
  extract?: () => Promise<ScrapedSavemartProduct[]>;
}

export function makeSavemartAdapter(
  options: SavemartAdapterOptions = {},
): Adapter {
  const extract = options.extract ?? extractSavemartBeerProducts;

  return {
    sourceId: "savemart",

    async run(deps: AdapterDeps): Promise<AdapterRun> {
      const startedAt = new Date();
      const t0 = Date.now();
      const run: AdapterRun = {
        sourceId: "savemart",
        runStartedAt: startedAt,
        productsObserved: 0,
        pricesWritten: 0,
        parseFailures: [],
        fetchErrors: [],
        durationMs: 0,
      };

      let products: ScrapedSavemartProduct[];
      try {
        products = await extract();
      } catch (err) {
        run.fetchErrors.push({
          url: "https://shop.savemart.com/store/savemart/collections/n-beer-9751",
          status: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
        run.durationMs = Date.now() - t0;
        return run;
      }

      deps.logger.info(`savemart: extracted ${products.length} products`);
      run.productsObserved = products.length;

      for (const product of products) {
        await processProduct(product, deps, run);
      }

      deps.logger.info(`savemart: run complete`, {
        observed: run.productsObserved,
        written: run.pricesWritten,
        parseFailures: run.parseFailures.length,
        fetchErrors: run.fetchErrors.length,
      });

      run.durationMs = Date.now() - t0;
      return run;
    },
  };
}

export const savemartAdapter: Adapter = makeSavemartAdapter();

export default savemartAdapter;

async function processProduct(
  product: ScrapedSavemartProduct,
  deps: AdapterDeps,
  run: AdapterRun,
): Promise<void> {
  let canonicalProductId: number;
  try {
    const resolved = await upsertAliasAndCanonicalProduct({
      chainSku: `savemart/${product.savemartId}`,
      brand: product.brand,
      rawName: product.name,
      packCount: product.packCount,
      packUnitMl: product.packUnitMl,
    });
    canonicalProductId = resolved.canonicalProductId;
  } catch (err) {
    run.fetchErrors.push({
      url: `db:alias upsert savemart/${product.savemartId}`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prior: number | null = null;
  try {
    prior = await getMostRecentPrice(SAVEMART_STORE_ID, canonicalProductId);
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
      storeId: SAVEMART_STORE_ID,
      rawProductIdentifier: `savemart/${product.savemartId}`,
      attemptedPriceCents: product.priceCents,
      priorPriceCents: prior,
      reason: verdict.reason,
      rawSnippet: `name="${product.name}" raw="${product.rawPriceText}"`,
    });
    return;
  }

  const wasPriceCents =
    product.regularPriceCents != null &&
    product.regularPriceCents > product.priceCents
      ? product.regularPriceCents
      : undefined;

  const wrote = await writePriceEvent({
    storeId: SAVEMART_STORE_ID,
    canonicalProductId,
    priceCents: product.priceCents,
    wasPriceCents,
    source: "savemart",
  });
  if (wrote) run.pricesWritten += 1;
}
