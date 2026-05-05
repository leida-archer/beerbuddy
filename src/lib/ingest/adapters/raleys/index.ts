/**
 * Raley's adapter — implements `Adapter` from ../../contract.ts.
 *
 * Strategy (per /design-consultation web audit + /plan-eng-review
 * Issues 1A/3A/4A):
 *
 *   1. Fetch the wine-beer-spirits sitemap (PMC18). Pure HTTP fetch,
 *      allowed by robots.txt. Returns the canonical product list.
 *   2. Open Playwright Chromium, navigate to the category page.
 *   3. Scroll to load all products, extract one record per card.
 *   4. Reconcile against the sitemap: every sitemap product not
 *      seen on the page is a parse failure (rendering bug or
 *      out-of-stock).
 *   5. Sanity-check each price against the most-recent stored value;
 *      route glitches to quarantine_events.
 *   6. Persist via writePriceEvent (idempotent — no-op if unchanged).
 *
 * Tentative selector / DOM assumptions are documented inline. They
 * will be tightened once the discovery script (scripts/raleys-
 * discover.ts) captures a real fixture and we can verify against it.
 */

import { chromium, type Browser } from "playwright";

import type { Adapter, AdapterDeps, AdapterRun } from "../../contract";
import { isPriceSane } from "../../sanity";
import {
  getMostRecentPrice,
  writePriceEvent,
  writeQuarantine,
} from "../../persist";
import { extractProducts, scrollUntilStable } from "./extract";
import { fetchRaleysProductSitemap } from "./sitemap";

/** Until product alias mapping lands (Week 5), Raley's writes events
 * keyed on a deterministic `canonical_product_id` derived from the
 * Raley's ID. Once the alias workflow is in, this lookup goes
 * through `product_aliases.chain_sku → canonical_product_id`. */
const RALEYS_STORE_ID = "raleys-grass-valley";
const RALEYS_CATEGORY_URL =
  "https://www.raleys.com/category/PMC18/wine-beer-spirits";

export const raleysAdapter: Adapter = {
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

    deps.logger.info("raleys: fetching sitemap (PMC18 wine-beer-spirits)");
    let sitemap;
    try {
      sitemap = await fetchRaleysProductSitemap({ fetch: deps.fetch });
    } catch (err) {
      run.fetchErrors.push({
        url: "https://www.raleys.com/sitemap/products/PMC18/products-sitemap.xml",
        status: err instanceof Error ? err.message : String(err),
        message: "Sitemap fetch failed — adapter cannot enumerate products.",
      });
      run.durationMs = Date.now() - t0;
      return run;
    }
    deps.logger.info(`raleys: sitemap returned ${sitemap.length} products`);

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 1600 },
      });
      const page = await context.newPage();

      deps.logger.info(`raleys: navigating to ${RALEYS_CATEGORY_URL}`);
      const response = await page.goto(RALEYS_CATEGORY_URL, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (!response || !response.ok()) {
        run.fetchErrors.push({
          url: RALEYS_CATEGORY_URL,
          status: response?.status() ?? "no-response",
          message: "Category page navigation did not return 2xx.",
        });
        run.durationMs = Date.now() - t0;
        return run;
      }

      // Wait briefly for client-side rendering. Raley's hydrates quickly
      // for category pages but we give it room.
      await page.waitForTimeout(2_000);

      const visibleAfterScroll = await scrollUntilStable(page);
      deps.logger.info(
        `raleys: ${visibleAfterScroll} product anchors after scroll-to-stable`,
      );

      const scraped = await extractProducts(page);
      run.productsObserved = scraped.length;
      deps.logger.info(`raleys: extracted ${scraped.length} cards`);

      const sitemapById = new Map(sitemap.map((s) => [s.raleysId, s]));

      for (const product of scraped) {
        if (product.priceCents == null) {
          run.parseFailures.push({
            rawSnippet: `id=${product.raleysId} name="${product.name}" raw="${product.rawPriceText}"`,
            reason: "price not found in card text",
            sourceLocation: `/product/${product.raleysId}/${product.slug}`,
          });
          continue;
        }

        // Until alias mapping lands, derive a synthetic canonical
        // product ID from the Raley's ID. This will be replaced by
        // a real lookup against product_aliases in Week 5.
        const canonicalProductId = Number.parseInt(product.raleysId, 10);
        if (!Number.isFinite(canonicalProductId)) {
          run.parseFailures.push({
            rawSnippet: `id=${product.raleysId}`,
            reason: "Raley's ID is not numeric — cannot derive canonical_product_id",
          });
          continue;
        }

        const prior = await getMostRecentPrice(
          RALEYS_STORE_ID,
          canonicalProductId,
        );
        const verdict = isPriceSane(prior, product.priceCents);
        if (!verdict.ok) {
          await writeQuarantine({
            storeId: RALEYS_STORE_ID,
            rawProductIdentifier: `raleys/${product.raleysId}`,
            attemptedPriceCents: product.priceCents,
            priorPriceCents: prior,
            reason: verdict.reason,
            rawSnippet: `name="${product.name}" raw="${product.rawPriceText}"`,
          });
          continue;
        }

        const wrote = await writePriceEvent({
          storeId: RALEYS_STORE_ID,
          canonicalProductId,
          priceCents: product.priceCents,
          wasPriceCents: product.wasPriceCents ?? undefined,
          source: "raleys",
        });
        if (wrote) run.pricesWritten += 1;
      }

      // Reconcile sitemap ⊃ scraped: products present in the canonical
      // list but missing from the rendered page get a parse failure.
      const scrapedIds = new Set(scraped.map((s) => s.raleysId));
      let missing = 0;
      for (const s of sitemap) {
        if (!scrapedIds.has(s.raleysId)) missing += 1;
      }
      if (missing > 0) {
        deps.logger.warn(
          `raleys: ${missing} sitemap products not seen in rendered DOM (lazy-load issue or out of stock)`,
        );
      }
    } catch (err) {
      run.fetchErrors.push({
        url: RALEYS_CATEGORY_URL,
        status: err instanceof Error ? err.name : "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (browser) await browser.close();
    }

    run.durationMs = Date.now() - t0;
    return run;
  },
};

export default raleysAdapter;
