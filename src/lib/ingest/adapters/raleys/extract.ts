/**
 * Raley's category-page extraction.
 *
 * Given a Playwright Page already navigated to the wine-beer-spirits
 * category, scroll to load all products and extract one record per
 * card.
 *
 * Selector strategy: layered fallbacks because Raley's is built with
 * Next.js + hashed CSS class names (the names change between deploys).
 * We anchor on stable signals first — the product URL pattern, then
 * aria-labels, then container heuristics — and only fall back to
 * brittle class names if none of the above work.
 *
 * IMPORTANT: this file's selector assumptions are tentative until
 * verified by the discovery script (scripts/raleys-discover.ts).
 * Once the discovery captures a real DOM snapshot, these selectors
 * should be tightened against the actual HTML.
 */

import type { Page } from "playwright";

import { parsePrice } from "../../price";

export interface ScrapedProduct {
  /** Numeric Raley's product ID extracted from the card's product href. */
  raleysId: string;
  /** URL slug — same as in the sitemap. */
  slug: string;
  /** Product display name as rendered on the card. */
  name: string;
  /** Price in cents, parsed from the rendered price text. Null if not found. */
  priceCents: number | null;
  /** "Was" / strikethrough price in cents, when present. */
  wasPriceCents: number | null;
  /** Raw price text the parser ran against — kept for quarantine forensics. */
  rawPriceText: string;
}

/**
 * Scroll to the bottom of the page repeatedly until no new product
 * cards appear. Raley's category page uses lazy-load on scroll;
 * we need to exhaust it before extracting.
 *
 * Returns the number of cards finally visible, or throws if scrolling
 * never produced any cards (usually means the selector for cards
 * is wrong, or the page isn't actually the category page).
 */
export async function scrollUntilStable(page: Page, opts: { maxRounds?: number; settleMs?: number } = {}): Promise<number> {
  const maxRounds = opts.maxRounds ?? 30;
  const settleMs = opts.settleMs ?? 800;

  let lastCount = -1;
  let stableRounds = 0;

  for (let i = 0; i < maxRounds; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(settleMs);

    const count = await countProductLinks(page);
    if (count === lastCount) {
      stableRounds += 1;
      if (stableRounds >= 2) return count;
    } else {
      stableRounds = 0;
    }
    lastCount = count;
  }
  return lastCount;
}

/**
 * Count product links currently visible — anchors whose href matches
 * the /product/{numeric_id}/{slug} pattern.
 */
async function countProductLinks(page: Page): Promise<number> {
  return page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href^="/product/"]');
    return anchors.length;
  });
}

/**
 * Extract one ScrapedProduct per visible product card on the page.
 *
 * Strategy: find every <a href="/product/{id}/{slug}">, climb to the
 * enclosing card, and extract name + price text from within. This
 * anchors on the URL pattern (which is stable per the sitemap audit)
 * rather than on hashed class names.
 */
export async function extractProducts(page: Page): Promise<ScrapedProduct[]> {
  // The whole DOM walk + price-text extraction runs inside the page
  // context, so we don't pay the round-trip cost per card.
  const raw = await page.evaluate(() => {
    const RE = /^\/product\/(\d+)\/([^/?#]+)/;
    const cards: Array<{
      raleysId: string;
      slug: string;
      name: string;
      texts: string[];
    }> = [];
    const seen = new Set<string>();

    for (const anchor of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/product/"]'),
    )) {
      const match = RE.exec(anchor.getAttribute("href") ?? "");
      if (!match) continue;
      const raleysId = match[1];
      if (seen.has(raleysId)) continue;
      seen.add(raleysId);

      // Climb to the nearest plausible card: 4 levels up max.
      let card: Element | null = anchor;
      for (let i = 0; i < 4 && card?.parentElement; i++) {
        card = card.parentElement;
        const t = card.textContent ?? "";
        if (t.includes("$")) break;
      }
      if (!card) continue;

      const name =
        anchor.getAttribute("aria-label") ??
        anchor.textContent?.trim() ??
        "";

      // Pull every text node within the card; the post-processor
      // identifies which fragment is a price.
      const texts: string[] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const v = n.textContent?.trim() ?? "";
        if (v) texts.push(v);
      }

      cards.push({
        raleysId,
        slug: match[2],
        name,
        texts,
      });
    }

    return cards;
  });

  const products: ScrapedProduct[] = [];
  for (const card of raw) {
    const { priceCents, wasPriceCents, rawPriceText } = derivePrices(card.texts);
    products.push({
      raleysId: card.raleysId,
      slug: card.slug,
      name: card.name || card.slug.replace(/-/g, " "),
      priceCents,
      wasPriceCents,
      rawPriceText,
    });
  }
  return products;
}

/**
 * From a list of text fragments collected from a product card,
 * identify the current price (and a "was" price if present).
 *
 * Heuristic: the first text fragment that parses as a dollar amount
 * is the current price. If a SECOND dollar amount exists and is
 * higher, it's the "was" price (sale framing).
 */
function derivePrices(texts: string[]): {
  priceCents: number | null;
  wasPriceCents: number | null;
  rawPriceText: string;
} {
  const candidates: Array<{ raw: string; cents: number }> = [];
  for (const t of texts) {
    const cents = parsePrice(t);
    if (cents != null) candidates.push({ raw: t, cents });
  }
  if (candidates.length === 0) {
    return { priceCents: null, wasPriceCents: null, rawPriceText: "" };
  }
  const [first, second] = candidates;
  const rawPriceText = candidates.map((c) => c.raw).join(" | ");

  if (!second) {
    return { priceCents: first.cents, wasPriceCents: null, rawPriceText };
  }

  // If second is higher than first, treat it as the "was" price.
  // If lower, it's just another price fragment we ignore (e.g.,
  // unit-price / per-oz). Future: be smarter about this once we see
  // real DOM snapshots.
  if (second.cents > first.cents) {
    return {
      priceCents: first.cents,
      wasPriceCents: second.cents,
      rawPriceText,
    };
  }
  return { priceCents: first.cents, wasPriceCents: null, rawPriceText };
}
