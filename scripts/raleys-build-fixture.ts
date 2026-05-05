/**
 * Build a static fixture file of real Raley's beer deals.
 *
 * Used by /api/deals as the data source until Neon DB lands. Produces:
 *
 *   src/data/fixtures/raleys-deals.json
 *
 * The fixture is a snapshot — committed to the repo. Re-run with:
 *
 *   bun run fixture:raleys [--count 50]
 *
 * to refresh against current prices.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { fetchRaleysBuildId } from "@/lib/ingest/adapters/raleys/buildId";
import {
  fetchProductJson,
  type RaleysProduct,
} from "@/lib/ingest/adapters/raleys/productJson";
import { fetchRaleysProductSitemap } from "@/lib/ingest/adapters/raleys/sitemap";

interface DealRow {
  raleysId: string;
  slug: string;
  brand: string | null;
  name: string;
  upc: string | null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  discounted: boolean;
  /** % saved vs regular price; only meaningful when regularPriceCents > priceCents. */
  discountPct: number | null;
  observedAt: string;
}

async function main() {
  const argv = process.argv.slice(2);
  let count = 50;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count" && argv[i + 1]) {
      count = Number.parseInt(argv[++i], 10);
    }
  }

  const t0 = Date.now();
  console.log(`[fixture] building Raley's beer fixture (count=${count})...`);

  const buildId = await fetchRaleysBuildId();
  console.log(`[fixture] buildId = ${buildId}`);

  const sitemap = await fetchRaleysProductSitemap({ pmcId: 147 });
  console.log(`[fixture] sitemap returned ${sitemap.length} products`);

  // Spread `count` evenly across the catalog so the fixture isn't all
  // wines or all light beers. This avoids "first 50 alphabetical" bias.
  const step = Math.max(1, Math.floor(sitemap.length / count));
  const sampled = Array.from({ length: count }, (_, i) => sitemap[i * step]).filter(
    Boolean,
  );

  const concurrency = 10;
  const queue = [...sampled];
  const results: RaleysProduct[] = [];
  const errors: string[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        try {
          const p = await fetchProductJson(buildId, item.raleysId, item.slug);
          results.push(p);
        } catch (err) {
          errors.push(`${item.raleysId}: ${err}`);
        }
      }
    }),
  );

  const observedAt = new Date().toISOString();
  const deals: DealRow[] = results.map((p) => {
    const reg = p.regularPriceCents;
    const discountPct =
      reg != null && reg > p.priceCents
        ? Math.round(((reg - p.priceCents) / reg) * 100)
        : null;
    return {
      raleysId: p.raleysId,
      slug: p.slug,
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
  });

  // Sort: largest discount first, then cheapest, then by name. The
  // resulting fixture mirrors how the deal-list page will sort.
  deals.sort((a, b) => {
    const da = a.discountPct ?? 0;
    const db = b.discountPct ?? 0;
    if (da !== db) return db - da;
    if (a.priceCents !== b.priceCents) return a.priceCents - b.priceCents;
    return a.name.localeCompare(b.name);
  });

  const outPath = path.resolve(
    process.cwd(),
    "src/data/fixtures/raleys-deals.json",
  );
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: observedAt,
        sourceBuildId: buildId,
        sampleSize: deals.length,
        sourceCatalogSize: sitemap.length,
        store: { id: "raleys-grass-valley", name: "Raley's", city: "Grass Valley" },
        deals,
      },
      null,
      2,
    ),
  );

  console.log(`\n[fixture] wrote ${deals.length} deals to ${outPath}`);
  console.log(`[fixture] errors: ${errors.length}`);
  if (errors.length > 0) console.log(`           ${errors.slice(0, 3).join("\n           ")}`);
  console.log(`[fixture] DONE in ${Date.now() - t0} ms`);
}

main().catch((err) => {
  console.error("[fixture] FATAL:", err);
  process.exit(1);
});
