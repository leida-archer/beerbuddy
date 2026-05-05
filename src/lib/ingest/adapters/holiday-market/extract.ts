/**
 * Holiday Market Penn Valley — Playwright extraction.
 *
 * shopholidaymarket.com is a custom platform (not Shopify, not Next.js
 * Commercetools — appears to be a North-State-Grocery in-house shopping
 * stack). Verified 2026-05-05 the only path to product data is full
 * Playwright render of the beer category page:
 *
 *   /search/products/?category_ids=11649        (BEER — id discovered
 *                                                 from page navigation)
 *
 * Product cards live in `.deal-right-product-main-wrap` divs. There is
 * no anchor link to per-product detail pages — each card is just a
 * presentational div with name + price text + image. We hash the name
 * to a synthetic stable ID for now (cross-store matching uses UPC where
 * available; name-hash is the v0 stand-in for chains that don't expose
 * UPCs).
 */

import { chromium, type Browser } from "playwright";

import { parsePrice } from "../../price";
import { parsePackInfo } from "../bevmo/parse";

const CATEGORY_URL =
  "https://www.shopholidaymarket.com/search/products/?category_ids=11649";
const HYDRATION_MS = 6_000;
const SCROLL_ROUNDS = 12;
const SCROLL_SETTLE_MS = 800;

export interface ScrapedHolidayProduct {
  /** Synthetic stable ID (md5-truncated hash of normalized name). */
  id: string;
  name: string;
  brand: string | null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  rawPriceText: string;
}

export async function extractHolidayBeerProducts(): Promise<ScrapedHolidayProduct[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    return await extract(browser);
  } finally {
    await browser.close();
  }
}

async function extract(browser: Browser): Promise<ScrapedHolidayProduct[]> {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1600 },
  });
  const page = await ctx.newPage();
  await page.goto(CATEGORY_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(HYDRATION_MS);

  // Scroll to exhaust lazy-load. Holiday Market loads ~30 cards at a
  // time when scrolling reaches the bottom.
  let lastCount = -1;
  let stableRounds = 0;
  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const count = await page.evaluate(() =>
      document.querySelectorAll(".deal-right-product-main-wrap").length,
    );
    if (count === lastCount) {
      stableRounds += 1;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
    lastCount = count;
  }

  const raw = await page.evaluate(() => {
    const cards = document.querySelectorAll<HTMLElement>(
      ".deal-right-product-main-wrap",
    );
    const out: Array<{ rawText: string; priceTexts: string[] }> = [];
    for (const card of Array.from(cards)) {
      const rawText = (card.textContent ?? "").trim().replace(/\s+/g, " ");
      const priceMatches = rawText.match(/\$\d+\.\d{2}/g) ?? [];
      out.push({ rawText, priceTexts: priceMatches });
    }
    return out;
  });
  await ctx.close();

  // Strip the UI noise from each card's text. Common noise tokens
  // observed: "On Sale", "Add to list", "New List", "Enter List Name",
  // "Save", "No list found.". Everything between those and the prices
  // is the product name.
  const NOISE = /^(On Sale|Add to list|New List|Enter List Name|Save|No list found\.?)+/;
  const NOISE_REPLACE = /(On Sale|Add to list|New List|Enter List Name|Save|No list found\.?)/g;
  const products: ScrapedHolidayProduct[] = [];
  const seenIds = new Set<string>();

  for (const card of raw) {
    // Remove all noise tokens
    let text = card.rawText.replace(NOISE_REPLACE, "").trim();
    // Strip the trailing prices to get just the name
    const firstPriceMatch = text.match(/\$\d+\.\d{2}/);
    const name = firstPriceMatch
      ? text.slice(0, firstPriceMatch.index).trim()
      : text.trim();
    if (!name || name.length < 3) continue;

    // Identify current vs was price.
    const cents = card.priceTexts
      .map((s) => parsePrice(s))
      .filter((n): n is number => n != null);
    if (cents.length === 0) continue;

    let priceCents: number;
    let regularPriceCents: number | null = null;
    if (cents.length === 1) {
      priceCents = cents[0];
    } else {
      // Two prices: convention is "current was". Higher one is regular.
      priceCents = Math.min(...cents);
      const max = Math.max(...cents);
      regularPriceCents = max > priceCents ? max : null;
    }

    const id = hashId(name);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const { packCount, packUnitMl } = parsePackInfo(name);
    const brand = name.split(/\s+/)[0] ?? null;

    products.push({
      id,
      name,
      brand,
      packCount,
      packUnitMl,
      priceCents,
      regularPriceCents,
      rawPriceText: card.priceTexts.join(" | "),
    });
  }

  return products;
}

/**
 * Stable synthetic ID derived from the normalized product name. Used as
 * canonical_product_id until UPC/SKU-based aliasing lands. ~40-bit
 * collision space is fine for ~hundreds of items per chain.
 */
function hashId(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 33) ^ normalized.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
