/**
 * Refresh Grocery Outlet rows in the deals fixture in isolation.
 *
 * Background: when GO runs at the end of the sequential
 * `bun run fixtures` pipeline (after raleys + bevmo + holiday +
 * savemart Playwright contexts), its extraction silently returns 0 —
 * the same class of bug the build-fixtures.ts comment warns about for
 * BevMo when chains run in parallel. The GO adapter works fine in
 * isolation (this script proves it: ~86 products in 15 sec).
 *
 * Pending a proper fix to build-fixtures (subprocess-per-chain, or
 * reordering, or per-chain bun run), this script patches GO rows into
 * the existing fixture without touching other chains.
 *
 * Usage:
 *   bun run scripts/refresh-grocery-outlet.ts
 */

import fs from "node:fs/promises";
import path from "node:path";

import { extractGroceryOutletBeerProducts } from "@/lib/ingest/adapters/grocery-outlet/extract";

const FIXTURE_PATH = "src/data/fixtures/deals.json";
const STORE = {
  id: "grocery-outlet-grass-valley",
  name: "Grocery Outlet",
  city: "Grass Valley",
};

interface DealRow {
  id: string;
  storeId: string;
  storeName: string;
  storeCity: string;
  brand: string | null;
  name: string;
  upc: string | null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  discounted: boolean;
  discountPct: number | null;
  observedAt: string;
}

async function main() {
  const observedAt = new Date().toISOString();
  console.log(`[refresh-go] extracting at ${observedAt}...`);
  const products = await extractGroceryOutletBeerProducts();
  console.log(`[refresh-go] extracted ${products.length} products`);

  if (products.length === 0) {
    console.error("[refresh-go] extraction returned 0 — aborting, no fixture change");
    process.exit(1);
  }

  const newGoRows: DealRow[] = products.map((p) => {
    const reg = p.regularPriceCents;
    const discountPct =
      reg != null && reg > p.priceCents
        ? Math.round(((reg - p.priceCents) / reg) * 100)
        : null;
    return {
      id: `${STORE.id}-${p.groceryOutletId}`,
      storeId: STORE.id,
      storeName: STORE.name,
      storeCity: STORE.city,
      brand: p.brand,
      name: p.name,
      upc: null,
      packCount: p.packCount,
      packUnitMl: p.packUnitMl,
      priceCents: p.priceCents,
      regularPriceCents: p.regularPriceCents,
      discounted: reg != null && reg > p.priceCents,
      discountPct,
      observedAt,
    };
  });

  const fixturePath = path.resolve(process.cwd(), FIXTURE_PATH);
  const raw = await fs.readFile(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as {
    generatedAt: string;
    stores: unknown[];
    counts: Record<string, number>;
    deals: DealRow[];
  };

  const otherDeals = parsed.deals.filter((d) => d.storeId !== STORE.id);
  const allDeals = [...otherDeals, ...newGoRows];

  allDeals.sort((a, b) => {
    const da = a.discountPct ?? 0;
    const db = b.discountPct ?? 0;
    if (da !== db) return db - da;
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    return a.name.localeCompare(b.name);
  });

  parsed.counts.groceryOutlet = newGoRows.length;
  parsed.counts.total = allDeals.length;
  parsed.deals = allDeals;

  await fs.writeFile(fixturePath, JSON.stringify(parsed, null, 2));
  console.log(
    `[refresh-go] DONE — patched ${newGoRows.length} GO rows into fixture (total now ${parsed.counts.total})`,
  );
}

main().catch((err) => {
  console.error("[refresh-go] FATAL:", err);
  process.exit(1);
});
