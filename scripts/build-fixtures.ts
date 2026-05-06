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

import { extractBevmoBeerProducts } from "@/lib/ingest/adapters/bevmo/extract";
import { extractHolidayBeerProducts } from "@/lib/ingest/adapters/holiday-market/extract";
import { fetchRaleysBuildId } from "@/lib/ingest/adapters/raleys/buildId";
import { fetchProductJson } from "@/lib/ingest/adapters/raleys/productJson";
import { fetchRaleysProductSitemap } from "@/lib/ingest/adapters/raleys/sitemap";
import { extractSavemartBeerProducts } from "@/lib/ingest/adapters/savemart/extract";

const FIXTURE_PATH = "src/data/fixtures/deals.json";

/** Load the previously-saved fixture file so chains that fail extraction
 * (anti-bot regression, transient outage, etc.) can fall back to cached
 * data instead of dropping out of the live deal list entirely. The
 * cached row's `observedAt` stays as it was — UI surfaces this via the
 * "updated X ago" relative timestamp so users see freshness honestly. */
async function loadPreviousFixture(): Promise<Record<string, DealRow[]>> {
  try {
    const path_ = path.resolve(process.cwd(), FIXTURE_PATH);
    const raw = await fs.readFile(path_, "utf8");
    const parsed = JSON.parse(raw);
    const byStore: Record<string, DealRow[]> = {};
    for (const d of parsed.deals ?? []) {
      const k = d.storeId;
      if (!byStore[k]) byStore[k] = [];
      byStore[k].push(d);
    }
    return byStore;
  } catch {
    return {};
  }
}

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
  { id: "holiday-market-penn-valley", name: "Holiday Market", city: "Penn Valley" },
  { id: "savemart-nevada-city", name: "Save Mart", city: "Nevada City" },
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
  console.log(`[fixtures] bevmo: launching Playwright + scraping /pages/beer...`);
  const products = await extractBevmoBeerProducts();
  console.log(`[fixtures] bevmo: extracted ${products.length} beer products`);

  const sampled = products.slice(0, max);
  return sampled.map((p) => rowFromBevmoScraped(p, observedAt));
}

function rowFromBevmoScraped(
  p: { bevmoId: string; brand: string | null; title: string; packCount: number | null; packUnitMl: number | null; priceCents: number; regularPriceCents: number | null },
  observedAt: string,
): DealRow {
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
    upc: null,
    packCount: p.packCount,
    packUnitMl: p.packUnitMl,
    priceCents: p.priceCents,
    regularPriceCents: p.regularPriceCents,
    discounted: reg != null && reg > p.priceCents,
    discountPct,
    observedAt,
  };
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

async function buildHoliday(observedAt: string, max = 80): Promise<DealRow[]> {
  console.log(`[fixtures] holiday: launching Playwright on Penn Valley beer category...`);
  const products = await extractHolidayBeerProducts();
  console.log(`[fixtures] holiday: extracted ${products.length} beer products`);

  const sampled = products.slice(0, max);
  return sampled.map((p) => {
    const reg = p.regularPriceCents;
    const discountPct =
      reg != null && reg > p.priceCents
        ? Math.round(((reg - p.priceCents) / reg) * 100)
        : null;
    const store = STORES[2];
    return {
      id: `holiday-${p.id}`,
      storeId: store.id,
      storeName: store.name,
      storeCity: store.city,
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
}

async function buildSavemart(observedAt: string, max = 80): Promise<DealRow[]> {
  console.log(`[fixtures] savemart: launching Playwright on Nevada City beer category...`);
  const products = await extractSavemartBeerProducts();
  console.log(`[fixtures] savemart: extracted ${products.length} beer products`);

  const sampled = products.slice(0, max);
  return sampled.map((p) => {
    const reg = p.regularPriceCents;
    const discountPct =
      reg != null && reg > p.priceCents
        ? Math.round(((reg - p.priceCents) / reg) * 100)
        : null;
    const store = STORES[3];
    return {
      id: `savemart-${p.savemartId}`,
      storeId: store.id,
      storeName: store.name,
      storeCity: store.city,
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
}

async function main() {
  const t0 = Date.now();
  const observedAt = new Date().toISOString();
  console.log(`[fixtures] starting at ${observedAt}\n`);

  const previous = await loadPreviousFixture();
  const fallback = (storeId: string, fresh: DealRow[]): DealRow[] => {
    if (fresh.length > 0) return fresh;
    const cached = previous[storeId] ?? [];
    if (cached.length > 0) {
      console.warn(
        `[fixtures] ${storeId}: extraction returned 0; falling back to ${cached.length} cached rows from previous fixture`,
      );
    }
    return cached;
  };

  // Run sequentially (not parallel) — running 4 Playwright contexts in
  // parallel was causing BevMo to silently extract 0 products. Cost in
  // total time is small (~10 sec serial vs ~3 sec parallel) for the
  // reliability win.
  const raleysRaw = await buildRaleys(observedAt).catch((err) => {
    console.error(`[fixtures] raleys FAILED: ${err}`);
    return [] as DealRow[];
  });
  const bevmoRaw = await buildBevmo(observedAt).catch((err) => {
    console.error(`[fixtures] bevmo FAILED: ${err}`);
    return [] as DealRow[];
  });
  const holidayRaw = await buildHoliday(observedAt).catch((err) => {
    console.error(`[fixtures] holiday FAILED: ${err}`);
    return [] as DealRow[];
  });
  const savemartRaw = await buildSavemart(observedAt).catch((err) => {
    console.error(`[fixtures] savemart FAILED: ${err}`);
    return [] as DealRow[];
  });

  const raleys = fallback("raleys-grass-valley", raleysRaw);
  const bevmo = fallback("bevmo-auburn", bevmoRaw);
  const holiday = fallback("holiday-market-penn-valley", holidayRaw);
  const savemart = fallback("savemart-nevada-city", savemartRaw);

  const all: DealRow[] = [...raleys, ...bevmo, ...holiday, ...savemart];

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
        counts: {
          raleys: raleys.length,
          bevmo: bevmo.length,
          holiday: holiday.length,
          savemart: savemart.length,
          total: all.length,
        },
        deals: all,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n[fixtures] DONE — ${all.length} deals (${raleys.length} raleys + ${bevmo.length} bevmo + ${holiday.length} holiday + ${savemart.length} savemart) in ${Date.now() - t0} ms`,
  );
  console.log(`[fixtures] wrote to ${outPath}`);
}

main().catch((err) => {
  console.error("[fixtures] FATAL:", err);
  process.exit(1);
});
