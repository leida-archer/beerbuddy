/**
 * Grocery Outlet Grass Valley adapter — Playwright catalog ingestion.
 *
 * Instacart-powered storefront, same architecture as Save Mart's
 * shop.savemart.com — see extract.ts for the navigation rationale.
 *
 * The design doc originally framed Grocery Outlet as the "prove the
 * LLM path" chain because its weekly ad publishes as a PDF circular.
 * In practice the Instacart shop endpoint exposes the same prices
 * structurally, so this adapter takes the Playwright path. The LLM
 * capability was omitted entirely on 2026-05-10; if/when this site's
 * surface disappears, call `queueManualParse` from persist.ts so the
 * admin handles the PDF out-of-band via /admin/parse-queue.
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
  extractGroceryOutletBeerProducts,
  type ScrapedGroceryOutletProduct,
} from "./extract";

const GO_STORE_ID = "grocery-outlet-grass-valley";

export interface GroceryOutletAdapterOptions {
  extract?: () => Promise<ScrapedGroceryOutletProduct[]>;
}

export function makeGroceryOutletAdapter(
  options: GroceryOutletAdapterOptions = {},
): Adapter {
  const extract = options.extract ?? extractGroceryOutletBeerProducts;

  return {
    sourceId: "grocery-outlet",

    async run(deps: AdapterDeps): Promise<AdapterRun> {
      const startedAt = new Date();
      const t0 = Date.now();
      const run: AdapterRun = {
        sourceId: "grocery-outlet",
        runStartedAt: startedAt,
        productsObserved: 0,
        pricesWritten: 0,
        parseFailures: [],
        fetchErrors: [],
        durationMs: 0,
      };

      let products: ScrapedGroceryOutletProduct[];
      try {
        products = await extract();
      } catch (err) {
        run.fetchErrors.push({
          url: "https://shop.groceryoutlet.com/store/grocery-outlet/collections/n-beer-cider-36676",
          status: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
        run.durationMs = Date.now() - t0;
        return run;
      }

      deps.logger.info(`grocery-outlet: extracted ${products.length} products`);
      run.productsObserved = products.length;

      for (const product of products) {
        await processProduct(product, deps, run);
      }

      deps.logger.info(`grocery-outlet: run complete`, {
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

export const groceryOutletAdapter: Adapter = makeGroceryOutletAdapter();

export default groceryOutletAdapter;

async function processProduct(
  product: ScrapedGroceryOutletProduct,
  deps: AdapterDeps,
  run: AdapterRun,
): Promise<void> {
  let canonicalProductId: number;
  try {
    const resolved = await upsertAliasAndCanonicalProduct({
      chainSku: `grocery-outlet/${product.groceryOutletId}`,
      brand: product.brand,
      rawName: product.name,
      packCount: product.packCount,
      packUnitMl: product.packUnitMl,
    });
    canonicalProductId = resolved.canonicalProductId;
  } catch (err) {
    run.fetchErrors.push({
      url: `db:alias upsert grocery-outlet/${product.groceryOutletId}`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prior: number | null = null;
  try {
    prior = await getMostRecentPrice(GO_STORE_ID, canonicalProductId);
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
      storeId: GO_STORE_ID,
      rawProductIdentifier: `grocery-outlet/${product.groceryOutletId}`,
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
    storeId: GO_STORE_ID,
    canonicalProductId,
    priceCents: product.priceCents,
    wasPriceCents,
    source: "grocery-outlet",
  });
  if (wrote) run.pricesWritten += 1;
}
