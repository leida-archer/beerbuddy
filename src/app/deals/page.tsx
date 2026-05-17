/**
 * /deals — the deal-list view.
 *
 * Implements the Golden Hour design system (DESIGN.md) and the
 * structural specs locked in /plan-design-review.
 *
 * Sort + Filter are URL-param-driven (no client JS):
 *
 *   /deals                          default: best-deal sort, all packs
 *   /deals?sort=cheap               sort by absolute price asc
 *   /deals?sort=oz                  sort by price-per-oz asc
 *   /deals?pack=12                  only 12-packs
 *   /deals?sort=cheap&pack=24       combined
 *   /deals?fp=open                  open the inline filter picker
 *
 * Each chip / sort button is a <Link> that toggles its param. Server
 * filters + sorts on each request. URLs are shareable.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  formatPack,
  formatPrice,
  formatRelative,
  getDeals,
  pricePerOz,
  type Deal,
} from "@/lib/deals";
import { cityForZip, isValidZip } from "@/lib/geo/zip";
import { asString, buildDetailHref, buildHref, parsePageState, type PageState, type SortKey } from "./url";

export const metadata: Metadata = {
  title: "Deals · BeerBuddy",
  description: "Best beer deals at chain stores in Nevada County, CA — this week.",
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "best", label: "Best deal" },
  { key: "cheap", label: "Cheapest" },
  { key: "oz", label: "$/oz" },
];

const PACK_CHIPS = ["6", "12", "18", "24", "30"];

export default async function DealsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const rawZip = asString(sp.zip);

  if (!rawZip) redirect("/");
  if (!isValidZip(rawZip)) {
    redirect(`/?error=region&zip=${encodeURIComponent(rawZip)}`);
  }

  const state = parsePageState(sp);

  const { generatedAt, deals: allDeals } = await getDeals();
  const deals = applyFilters(allDeals, state);
  const now = new Date();

  return (
    <main className="mx-auto max-w-[480px] min-h-screen px-4 py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-3 mb-4 gap-3">
        <h1 className="font-display font-medium text-2xl tracking-tight">
          {state.zip} · {cityForZip(state.zip) ?? "Nevada County"}
        </h1>
        <Link
          href="/"
          prefetch={false}
          className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted text-right underline decoration-rule decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink"
        >
          Location: {state.zip}
        </Link>
      </header>

      <Banner />

      <ActiveChipRow state={state} />
      <FilterPickerRow state={state} />

      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted text-center my-4 flex items-center gap-2 justify-center">
        <span className="h-px bg-rule w-10 inline-block" />
        {deals.length === 0 ? "No deals match your filters" : "This week's deals"}
        <span className="h-px bg-rule w-10 inline-block" />
      </p>

      {deals.length === 0 ? (
        <EmptyResults state={state} />
      ) : (
        <ol className="m-0 p-0 list-none">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Link
                href={buildDetailHref(state, deal.id)}
                prefetch={false}
                className="block hover:bg-bg-soft transition-colors duration-micro ease-settle"
              >
                <DealCard deal={deal} now={now} />
              </Link>
            </li>
          ))}
        </ol>
      )}

      <section className="mt-10 pt-4 border-t border-rule">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted text-center mb-3">
          More chains coming
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-muted">
          <li>· SPD Grass Valley</li>
        </ul>
      </section>

      <footer className="mt-10 pt-4 border-t border-rule text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
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

function ActiveChipRow({ state }: { state: PageState }) {
  const sortLabel = SORT_OPTIONS.find((o) => o.key === state.sort)?.label ?? "Best deal";
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 py-1">
      {/* Sort chip — always visible. Clicking the chip body opens the picker. */}
      <Link
        href={buildHref(state, { pickerOpen: true })}
        prefetch={false}
        className="font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border bg-ink text-bg border-ink"
        aria-label={`Sort: ${sortLabel}. Tap to change.`}
      >
        Sort: {sortLabel}
      </Link>

      {/* Pack filter chip (with ×) when set */}
      {state.pack && (
        <ActiveFilterChip
          label={`${state.pack}-pack`}
          state={state}
          clearChange={{ pack: null }}
        />
      )}

      {/* Spacer pushes the +Filter/Done button to the right */}
      <div className="ml-auto" />

      {/* + Filter / Done toggle */}
      <Link
        href={buildHref(state, { pickerOpen: !state.pickerOpen })}
        prefetch={false}
        className="font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border bg-transparent text-ink border-ink hover:bg-bg-soft transition-colors duration-micro ease-settle"
      >
        {state.pickerOpen ? "Done" : "+ Filter"}
      </Link>
    </div>
  );
}

function ActiveFilterChip({
  label,
  state,
  clearChange,
}: {
  label: string;
  state: PageState;
  clearChange: Partial<PageState>;
}) {
  const removeHref = buildHref(state, clearChange);
  const openPickerHref = buildHref(state, { pickerOpen: true });
  return (
    <span className="inline-flex items-center rounded-sm bg-ink text-bg border border-ink overflow-hidden">
      <Link
        href={openPickerHref}
        prefetch={false}
        className="px-3 py-1.5 min-h-8 font-body text-[13px] font-medium leading-none flex items-center"
      >
        {label}
      </Link>
      <Link
        href={removeHref}
        prefetch={false}
        aria-label={`Remove ${label} filter`}
        className="px-2 py-1.5 min-h-8 leading-none text-[14px] flex items-center"
        style={{ color: "rgb(252 245 226 / 0.7)" /* text-bg/70 */ }}
      >
        ×
      </Link>
    </span>
  );
}

function FilterPickerRow({ state }: { state: PageState }) {
  if (!state.pickerOpen) return null;
  return (
    <div className="relative border-y border-rule mb-4 before:content-[''] before:absolute before:inset-y-px before:right-0 before:w-8 before:bg-gradient-to-r before:from-transparent before:to-bg before:pointer-events-none">
      <div
        className="overflow-x-auto whitespace-nowrap py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        <span className="inline-block pr-3.5" style={{ scrollSnapAlign: "start" }}>
          <AxisLabel>Sort</AxisLabel>
          {SORT_OPTIONS.map((opt) => (
            <PickerOption
              key={opt.key}
              label={opt.label}
              active={state.sort === opt.key}
              href={buildHref(state, { sort: opt.key })}
            />
          ))}
        </span>

        <span className="text-rule mr-2.5 py-2 inline-block">·</span>

        <span className="inline-block" style={{ scrollSnapAlign: "start" }}>
          <AxisLabel>Pack</AxisLabel>
          <PickerOption
            label="Any"
            active={!state.pack}
            href={buildHref(state, { pack: null })}
          />
          {PACK_CHIPS.map((pack) => (
            <PickerOption
              key={pack}
              label={pack}
              active={state.pack === pack}
              href={buildHref(state, {
                pack: state.pack === pack ? null : pack,
              })}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

function AxisLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mr-2">
      {children}
    </span>
  );
}

function PickerOption({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "true" : undefined}
      className={`inline-block font-body text-[14px] py-2 mr-2.5 transition-colors duration-micro ease-settle ${
        active
          ? "font-semibold text-ink underline decoration-warm decoration-2 underline-offset-4"
          : "text-ink hover:text-warm"
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyResults({ state }: { state: PageState }) {
  return (
    <div className="text-center py-12">
      <p className="text-muted text-[14px] mb-4">
        No deals match {state.pack ? `${state.pack}-pack` : "your filters"}.
      </p>
      <Link
        href={buildHref(state, { pack: null, sort: "best", pickerOpen: true })}
        className="inline-block font-body text-[14px] font-medium text-ink border border-ink rounded-sm px-4 py-2 hover:bg-bg-soft transition-colors"
      >
        Clear filters
      </Link>
    </div>
  );
}

/**
 * Show "Best deal" eyebrow on any card whose 90-day-baseline-relative
 * discount score is ≥30% — surfacing real deals regardless of sort
 * position. Stores with no history yet (discountPct == null) show a
 * neutral "Limited history" line so the user knows the deal is real
 * but the score isn't established.
 */
const BEST_DEAL_THRESHOLD_PCT = 30;

function DealCard({ deal, now }: { deal: Deal; now: Date }) {
  const isBest =
    deal.discountPct != null && deal.discountPct >= BEST_DEAL_THRESHOLD_PCT;
  const hasLimitedHistory = deal.discountPct == null;
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
      {hasLimitedHistory && (
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-1.5">
          Limited history
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

// ─── helpers ────────────────────────────────────────────────────────

function applyFilters(deals: Deal[], filters: PageState): Deal[] {
  let out = deals;

  if (filters.pack) {
    const n = Number.parseInt(filters.pack, 10);
    if (Number.isFinite(n)) {
      out = out.filter((d) => d.packCount === n);
    }
  }

  out = [...out].sort((a, b) => {
    if (filters.sort === "cheap") {
      return a.priceCents - b.priceCents;
    }
    if (filters.sort === "oz") {
      const oa = pricePerOz(a);
      const ob = pricePerOz(b);
      // null pushes to the end
      if (oa == null && ob == null) return a.priceCents - b.priceCents;
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa - ob;
    }
    // best deal: discount % desc, then cheapest, then by name
    const da = a.discountPct ?? 0;
    const db = b.discountPct ?? 0;
    if (da !== db) return db - da;
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    return a.name.localeCompare(b.name);
  });

  return out;
}

