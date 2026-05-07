/**
 * Server-side data layer for the deal-list view.
 *
 * Currently reads from the Raley's fixture file produced by
 * `bun run fixture:raleys`. When the matview lands (Week 5), this
 * function swaps to a DB query against `product_deal_scores`.
 *
 * Caller surface (Deal[] shape) is stable across that swap.
 */

import fixture from "@/data/fixtures/deals.json";

export interface Deal {
  id: string;
  brand: string | null;
  name: string;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  discountPct: number | null;
  storeId: string;
  storeName: string;
  storeCity: string;
  observedAt: string;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lon: number;
}

export interface DealsResult {
  generatedAt: string;
  stores: Store[];
  counts: Record<string, number> & { total: number };
  deals: Deal[];
}

/**
 * Get the deal list. Source: combined-fixture file today, DB matview
 * tomorrow. Already sorted "best deals first" by the fixture builder
 * (largest discount %, then cheapest, then by name).
 */
export async function getDeals(): Promise<DealsResult> {
  return {
    generatedAt: fixture.generatedAt,
    stores: fixture.stores,
    counts: fixture.counts,
    deals: fixture.deals,
  };
}

/**
 * Format integer cents → "$X.XX" string. UI helper, kept here so
 * server and client renders agree on the format.
 */
export function formatPrice(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Pretty pack-size label. "12-pack 12oz cans" when ml is present;
 * "12-pack" otherwise; "single" for packCount=1.
 */
export function formatPack(packCount: number | null, packUnitMl: number | null): string {
  if (packCount == null || packCount <= 0) return "";
  if (packCount === 1) {
    if (packUnitMl) return `${formatMl(packUnitMl)}`;
    return "single";
  }
  if (packUnitMl) {
    return `${packCount}-pack · ${formatMl(packUnitMl)}`;
  }
  return `${packCount}-pack`;
}

function formatMl(ml: number): string {
  // Map common bottle/can sizes back to their familiar oz labels.
  if (Math.abs(ml - 355) < 5) return "12oz";
  if (Math.abs(ml - 473) < 5) return "16oz";
  if (Math.abs(ml - 568) < 8) return "19.2oz";
  if (Math.abs(ml - 740) < 10) return "25oz";
  if (Math.abs(ml - 750) < 5) return "750mL";
  return `${ml}mL`;
}

/**
 * Render a relative-time string. Per /plan-design-review Issue 5A,
 * every visible price has a "Updated X ago" timestamp — sets honest
 * expectations about freshness.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const observed = new Date(iso);
  const diffMs = now.getTime() - observed.getTime();
  const diffSec = Math.max(0, Math.round(diffMs / 1000));
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.round(diffDay / 7)}w ago`;
  return `${Math.round(diffDay / 30)}mo ago`;
}

/**
 * Deal joined with its full Store record. Drops the legacy
 * denormalized fields (storeId/storeName/storeCity) so the detail
 * page has exactly one canonical access path: deal.store.<field>.
 */
export interface DealWithStore
  extends Omit<Deal, "storeId" | "storeName" | "storeCity"> {
  store: Store;
}

/**
 * Look up a single deal by id, joined with its full Store record.
 * Returns null when the deal isn't found OR when its storeId
 * doesn't resolve to a known store (defensive — shouldn't happen
 * given the fixture invariant).
 */
export async function getDealById(id: string): Promise<DealWithStore | null> {
  const { stores, deals } = await getDeals();
  const deal = deals.find((d) => d.id === id);
  if (!deal) return null;
  const store = stores.find((s) => s.id === deal.storeId);
  if (!store) return null;
  const { storeId: _id, storeName: _name, storeCity: _city, ...rest } = deal;
  return { ...rest, store };
}

/**
 * Price per fluid ounce, in dollars. Returns null when the deal
 * lacks the pack info needed to compute it (single-bottle deals,
 * unknown pack size, etc.). The /deals oz-sort consumes this
 * monotonically, so sort order is identical whether the unit is
 * cents/oz or dollars/oz; we use dollars/oz so the detail page
 * can render `${ppoz.toFixed(2)}/oz` directly.
 */
export function pricePerOz(deal: {
  priceCents: number;
  packCount: number | null;
  packUnitMl: number | null;
}): number | null {
  if (
    !deal.packCount ||
    !deal.packUnitMl ||
    deal.packCount <= 0 ||
    deal.packUnitMl <= 0
  ) {
    return null;
  }
  const totalOz = (deal.packCount * deal.packUnitMl) / 29.5735;
  return deal.priceCents / 100 / totalOz;
}
