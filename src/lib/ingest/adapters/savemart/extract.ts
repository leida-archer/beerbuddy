/**
 * Save Mart Nevada City — Playwright extraction.
 *
 * shop.savemart.com is an Instacart-powered storefront. Direct fetch
 * of /products.json returns 404 (catalog endpoint disabled), but the
 * full collection page renders with prices via Playwright:
 *
 *   /store/savemart/collections/n-beer-9751   ← BEER category
 *
 * The category ID `n-beer-9751` was discovered by navigating to the
 * /storefront route and reading the visible category links. Other
 * categories follow the same `n-{name}-{id}` pattern.
 *
 * Product links: `/store/savemart/products/{id}-{slug}`
 *
 * Each card text includes:
 *   "Current price: $X.YY$XYY Original Price: $A.BB$ABB N% off Brand..."
 *
 * The duplicate "$X.YY$XYY" format is Instacart's way of providing
 * both display and machine-readable prices. parsePrice picks up the
 * first decimal-format and ignores the rest.
 */

import { chromium, type Browser } from "playwright";

import { parsePrice } from "../../price";
import { parsePackInfo } from "../bevmo/parse";

const CATEGORY_URL =
  "https://shop.savemart.com/store/savemart/collections/n-beer-9751";
const HYDRATION_MS = 5_000;
// Save Mart's category page loads ~30 products per scroll. 6 rounds
// maxes at ~180 products (covers most of the catalog at this store).
// Higher counts caused the extraction to hang in the wild.
const SCROLL_ROUNDS = 6;
const SCROLL_SETTLE_MS = 600;

export interface ScrapedSavemartProduct {
  savemartId: string;
  slug: string;
  name: string;
  brand: string | null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  rawPriceText: string;
}

export async function extractSavemartBeerProducts(): Promise<ScrapedSavemartProduct[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    return await extract(browser);
  } finally {
    await browser.close();
  }
}

async function extract(browser: Browser): Promise<ScrapedSavemartProduct[]> {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1600 },
  });
  const page = await ctx.newPage();

  await page.goto(CATEGORY_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(HYDRATION_MS);

  let lastCount = -1;
  let stableRounds = 0;
  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const count = await page.evaluate(
      () =>
        document.querySelectorAll('a[href*="/store/savemart/products/"]').length,
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
    const HREF_RE = /\/store\/savemart\/products\/(\d+)-([^/?#]+)/;
    const cards: Array<{
      savemartId: string;
      slug: string;
      cardText: string;
      priceTexts: string[];
    }> = [];
    const seen = new Set<string>();

    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/store/savemart/products/"]',
      ),
    );

    for (const link of links) {
      const m = HREF_RE.exec(link.getAttribute("href") ?? "");
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);

      // The link text on Instacart-style cards already includes the
      // entire card content: "Current price: $X.YY$XYY Original Price:
      // $A.BB$ABB N% off Brand Product Name pack..."
      // We use the link's textContent as the card text.
      const cardText = (link.textContent ?? "").trim().replace(/\s+/g, " ");
      const priceMatches = cardText.match(/\$\d+\.\d{2}/g) ?? [];
      cards.push({
        savemartId: id,
        slug: m[2],
        cardText,
        priceTexts: priceMatches,
      });
    }
    return cards;
  });
  await ctx.close();

  // Save Mart's text pattern: "Current price: $X.YY$XYY Original Price:
  // $A.BB$ABB N% offBrand Product Name pack-info"
  // After the prices comes the actual product name.
  const NAME_AFTER_PRICES = /(?:%\s*off|\bOriginal Price[^a-zA-Z]*\$[\d.]+)([A-Za-z].*)$/;
  // UI noise that bleeds into card text: "Many in stock", "Add to list",
  // pack-detail tail "N x XX fl oz...", availability badges. Strip these.
  const NOISE_TAIL = /(Many in stock.*$|Add to (?:list|cart).*$|See more.*$)/i;
  // Insert a space before unit suffixes that immediately follow digits
  // so "Beer24 fl oz" → "Beer 24 fl oz".
  const RUNON_UNIT = /(\d+)(fl|oz|pack|pk)/gi;
  const products: ScrapedSavemartProduct[] = [];
  for (const card of raw) {
    const cents = card.priceTexts
      .map((s) => parsePrice(s))
      .filter((n): n is number => n != null);
    if (cents.length === 0) continue;

    let priceCents: number;
    let regularPriceCents: number | null = null;
    if (cents.length === 1) {
      priceCents = cents[0];
    } else {
      // First $X.YY in card is "Current price"; second is "Original Price".
      // (Instacart layout: current shown first, larger; original shown second
      // with strikethrough.)
      priceCents = cents[0];
      regularPriceCents = cents[1] > priceCents ? cents[1] : null;
    }

    // Extract the name. Strategy: take everything after the last
    // price+%+off pattern, fall back to slug-derived name.
    let name = "";
    const tail = NAME_AFTER_PRICES.exec(card.cardText);
    if (tail) {
      name = tail[1].trim();
    } else {
      // Fallback: strip leading "Current price:..." and try slug
      name = card.slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    // Strip trailing UI badges
    name = name.replace(NOISE_TAIL, "").trim();
    // Re-space run-on units ("Beer24 fl oz" → "Beer 24 fl oz")
    name = name.replace(RUNON_UNIT, "$1 $2");
    // Truncate if still has trailing junk
    name = name.split(/\s{2,}/)[0].slice(0, 120).trim();
    if (!name) continue;

    const { packCount, packUnitMl } = parsePackInfo(name);
    const brand = name.split(/\s+/)[0] ?? null;

    products.push({
      savemartId: card.savemartId,
      slug: card.slug,
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
