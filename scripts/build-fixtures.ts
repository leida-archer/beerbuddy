/**
 * Build deal fixtures for all chains in one pass.
 *
 * Replaces the per-chain fixture scripts. Output:
 *
 *   src/data/fixtures/deals.json
 *
 * Combined snapshot of every chain's beer prices, sorted "best deals
 * first." Re-run with `bun run fixtures` to refresh.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { fetchBevmoBeerCatalog } from "@/lib/ingest/adapters/bevmo/catalog";
import { fetchRaleysBuildId } from "@/lib/ingest/adapters/raleys/buildId";
import { fetchProductJson } from "@/lib/ingest/adapters/raleys/productJson";
import { fetchRaleysProductSitemap } from "@/lib/ingest/adapters/raleys/sitemap";

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

const STORES = [
  { id: "raleys-grass-valley", name: "Raley's", city: "Grass Valley" },
  { id: "bevmo-auburn", name: "BevMo", city: "Auburn" },
];

async function buildRaleys(observedAt: string, sampleCount = 60): Promise<DealRow[]> {
  console.log(`[fixtures] raleys: discovering buildId...`);
  const buildId = await fetchRaleysBuildId();
  console.log(`[fixtures] raleys: buildId=${buildId}`);
  console.log(`[fixtures] raleys: fetching sitemap...`);
  const sitemap = await fetchRaleysProductSitemap({ pmcId: 147 });
  console.log(`[fixtures] raleys: ${sitemap.length} products in catalog`);

  const step = Math.max(1, Math.floor(sitemap.length / sampleCount));
  const sampled = Array.from({ length: sampleCount }, (_, i) => sitemap[i * step]).filter(
    Boolean,
  );

  const concurrency = 10;
  const queue = [...sampled];
  const out: DealRow[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const p = await fetchProductJson(buildId, item.raleysId, item.slug);
          out.push(rowFromRaleys(p, observedAt));
        } catch (err) {
          // Skip — fixture builder is best-effort; full ingestion handles errors properly.
          console.warn(`[fixtures] raleys: ${item.raleysId} failed: ${err}`);
        }
      }
    }),
  );
  console.log(`[fixtures] raleys: captured ${out.length} deals`);
  return out;
}

async function buildBevmo(observedAt: string, max = 80): Promise<DealRow[]> {
  console.log(`[fixtures] bevmo: fetching beer catalog...`);
  const result = await fetchBevmoBeerCatalog();
  console.log(
    `[fixtures] bevmo: ${result.totalProductsScanned} scanned, ${result.products.length} beer (${result.pagesFetched} pages)`,
  );
  if (result.parseFailures.length > 0) {
    console.warn(`[fixtures] bevmo: ${result.parseFailures.length} parse failures`);
  }
  // Spread `max` evenly across the result so the fixture isn't all
  // alphabetically first.
  const step = Math.max(1, Math.floor(result.products.length / max));
  const sampled = Array.from({ length: max }, (_, i) => result.products[i * step]).filter(
    Boolean,
  );
  return sampled.map((p) => rowFromBevmo(p, observedAt));
}

function rowFromRaleys(p: { raleysId: string; brand: string | null; name: string; upc: string | null; packCount: number | null; packUnitMl: number | null; priceCents: number; regularPriceCents: number | null; discounted: boolean }, observedAt: string): DealRow {
  const reg = p.regularPriceCents;
  const discountPct =
    reg != null && reg > p.priceCents
      ? Math.round(((reg - p.priceCents) / reg) * 100)
      : null;
  const store = STORES[0];
  return {
    id: `raleys-${p.raleysId}`,
    storeId: store.id,
    storeName: store.name,
    storeCity: store.city,
    brand: p.brand,
    name: p.name,
    upc: p.upc,
    packCount: p.packCount,
    packUnitMl: p.packUnitMl,
    priceCents: p.priceCents,
    regularPriceCents: p.regularPriceCents,
    discounted: p.discounted,
    discountPct,
    observedAt,
  };
}

function rowFromBevmo(p: { bevmoId: string; brand: string | null; title: string; upc: null; packCount: number | null; packUnitMl: number | null; priceCents: number; regularPriceCents: number | null; discounted: boolean }, observedAt: string): DealRow {
  const reg = p.regularPriceCents;
  const discountPct =
    reg != null && reg > p.priceCents
      ? Math.round(((reg - p.priceCents) / reg) * 100)
      : null;
  const store = STORES[1];
  return {
    id: `bevmo-${p.bevmoId}`,
    storeId: store.id,
    storeName: store.name,
    storeCity: store.city,
    brand: p.brand,
    name: p.title,
    upc: p.upc,
    packCount: p.packCount,
    packUnitMl: p.packUnitMl,
    priceCents: p.priceCents,
    regularPriceCents: p.regularPriceCents,
    discounted: p.discounted,
    discountPct,
    observedAt,
  };
}

async function main() {
  const t0 = Date.now();
  const observedAt = new Date().toISOString();
  console.log(`[fixtures] starting at ${observedAt}\n`);

  const [raleys, bevmo] = await Promise.all([
    buildRaleys(observedAt).catch((err) => {
      console.error(`[fixtures] raleys FAILED: ${err}`);
      return [] as DealRow[];
    }),
    buildBevmo(observedAt).catch((err) => {
      console.error(`[fixtures] bevmo FAILED: ${err}`);
      return [] as DealRow[];
    }),
  ]);

  const all: DealRow[] = [...raleys, ...bevmo];

  // Sort: best discount first, then cheapest, then by name.
  all.sort((a, b) => {
    const da = a.discountPct ?? 0;
    const db = b.discountPct ?? 0;
    if (da !== db) return db - da;
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    return a.name.localeCompare(b.name);
  });

  const outPath = path.resolve(process.cwd(), "src/data/fixtures/deals.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: observedAt,
        stores: STORES,
        counts: { raleys: raleys.length, bevmo: bevmo.length, total: all.length },
        deals: all,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n[fixtures] DONE — ${all.length} deals (${raleys.length} raleys + ${bevmo.length} bevmo) in ${Date.now() - t0} ms`,
  );
  console.log(`[fixtures] wrote to ${outPath}`);
}

main().catch((err) => {
  console.error("[fixtures] FATAL:", err);
  process.exit(1);
});
