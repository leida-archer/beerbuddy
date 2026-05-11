/**
 * 90-day price-trend graph stub.
 *
 * Placeholder for the per-product price chart that lands in Week 6,
 * once we've accrued ≥30 days of price_events history. Until then we
 * render an honest "limited history" message — never a fake sparkline
 * extrapolated from the single current observation (would violate the
 * Zero User Labor principle's "set expectations" rule).
 *
 * When the DealsRepo grows a `getDealHistory(canonicalProductId)`
 * method this stub becomes the real chart. The shape is set so that
 * swap is a one-file change.
 */

interface Props {
  currentPriceCents: number;
  regularPriceCents: number | null;
}

export function PriceTrendStub({
  currentPriceCents,
  regularPriceCents,
}: Props) {
  // When we don't have history yet, anchor the placeholder visually
  // with the two facts we DO have: current price and the regular
  // strikethrough (if any). The horizontal rule between them sketches
  // the trajectory without inventing data.
  const hasComparison =
    regularPriceCents != null && regularPriceCents !== currentPriceCents;

  return (
    <section className="mt-5 pt-4 border-t border-rule">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted mb-2">
        90-day price trend
      </p>
      <div className="border border-dashed border-rule rounded-sm p-4 text-center">
        {hasComparison ? (
          <p className="font-mono text-[11px] text-muted leading-relaxed">
            ${(regularPriceCents! / 100).toFixed(2)} regular ·{" "}
            <span className="text-warm font-semibold">
              ${(currentPriceCents / 100).toFixed(2)} now
            </span>
            <br />
            <span className="text-[10px]">
              Limited history — sparkline lands when we&rsquo;ve tracked this
              product for 30+ days.
            </span>
          </p>
        ) : (
          <p className="font-mono text-[11px] text-muted leading-relaxed">
            Building price history.
            <br />
            <span className="text-[10px]">
              The 90-day median + trend chart will appear after a few weeks of
              tracking.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
