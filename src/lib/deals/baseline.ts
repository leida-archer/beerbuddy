/**
 * 90-day baseline + deal-score calculation.
 *
 * The product differentiator (per README): "every price is judged
 * against its 90-day median for that product." Cross-store — a beer
 * that's chronically cheap at the warehouse doesn't outscore a real
 * sale on a beer that's normally pricier elsewhere.
 *
 * Pure helpers live here; the SQL view that uses them lives in
 * `drizzle/migrations/0001_product_deal_scores_view.sql`. The view
 * is the production read path; this module's median() is used by
 * tests and by the worker that backfills historical scores.
 */

export type DealScoreRow = {
  canonicalProductId: number;
  storeId: string;
  currentPriceCents: number;
  median90dCents: number | null;
  dealScorePct: number | null;
};

/**
 * Compute the median of a numeric array. Returns null for empty input
 * so callers can distinguish "no history" from "median is zero".
 * Mutates a copy, not the input, so call sites stay pure.
 *
 * For even-length inputs, uses the standard mean-of-the-middle-two
 * definition. Integer cents in, fractional out — caller rounds.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >>> 1;
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Deal score = how far below the 90-day median is the current price,
 * expressed as a percentage of the median. Range: 0..100. Higher is
 * a better deal. Pricier-than-median returns 0 (we never go negative
 * — a higher-than-baseline price is "not a deal", not a "bad deal").
 *
 * Returns null when there's no baseline (no history) so the UI can
 * render "limited history" instead of pretending we have a verdict.
 */
export function dealScorePct(
  currentPriceCents: number,
  median90dCents: number | null,
): number | null {
  if (median90dCents == null || median90dCents <= 0) return null;
  if (!Number.isFinite(currentPriceCents) || currentPriceCents <= 0) return null;
  if (currentPriceCents >= median90dCents) return 0;
  return Math.round((100 * (median90dCents - currentPriceCents)) / median90dCents);
}

/**
 * Compose median + dealScorePct for one (product, store) — used by
 * the backfill worker that seeds the matview on first launch (before
 * the daily refresh job catches up).
 *
 * `history` is the full 90-day window of priceCents observations for
 * this canonical product across ALL stores. `currentPriceCents` is
 * the latest observation at this specific store.
 */
export function computeRow(input: {
  canonicalProductId: number;
  storeId: string;
  history: number[];
  currentPriceCents: number;
}): DealScoreRow {
  const med = median(input.history);
  const rounded = med == null ? null : Math.round(med);
  return {
    canonicalProductId: input.canonicalProductId,
    storeId: input.storeId,
    currentPriceCents: input.currentPriceCents,
    median90dCents: rounded,
    dealScorePct: dealScorePct(input.currentPriceCents, rounded),
  };
}
