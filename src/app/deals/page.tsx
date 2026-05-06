/**
 * /deals — the deal-list view.
 *
 * Implements the Golden Hour design system (DESIGN.md) and the
 * structural specs locked in /plan-design-review.
 *
 * Sort + Filter are URL-param-driven (no client JS):
 *
 *   /deals                                 default: best-deal sort, all packs, all styles
 *   /deals?sort=cheap                      sort by absolute price asc
 *   /deals?sort=oz                         sort by price-per-oz asc
 *   /deals?pack=12                         only 12-packs
 *   /deals?style=ipa                       only items whose name matches "IPA"
 *   /deals?sort=cheap&pack=24&style=lager  combined
 *   /deals?fp=open                          open the inline filter picker
 *
 * Each chip / sort button is a <Link> that toggles its param. Server
 * filters + sorts on each request. URLs are shareable.
 */

import Link from "next/link";
import type { Metadata } from "next";

import {
  formatPack,
  formatPrice,
  formatRelative,
  getDeals,
  type Deal,
} from "@/lib/deals";
import { buildHref, parsePageState, type PageState, type SortKey } from "./url";

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
const STYLE_CHIPS: Array<{ key: string; label: string }> = [
  { key: "ipa", label: "IPA" },
  { key: "lager", label: "Lager" },
  { key: "stout", label: "Stout" },
];

export default async function DealsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const state = parsePageState(sp);

  const { generatedAt, stores, deals: allDeals } = await getDeals();
  const deals = applyFilters(allDeals, state);
  const now = new Date();
  const storeNames = stores.map((s) => s.name).join(" · ");

  return (
    <main className="mx-auto max-w-[480px] min-h-screen px-4 py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-3 mb-4 gap-3">
        <h1 className="font-display font-medium text-2xl tracking-tight">
          95945 · Grass Valley
        </h1>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted text-right">
          {storeNames}
          <br />
          {deals.length} of {allDeals.length} deals
        </div>
      </header>

      <Banner />

      <ActiveChipRow state={state} />
      <FilterPicker state={state} />

      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted text-center my-4 flex items-center gap-2 justify-center">
        <span className="h-px bg-rule w-10 inline-block" />
        {deals.length === 0 ? "No deals match your filters" : "This week's deals"}
        <span className="h-px bg-rule w-10 inline-block" />
      </p>

      {deals.length === 0 ? (
        <EmptyResults state={state} />
      ) : (
        <ol className="m-0 p-0 list-none">
          {deals.map((deal, i) => (
            <li key={deal.id}>
              <DealCard
                deal={deal}
                now={now}
                isBest={
                  i === 0 &&
                  state.sort === "best" &&
                  deal.discountPct != null &&
                  deal.discountPct >= 10
                }
              />
            </li>
          ))}
        </ol>
      )}

      <section className="mt-10 pt-4 border-t border-rule">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted text-center mb-3">
          More chains coming
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-muted">
          <li>· Grocery Outlet GV</li>
          <li>· SPD Grass Valley</li>
          <li>· Walmart Grass Valley</li>
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

      {/* Style filter chip (with ×) when set */}
      {state.style && (
        <ActiveFilterChip
          label={STYLE_CHIPS.find((s) => s.key === state.style)?.label ?? state.style}
          state={state}
          clearChange={{ style: null }}
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

function FilterPicker({ state }: { state: PageState }) {
  if (!state.pickerOpen) return null;
  return (
    <section className="border-y border-rule py-4 mb-4 space-y-4">
      <PickerSection heading="Sort">
        {SORT_OPTIONS.map((opt) => (
          <PickerChip
            key={opt.key}
            label={opt.label}
            active={state.sort === opt.key}
            href={buildHref(state, { sort: opt.key })}
          />
        ))}
      </PickerSection>

      <PickerSection heading="Pack">
        <PickerChip
          label="All"
          active={!state.pack}
          href={buildHref(state, { pack: null })}
        />
        {PACK_CHIPS.map((pack) => (
          <PickerChip
            key={pack}
            label={`${pack}-pack`}
            active={state.pack === pack}
            href={buildHref(state, {
              pack: state.pack === pack ? null : pack,
            })}
          />
        ))}
      </PickerSection>

      <PickerSection heading="Style">
        <PickerChip
          label="All"
          active={!state.style}
          href={buildHref(state, { style: null })}
        />
        {STYLE_CHIPS.map((style) => (
          <PickerChip
            key={style.key}
            label={style.label}
            active={state.style === style.key}
            href={buildHref(state, {
              style: state.style === style.key ? null : style.key,
            })}
          />
        ))}
      </PickerSection>
    </section>
  );
}

function PickerSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-2">
        {heading}
      </h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PickerChip({
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
      className={`font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border transition-colors duration-micro ease-settle ${
        active
          ? "bg-ink text-bg border-ink"
          : "bg-transparent text-ink border-rule hover:bg-bg-soft hover:border-ink"
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
        No deals match{" "}
        {[
          state.pack ? `${state.pack}-pack` : null,
          state.style ? STYLE_CHIPS.find((s) => s.key === state.style)?.label : null,
        ]
          .filter(Boolean)
          .join(" + ")}
        .
      </p>
      <Link
        href={buildHref(state, { pack: null, style: null, sort: "best", pickerOpen: true })}
        className="inline-block font-body text-[14px] font-medium text-ink border border-ink rounded-sm px-4 py-2 hover:bg-bg-soft transition-colors"
      >
        Clear filters
      </Link>
    </div>
  );
}

function DealCard({
  deal,
  now,
  isBest,
}: {
  deal: Deal;
  now: Date;
  isBest: boolean;
}) {
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

// ─── helpers ────────────────────────────────────────────────────────

function applyFilters(deals: Deal[], filters: PageState): Deal[] {
  let out = deals;

  if (filters.pack) {
    const n = Number.parseInt(filters.pack, 10);
    if (Number.isFinite(n)) {
      out = out.filter((d) => d.packCount === n);
    }
  }

  if (filters.style) {
    const needle = filters.style.toLowerCase();
    out = out.filter((d) => (d.name ?? "").toLowerCase().includes(needle));
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

function pricePerOz(d: Deal): number | null {
  if (d.packCount == null || d.packUnitMl == null || d.packCount <= 0 || d.packUnitMl <= 0) {
    return null;
  }
  const totalMl = d.packCount * d.packUnitMl;
  const totalOz = totalMl / 29.5735;
  if (totalOz <= 0) return null;
  return d.priceCents / totalOz;
}
