/**
 * BevMo Playwright extraction.
 *
 * BevMo's /products.json catalog endpoint is gated by Cloudflare's
 * JS challenge — no straightforward way to bypass from a server
 * fetch. The reliable path is full Playwright render of the public
 * category page, where products and prices are visible after JS
 * hydrates.
 *
 * Strategy:
 *   1. Navigate to https://www.bevmo.com/pages/beer (domcontentloaded)
 *   2. Wait 5 seconds for hydration
 *   3. Scroll to bottom repeatedly until lazy-load is exhausted
 *   4. Extract each product anchor `<a href="/products/{id}">` along
 *      with its surrounding card's price text
 *
 * Verified 2026-05-05: 29 products on first scroll, more on subsequent
 * scrolls. Prices include "was" (compare_at) when products are on sale.
 */

import { chromium, type Browser } from "playwright";

import { parsePrice } from "../../price";
import { parsePackInfo } from "./parse";

export interface ScrapedBevmoProduct {
  bevmoId: string;
  title: string;
  brand: string | null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  rawPriceText: string;
}

const CATEGORY_URL = "https://www.bevmo.com/pages/beer";
const HYDRATION_MS = 5_000;
const SCROLL_ROUNDS = 12;
const SCROLL_SETTLE_MS = 700;

export async function extractBevmoBeerProducts(): Promise<ScrapedBevmoProduct[]> {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    return await extractWithBrowser(browser);
  } finally {
    await browser.close();
  }
}

async function extractWithBrowser(browser: Browser): Promise<ScrapedBevmoProduct[]> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1600 },
  });
  const page = await context.newPage();

  await page.goto(CATEGORY_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(HYDRATION_MS);

  // Scroll to exhaust the lazy-load. BevMo loads ~30 products per
  // scroll; the full beer catalog is a few hundred.
  let lastCount = -1;
  let stableRounds = 0;
  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    const count = await countProductLinks(page);
    if (count === lastCount) {
      stableRounds += 1;
      if (stableRounds >= 2) break;
    } else {
      stableRounds = 0;
    }
    lastCount = count;
  }

  // Extract from rendered DOM in a single page-context call.
  const raw = await page.evaluate(() => {
    const HREF_RE = /\/products\/(\d+)/;
    const cards: Array<{ id: string; title: string; rawPriceText: string }> = [];
    const seen = new Set<string>();

    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/products/"]'),
    );

    for (const link of links) {
      const m = HREF_RE.exec(link.getAttribute("href") ?? "");
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);

      // Climb until we find a containing element with $X.XX text.
      let card: Element | null = link;
      for (let depth = 0; depth < 8 && card?.parentElement; depth++) {
        card = card.parentElement;
        if (/\$\d+\.\d{2}/.test(card.textContent ?? "")) break;
      }

      const cardText = card?.textContent ?? "";
      // Find ALL prices in the card so we can identify current and was.
      const priceMatches = cardText.match(/\$\d+\.\d{2}/g) ?? [];
      // Title is the link's text (already includes brand + pack info)
      const title = (link.textContent ?? "").trim();

      cards.push({
        id,
        title,
        rawPriceText: priceMatches.join(" | "),
      });
    }
    return cards;
  });

  await context.close();

  // Convert raw → ScrapedBevmoProduct
  const products: ScrapedBevmoProduct[] = [];
  for (const card of raw) {
    const prices = card.rawPriceText
      .split(" | ")
      .map((s) => parsePrice(s))
      .filter((n): n is number => n != null);
    if (prices.length === 0) continue;

    // Convention: current price is the lowest (sale price < regular).
    // If only one price exists, current == it; no "was".
    let priceCents: number;
    let regularPriceCents: number | null = null;
    if (prices.length === 1) {
      priceCents = prices[0];
    } else {
      priceCents = Math.min(...prices);
      const max = Math.max(...prices);
      regularPriceCents = max > priceCents ? max : null;
    }

    const { packCount, packUnitMl } = parsePackInfo(card.title);
    const brand = card.title.split(/\s+/)[0] ?? null;

    products.push({
      bevmoId: card.id,
      title: card.title,
      brand,
      packCount,
      packUnitMl,
      priceCents,
      regularPriceCents,
      rawPriceText: card.rawPriceText,
    });
  }
  return products;
}

async function countProductLinks(page: import("playwright").Page): Promise<number> {
  return page.evaluate(() => {
    const RE = /\/products\/(\d+)/;
    const seen = new Set<string>();
    document.querySelectorAll('a[href^="/products/"]').forEach((a) => {
      const m = RE.exec(a.getAttribute("href") ?? "");
      if (m) seen.add(m[1]);
    });
    return seen.size;
  });
}
