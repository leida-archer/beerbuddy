/**
 * Holiday Market Penn Valley adapter — Playwright catalog ingestion.
 *
 * North State Grocery's custom shopping platform (not Shopify, not
 * Commercetools). The only viable path verified during 2026-05-05
 * discovery is a Playwright render of the beer category page — see
 * extract.ts for the navigation rationale.
 *
 * Card-level shape lacks UPC and a stable site-side ID, so extract.ts
 * synthesizes an id from a hash of the normalized name. That hash is
 * stable across runs as long as Holiday Market's display name doesn't
 * change. When two chains both render the same product, the alias
 * admin UI is where they get merged into one canonical product row.
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
  extractHolidayBeerProducts,
  type ScrapedHolidayProduct,
} from "./extract";

const HOLIDAY_STORE_ID = "holiday-market-penn-valley";

export interface HolidayAdapterOptions {
  extract?: () => Promise<ScrapedHolidayProduct[]>;
}

export function makeHolidayAdapter(
  options: HolidayAdapterOptions = {},
): Adapter {
  const extract = options.extract ?? extractHolidayBeerProducts;

  return {
    sourceId: "holiday-market",

    async run(deps: AdapterDeps): Promise<AdapterRun> {
      const startedAt = new Date();
      const t0 = Date.now();
      const run: AdapterRun = {
        sourceId: "holiday-market",
        runStartedAt: startedAt,
        productsObserved: 0,
        pricesWritten: 0,
        parseFailures: [],
        fetchErrors: [],
        durationMs: 0,
      };

      let products: ScrapedHolidayProduct[];
      try {
        products = await extract();
      } catch (err) {
        run.fetchErrors.push({
          url: "https://www.shopholidaymarket.com/search/products/?category_ids=11649",
          status: err instanceof Error ? err.name : "unknown",
          message: err instanceof Error ? err.message : String(err),
        });
        run.durationMs = Date.now() - t0;
        return run;
      }

      deps.logger.info(`holiday-market: extracted ${products.length} products`);
      run.productsObserved = products.length;

      for (const product of products) {
        await processProduct(product, deps, run);
      }

      deps.logger.info(`holiday-market: run complete`, {
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

export const holidayAdapter: Adapter = makeHolidayAdapter();

export default holidayAdapter;

async function processProduct(
  product: ScrapedHolidayProduct,
  deps: AdapterDeps,
  run: AdapterRun,
): Promise<void> {
  let canonicalProductId: number;
  try {
    const resolved = await upsertAliasAndCanonicalProduct({
      chainSku: `holiday-market/${product.id}`,
      brand: product.brand,
      rawName: product.name,
      packCount: product.packCount,
      packUnitMl: product.packUnitMl,
    });
    canonicalProductId = resolved.canonicalProductId;
  } catch (err) {
    run.fetchErrors.push({
      url: `db:alias upsert holiday-market/${product.id}`,
      status: err instanceof Error ? err.name : "unknown",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let prior: number | null = null;
  try {
    prior = await getMostRecentPrice(HOLIDAY_STORE_ID, canonicalProductId);
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
      storeId: HOLIDAY_STORE_ID,
      rawProductIdentifier: `holiday-market/${product.id}`,
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
    storeId: HOLIDAY_STORE_ID,
    canonicalProductId,
    priceCents: product.priceCents,
    wasPriceCents,
    source: "holiday-market",
  });
  if (wrote) run.pricesWritten += 1;
}
