/**
 * Database-backed DealsRepo. Reads from the product_deal_scores view
 * defined in drizzle/migrations/0001_product_deal_scores_view.sql,
 * joined to stores + products.
 *
 * Imported lazily by `repo.ts` so the fixture path doesn't pull in
 * the Neon driver. Only loaded when BEERBUDDY_DEALS_SOURCE="db".
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { priceEvents, products, stores as storesTable } from "@/lib/db/schema";
import type {
  Deal,
  DealWithStore,
  DealsResult,
  Store,
} from "../deals";
import type { DealsRepo } from "./repo";

const TOP_N = 200;

interface DealRow {
  canonicalProductId: number;
  storeId: string;
  currentPriceCents: number;
  wasPriceCents: number | null;
  observedAt: Date;
  medianCents: number | null;
  dealScorePct: number | null;
  brand: string;
  productName: string;
  packSize: number;
  packUnitMl: number;
  style: string | null;
}

function selectDealRows() {
  // The view name is unquoted lower-case to match drizzle-kit conventions.
  return db
    .select({
      canonicalProductId: sql<number>`pds.canonical_product_id`,
      storeId: sql<string>`pds.store_id`,
      currentPriceCents: sql<number>`pds.current_price_cents`,
      wasPriceCents: sql<number | null>`pds.was_price_cents`,
      observedAt: sql<Date>`pds.observed_at`,
      medianCents: sql<number | null>`pds.median_90d_cents`,
      dealScorePct: sql<number | null>`pds.deal_score_pct`,
      brand: products.brand,
      productName: products.name,
      packSize: products.packSize,
      packUnitMl: products.packUnitMl,
      style: products.style,
    })
    .from(sql`product_deal_scores AS pds`)
    .innerJoin(products, eq(products.id, sql`pds.canonical_product_id`))
    .innerJoin(storesTable, eq(storesTable.id, sql`pds.store_id`));
}

function rowToDeal(row: DealRow, storeName: string, storeCity: string): Deal {
  return {
    id: `${row.storeId}-${row.canonicalProductId}`,
    brand: row.brand || null,
    name: row.productName,
    packCount: row.packSize > 1 ? row.packSize : null,
    packUnitMl: row.packUnitMl > 0 ? row.packUnitMl : null,
    priceCents: row.currentPriceCents,
    regularPriceCents: row.wasPriceCents,
    discountPct: row.dealScorePct,
    storeId: row.storeId,
    storeName,
    storeCity,
    observedAt: row.observedAt.toISOString(),
  };
}

export const dbDealsRepo: DealsRepo = {
  async getDeals(): Promise<DealsResult> {
    const [rows, storeRows] = await Promise.all([
      selectDealRows().limit(TOP_N),
      db.select().from(storesTable),
    ]);
    const storeById = new Map(storeRows.map((s) => [s.id, s]));
    const deals: Deal[] = rows.map((r) => {
      const s = storeById.get(r.storeId);
      return rowToDeal(r, s?.name ?? r.storeId, s?.city ?? "");
    });
    deals.sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0));
    const counts: Record<string, number> & { total: number } = { total: deals.length };
    for (const d of deals) {
      counts[d.storeId] = (counts[d.storeId] ?? 0) + 1;
    }
    const stores: Store[] = storeRows.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      address: s.address,
      lat: s.lat,
      lon: s.lon,
    }));
    return {
      generatedAt: new Date().toISOString(),
      stores,
      counts,
      deals,
    };
  },

  async getDealById(id: string): Promise<DealWithStore | null> {
    const dash = id.lastIndexOf("-");
    if (dash <= 0) return null;
    const storeId = id.slice(0, dash);
    const canonicalProductId = Number.parseInt(id.slice(dash + 1), 10);
    if (!Number.isFinite(canonicalProductId)) return null;

    const rows = await selectDealRows()
      .where(eq(priceEvents.canonicalProductId, canonicalProductId))
      .limit(50);
    const row = rows.find((r) => r.storeId === storeId);
    if (!row) return null;

    const [storeRow] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1);
    if (!storeRow) return null;

    const store: Store = {
      id: storeRow.id,
      name: storeRow.name,
      city: storeRow.city,
      address: storeRow.address,
      lat: storeRow.lat,
      lon: storeRow.lon,
    };
    const deal = rowToDeal(row, storeRow.name, storeRow.city);
    const { storeId: _id, storeName: _name, storeCity: _city, ...rest } = deal;
    return { ...rest, store };
  },
};
