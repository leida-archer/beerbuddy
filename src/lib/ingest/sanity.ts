/**
 * Sanity bounds — reject obviously-wrong price observations.
 *
 * Locked in /plan-eng-review Issue 3A: any new price > 5x or < 0.2x
 * the prior price for the same (store, product) is treated as a
 * scraping glitch and routed to quarantine_events instead of
 * persisting to price_events.
 *
 * The first observation for a product (no prior) is always allowed
 * through — there's no baseline yet. Subsequent glitches are caught.
 */

export const SANITY_HIGH_MULTIPLIER = 5;
export const SANITY_LOW_MULTIPLIER = 0.2;

export type SanityVerdict =
  | { ok: true }
  | { ok: false; reason: "sanity_bounds_high" | "sanity_bounds_low" };

export function isPriceSane(
  priorPriceCents: number | null | undefined,
  nextPriceCents: number,
): SanityVerdict {
  if (!Number.isFinite(nextPriceCents) || nextPriceCents <= 0) {
    return { ok: false, reason: "sanity_bounds_low" };
  }
  if (priorPriceCents == null) {
    // No history → can't be a glitch relative to history.
    return { ok: true };
  }
  if (!Number.isFinite(priorPriceCents) || priorPriceCents <= 0) {
    // Bad prior; don't reject the next one on its account.
    return { ok: true };
  }
  if (nextPriceCents > priorPriceCents * SANITY_HIGH_MULTIPLIER) {
    return { ok: false, reason: "sanity_bounds_high" };
  }
  if (nextPriceCents < priorPriceCents * SANITY_LOW_MULTIPLIER) {
    return { ok: false, reason: "sanity_bounds_low" };
  }
  return { ok: true };
}
