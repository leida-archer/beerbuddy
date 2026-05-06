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

export const metadata: Metadata = {
  title: "Deals · BeerBuddy",
  description: "Best beer deals at chain stores in Nevada County, CA — this week.",
};

type SortKey = "best" | "cheap" | "oz";

interface Filters {
  sort: SortKey;
  pack: string | null;
  style: string | null;
}

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
  const filters: Filters = {
    sort: (asString(sp.sort) as SortKey) ?? "best",
    pack: asString(sp.pack),
    style: asString(sp.style),
  };

  const { generatedAt, stores, deals: allDeals } = await getDeals();
  const deals = applyFilters(allDeals, filters);
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

      <SortRow filters={filters} />
      <FilterChips filters={filters} />

      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted text-center my-4 flex items-center gap-2 justify-center">
        <span className="h-px bg-rule w-10 inline-block" />
        {deals.length === 0 ? "No deals match your filters" : "This week's deals"}
        <span className="h-px bg-rule w-10 inline-block" />
      </p>

      {deals.length === 0 ? (
        <EmptyResults filters={filters} />
      ) : (
        <ol className="m-0 p-0 list-none">
          {deals.map((deal, i) => (
            <li key={deal.id}>
              <DealCard
                deal={deal}
                now={now}
                isBest={
                  i === 0 &&
                  filters.sort === "best" &&
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

function SortRow({ filters }: { filters: Filters }) {
  return (
    <div className="flex items-center justify-between mb-3 py-1 gap-2">
      <span className="text-[12px] text-muted shrink-0">Sort</span>
      <div className="flex gap-1.5 overflow-x-auto">
        {SORT_OPTIONS.map((opt) => {
          const active = filters.sort === opt.key;
          const href = buildHref(filters, "sort", opt.key === "best" ? null : opt.key);
          return (
            <Link
              key={opt.key}
              href={href}
              prefetch={false}
              className={`font-body text-[13px] font-medium rounded-sm px-3 py-1.5 min-h-8 whitespace-nowrap border transition-colors duration-micro ease-settle ${
                active
                  ? "bg-ink text-bg border-ink"
                  : "bg-transparent text-ink border-rule hover:bg-bg-soft hover:border-ink"
              }`}
              aria-current={active ? "true" : undefined}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FilterChips({ filters }: { filters: Filters }) {
  return (
    <div className="space-y-1.5 mb-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        <ChipLink
          label="All packs"
          active={!filters.pack}
          href={buildHref(filters, "pack", null)}
        />
        {PACK_CHIPS.map((pack) => (
          <ChipLink
            key={pack}
            label={`${pack}-pack`}
            active={filters.pack === pack}
            href={buildHref(filters, "pack", filters.pack === pack ? null : pack)}
          />
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        <ChipLink
          label="All styles"
          active={!filters.style}
          href={buildHref(filters, "style", null)}
        />
        {STYLE_CHIPS.map((style) => (
          <ChipLink
            key={style.key}
            label={style.label}
            active={filters.style === style.key}
            href={buildHref(
              filters,
              "style",
              filters.style === style.key ? null : style.key,
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ChipLink({
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

function EmptyResults({ filters }: { filters: Filters }) {
  return (
    <div className="text-center py-12">
      <p className="text-muted text-[14px] mb-4">
        No deals match{" "}
        {[
          filters.pack ? `${filters.pack}-pack` : null,
          filters.style ? STYLE_CHIPS.find((s) => s.key === filters.style)?.label : null,
        ]
          .filter(Boolean)
          .join(" + ")}
        .
      </p>
      <Link
        href="/deals"
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

function asString(v: string | string[] | undefined): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && v[0]) return v[0];
  return null;
}

/** Build a /deals href that updates one filter param. value=null clears it. */
function buildHref(filters: Filters, key: keyof Filters, value: string | null): string {
  const sp = new URLSearchParams();
  const apply = (k: keyof Filters, v: string | null) => {
    if (!v) return;
    if (k === "sort" && v === "best") return; // default; omit from URL
    sp.set(k, v);
  };
  apply("sort", key === "sort" ? value : filters.sort);
  apply("pack", key === "pack" ? value : filters.pack);
  apply("style", key === "style" ? value : filters.style);
  const q = sp.toString();
  return q ? `/deals?${q}` : "/deals";
}

function applyFilters(deals: Deal[], filters: Filters): Deal[] {
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
