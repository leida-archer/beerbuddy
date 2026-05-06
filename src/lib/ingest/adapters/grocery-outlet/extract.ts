/**
 * Grocery Outlet Grass Valley — Playwright extraction.
 *
 * shop.groceryoutlet.com is an Instacart-powered storefront with the
 * same architecture as Save Mart. The beer-and-cider category renders
 * cleanly via Playwright at:
 *
 *   /store/grocery-outlet/collections/n-beer-cider-36676
 *
 * Same Instacart card text format ("Current price: $X.YY$XYY ...")
 * as Save Mart — see savemart/extract.ts for the parsing rationale.
 *
 * Timing notes (verified 2026-05-05): GO's category render is slower
 * than Save Mart's despite the same architecture. We use a bounded
 * scroll deadline + bounded browser.close() instead of Promise.race
 * around the whole extraction, because Playwright's browser.close()
 * can hang when the page has pending requests after a timeout.
 */

import { chromium, type Browser } from "playwright";

import { parsePrice } from "../../price";
import { parsePackInfo } from "../bevmo/parse";

const CATEGORY_URL =
  "https://shop.groceryoutlet.com/store/grocery-outlet/collections/n-beer-cider-36676";
const NAV_TIMEOUT_MS = 60_000;
const HYDRATION_MS = 6_000;
/** Max time we'll spend in the scroll loop. */
const SCROLL_DEADLINE_MS = 12_000;
const SCROLL_SETTLE_MS = 700;
/** Cap on browser.close() in the cleanup path so a hung close doesn't
 * stall the entire fixture build. Forces SIGKILL via Promise.race. */
const CLOSE_TIMEOUT_MS = 5_000;

export interface ScrapedGroceryOutletProduct {
  groceryOutletId: string;
  slug: string;
  name: string;
  brand: string | null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  rawPriceText: string;
}

export async function extractGroceryOutletBeerProducts(): Promise<ScrapedGroceryOutletProduct[]> {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  let products: ScrapedGroceryOutletProduct[] = [];
  try {
    products = await extract(browser);
  } catch (err) {
    console.warn(`[grocery-outlet] extraction failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    // Bound browser.close() — sometimes hangs on pages with pending requests.
    await Promise.race([
      browser.close(),
      new Promise<void>((r) => setTimeout(r, CLOSE_TIMEOUT_MS)),
    ]).catch(() => undefined);
  }
  return products;
}

async function extract(
  browser: Browser,
): Promise<ScrapedGroceryOutletProduct[]> {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1600 },
  });
  // Cap every Playwright operation so we never wait indefinitely.
  ctx.setDefaultTimeout(15_000);
  ctx.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  const page = await ctx.newPage();
  await page.goto(CATEGORY_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(HYDRATION_MS);

  // Bounded scroll loop — exits early when stable OR when deadline hits.
  const deadline = Date.now() + SCROLL_DEADLINE_MS;
  let lastCount = -1;
  let stableRounds = 0;
  while (Date.now() < deadline) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const count = await page.evaluate(
      () =>
        document.querySelectorAll('a[href*="/store/grocery-outlet/products/"]').length,
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
    const HREF_RE = /\/store\/grocery-outlet\/products\/(\d+)-([^/?#]+)/;
    const cards: Array<{
      id: string;
      slug: string;
      cardText: string;
      priceTexts: string[];
    }> = [];
    const seen = new Set<string>();

    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/store/grocery-outlet/products/"]',
      ),
    );

    for (const link of links) {
      const m = HREF_RE.exec(link.getAttribute("href") ?? "");
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const cardText = (link.textContent ?? "").trim().replace(/\s+/g, " ");
      const priceMatches = cardText.match(/\$\d+\.\d{2}/g) ?? [];
      cards.push({ id, slug: m[2], cardText, priceTexts: priceMatches });
    }
    return cards;
  });
  await ctx.close().catch(() => undefined);

  // Same Instacart parsing as Save Mart.
  const NAME_AFTER_PRICES = /(?:%\s*off|\bOriginal Price[^a-zA-Z]*\$[\d.]+|\$\d+\.\d{2}\$\d+)([A-Za-z].*)$/;
  const NOISE_TAIL = /(Many in stock.*$|Add to (?:list|cart).*$|See more.*$)/i;
  const RUNON_UNIT = /(\d+)(fl|oz|pack|pk)/gi;

  const products: ScrapedGroceryOutletProduct[] = [];
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
      priceCents = cents[0];
      regularPriceCents = cents[1] > priceCents ? cents[1] : null;
    }

    let name = "";
    const tail = NAME_AFTER_PRICES.exec(card.cardText);
    if (tail) {
      name = tail[1].trim();
    } else {
      name = card.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    name = name.replace(NOISE_TAIL, "").trim();
    name = name.replace(RUNON_UNIT, "$1 $2");
    name = name.split(/\s{2,}/)[0].slice(0, 120).trim();
    if (!name) continue;

    const { packCount, packUnitMl } = parsePackInfo(name);
    const brand = name.split(/\s+/)[0] ?? null;

    products.push({
      groceryOutletId: card.id,
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
