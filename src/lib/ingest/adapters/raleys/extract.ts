/**
 * Raley's category-page extraction.
 *
 * Selector strategy (verified 2026-05-05 via discovery script):
 *
 *   - Anchors: `<a href="/product/{id}/{slug}">`. Stable URL pattern.
 *   - Current price: descendant `<span class="...font-bold text-primary-700">$X.XX</span>`
 *     within the same card. Tailwind utility classes; stable across builds.
 *   - "Was" price (strikethrough): descendant `<span class="...font-bold text-gray-600">$X.XX</span>`
 *     in the same card. Present only on sale items.
 *   - Product name: anchor's aria-label = "Go to product details for {Product Name}".
 *     The "Go to product details for " prefix is stripped.
 *
 * Card boundary: smallest containing element that holds exactly ONE
 * matching anchor AND at least one current-price span. This stops the
 * walker from grabbing the entire grid (the v0 bug).
 *
 * Pagination: Raley's uses a "Load More" button — NOT infinite scroll.
 * scrollUntilStable returned only 30 of 5,679 products on first run.
 * loadAllPages clicks Load More until the button is gone or hits the
 * configured cap.
 */

import type { Locator, Page } from "playwright";

import { parsePrice } from "../../price";

const ARIA_PREFIX = /^Go to product details for\s+/i;
const PRODUCT_HREF_RE = /^\/product\/(\d+)\/([^/?#]+)/;

export interface ScrapedProduct {
  raleysId: string;
  slug: string;
  name: string;
  priceCents: number | null;
  wasPriceCents: number | null;
  rawPriceText: string;
}

/**
 * Click "Load More" until it's gone or until `maxClicks` is reached.
 * Returns the number of clicks performed.
 */
export async function loadAllPages(
  page: Page,
  opts: { maxClicks?: number; settleMs?: number } = {},
): Promise<number> {
  const maxClicks = opts.maxClicks ?? 250; // 250 × 30 = 7,500 — covers the catalog with headroom.
  const settleMs = opts.settleMs ?? 700;

  const button: Locator = page.getByRole("button", { name: /load more/i });
  let clicks = 0;
  while (clicks < maxClicks) {
    if (!(await button.isVisible().catch(() => false))) break;
    if (!(await button.isEnabled().catch(() => false))) break;

    // Bring the button into view; some layouts skip click events on
    // off-screen elements with anti-bot heuristics.
    await button.scrollIntoViewIfNeeded().catch(() => undefined);
    await button.click({ timeout: 5_000 }).catch(() => undefined);
    clicks += 1;
    await page.waitForTimeout(settleMs);
  }
  return clicks;
}

/**
 * Extract one ScrapedProduct per visible product card on the page.
 *
 * Runs entirely in the page context (single round-trip) and uses the
 * Tailwind class selectors verified by the discovery output.
 */
export async function extractProducts(page: Page): Promise<ScrapedProduct[]> {
  const raw = await page.evaluate(
    ({ priceClass, wasClass }) => {
      const HREF_RE = /^\/product\/(\d+)\/([^/?#]+)/;
      const ARIA_RE = /^Go to product details for\s+/i;
      const seen = new Set<string>();
      const cards: Array<{
        raleysId: string;
        slug: string;
        name: string;
        currentPriceText: string;
        wasPriceText: string;
      }> = [];

      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href^="/product/"]'),
      );

      for (const anchor of anchors) {
        const href = anchor.getAttribute("href") ?? "";
        const m = HREF_RE.exec(href);
        if (!m) continue;
        const raleysId = m[1];
        if (seen.has(raleysId)) continue;
        seen.add(raleysId);

        // Verified 2026-05-05: each product card is the <a> itself —
        // anchor wraps image + button + price spans. No climbing needed.
        //
        // Two color conventions in use:
        //   - text-primary-700  : current price (highlighted, e.g. red)
        //   - text-gray-600     : either the "was"/strikethrough price
        //                         (when paired with primary-700)
        //                         OR the current price for member-only
        //                         products (where no primary-700 exists)
        //
        // Rule: prefer primary-700 as current. Fall back to gray-600
        // as current only when primary-700 is absent. gray-600 is "was"
        // only when primary-700 is also present.
        const primaryEl = anchor.querySelector<HTMLElement>(
          `span.${priceClass}`,
        );
        const grayEl = anchor.querySelector<HTMLElement>(`span.${wasClass}`);

        let currentPriceText = "";
        let wasPriceText = "";
        if (primaryEl) {
          currentPriceText = primaryEl.textContent?.trim() ?? "";
          wasPriceText = grayEl?.textContent?.trim() ?? "";
        } else if (grayEl) {
          currentPriceText = grayEl.textContent?.trim() ?? "";
        }

        const ariaLabel = anchor.getAttribute("aria-label") ?? "";
        const name = ariaLabel.replace(ARIA_RE, "").trim();

        cards.push({
          raleysId,
          slug: m[2],
          name: name || m[2].replace(/-/g, " "),
          currentPriceText,
          wasPriceText,
        });
      }

      return cards;
    },
    { priceClass: "text-primary-700", wasClass: "text-gray-600" },
  );

  const products: ScrapedProduct[] = [];
  for (const card of raw) {
    const priceCents = parsePrice(card.currentPriceText);
    const wasPriceCents = parsePrice(card.wasPriceText);

    products.push({
      raleysId: card.raleysId,
      slug: card.slug,
      name: card.name,
      priceCents,
      wasPriceCents,
      rawPriceText: [card.currentPriceText, card.wasPriceText]
        .filter(Boolean)
        .join(" / "),
    });
  }
  return products;
}

/**
 * Backwards-compatibility: previous adapter v0 used scrollUntilStable.
 * Raley's category page uses Load More instead, so this is now a thin
 * wrapper around loadAllPages — kept exported for callers that imported
 * it. Returns the count of product anchors after pagination is exhausted.
 */
export async function scrollUntilStable(
  page: Page,
  opts: { maxRounds?: number; settleMs?: number } = {},
): Promise<number> {
  await loadAllPages(page, {
    maxClicks: opts.maxRounds,
    settleMs: opts.settleMs,
  });
  return await page.evaluate(() => {
    const RE = /^\/product\/(\d+)/;
    const seen = new Set<string>();
    document.querySelectorAll('a[href^="/product/"]').forEach((a) => {
      const m = RE.exec(a.getAttribute("href") ?? "");
      if (m) seen.add(m[1]);
    });
    return seen.size;
  });
}

// Exported only so unit tests can verify regex behavior in isolation.
export const __testables__ = {
  ARIA_PREFIX,
  PRODUCT_HREF_RE,
};
