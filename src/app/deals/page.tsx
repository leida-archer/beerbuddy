/**
 * /deals — the deal-list view.
 *
 * Implements the Golden Hour design system (DESIGN.md) and the
 * structural specs locked in /plan-design-review:
 *
 *   - Single-column layout, max-width 480px (Issue 7A)
 *   - BEST DEAL eyebrow as typography only, no chrome (Issue 1A)
 *   - Sort dropdown + filter chip row separation (Issue 2B)
 *   - Limited-history banner above the list (Issue 4A)
 *   - "Updated X ago" timestamp per card (Issue 5A)
 *   - Static graph deferred — list page only here
 */

import type { Metadata } from "next";

import {
  formatPack,
  formatPrice,
  formatRelative,
  getDeals,
  type Deal,
} from "@/lib/deals";

export const metadata: Metadata = {
  title: "Deals · BeerBuddy",
  description: "Best beer deals at chain stores in Nevada County, CA — this week.",
};

export default async function DealsPage() {
  const { generatedAt, store, deals } = await getDeals();
  const now = new Date();

  return (
    <main className="mx-auto max-w-[480px] min-h-screen px-4 py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-3 mb-4">
        <h1 className="font-display font-medium text-2xl tracking-tight">
          95945 · Grass Valley
        </h1>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          {store.name} · {deals.length} deals
        </div>
      </header>

      <Banner />

      <SortRow />
      <FilterChips />

      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted text-center my-4 flex items-center gap-2 justify-center">
        <span className="h-px bg-rule w-10 inline-block" />
        This week&rsquo;s deals
        <span className="h-px bg-rule w-10 inline-block" />
      </p>

      <ol className="m-0 p-0 list-none">
        {deals.map((deal, i) => (
          <li key={deal.id}>
            <DealCard deal={deal} now={now} isBest={i === 0 && deal.discountPct != null && deal.discountPct >= 10} />
          </li>
        ))}
      </ol>

      <footer className="mt-12 pt-4 border-t border-rule text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        Generated {formatRelative(generatedAt, now)} ·{" "}
        prices may vary at point of purchase
      </footer>
    </main>
  );
}

function Banner() {
  return (
    <div className="border border-cool/40 bg-cool-soft text-ink rounded-md py-3 px-4 mb-4 flex items-start gap-2 text-[13px] leading-relaxed">
      <span className="text-cool font-bold flex-shrink-0">ⓘ</span>
      <span>
        Building the price database. Most deal calls limited until July.
      </span>
    </div>
  );
}

function SortRow() {
  return (
    <div className="flex items-center justify-between mb-3 py-1">
      <span className="text-[12px] text-muted">Sort</span>
      <button
        type="button"
        className="font-body text-[13px] font-medium text-ink border border-ink rounded-sm px-3 py-1.5 bg-transparent inline-flex items-center"
      >
        Best deal
        <span className="text-muted ml-1">▾</span>
      </button>
    </div>
  );
}

function FilterChips() {
  const chips = ["All", "12-pack", "30-pack", "IPA", "Lager"];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-4 px-4">
      {chips.map((label, i) => (
        <button
          key={label}
          type="button"
          aria-pressed={i === 0}
          className={`font-body text-[13px] font-medium rounded-sm px-3.5 py-1.5 min-h-8 whitespace-nowrap border transition-colors duration-micro ease-settle ${
            i === 0
              ? "bg-ink text-bg border-ink"
              : "bg-transparent text-ink border-rule hover:bg-bg-soft hover:border-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DealCard({ deal, now, isBest }: { deal: Deal; now: Date; isBest: boolean }) {
  const wasPriceDifferent =
    deal.regularPriceCents != null && deal.regularPriceCents !== deal.priceCents;

  return (
    <article
      className={`py-3.5 ${isBest ? "border-l-2 border-warm pl-3.5 -ml-3.5" : ""} ${
        isBest ? "" : "border-b border-rule-soft"
      }`}
    >
      {isBest && deal.discountPct != null && (
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold text-warm mb-1.5">
          Best deal
          <span className="text-warm">
            <span className="mx-1.5">·</span>
            {deal.discountPct}% off
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-[16px] leading-tight tracking-tight truncate">
            {deal.name}
          </h3>
          <p className="text-[11px] text-muted mt-0.5">
            {deal.brand && <span>{deal.brand}</span>}
            {deal.brand && deal.packCount && <span className="mx-1">·</span>}
            {formatPack(deal.packCount, deal.packUnitMl)}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono font-semibold text-[18px] tracking-tight">
            {formatPrice(deal.priceCents)}
          </div>
          {wasPriceDifferent && deal.regularPriceCents != null && (
            <div className="font-mono text-[11px] text-muted line-through">
              {formatPrice(deal.regularPriceCents)}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-rule text-[11px] text-muted">
        <span>
          <span className="text-cool font-medium">{deal.storeName}</span>
          <span className="mx-1">·</span>
          {deal.storeCity}
        </span>
        <span className="font-mono tracking-wide">
          {formatRelative(deal.observedAt, now)}
        </span>
      </div>
    </article>
  );
}
