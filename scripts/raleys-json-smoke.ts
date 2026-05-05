/**
 * Raley's JSON adapter smoke test.
 *
 * Hits the live site once with the JSON-fetch path:
 *   1. Discover buildId from homepage HTML
 *   2. Fetch sitemap (PMC147 = beer-only by default)
 *   3. Pick 5 sample products and fetch their JSON
 *   4. Report what was extracted
 *
 * Confirms the JSON adapter works end-to-end without Playwright,
 * without DB, and without DATABASE_URL.
 *
 * Usage:
 *   bun run scripts/raleys-json-smoke.ts            # PMC147 (beer)
 *   bun run scripts/raleys-json-smoke.ts --pmc 18  # PMC18 (wine+beer+spirits)
 */

import { fetchRaleysBuildId } from "@/lib/ingest/adapters/raleys/buildId";
import { fetchProductJson } from "@/lib/ingest/adapters/raleys/productJson";
import { fetchRaleysProductSitemap } from "@/lib/ingest/adapters/raleys/sitemap";

async function main() {
  const argv = process.argv.slice(2);
  let pmcId = 147;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pmc" && argv[i + 1]) {
      pmcId = Number.parseInt(argv[++i], 10);
    }
  }

  const t0 = Date.now();

  console.log(`[smoke] discovering buildId from raleys.com homepage...`);
  const buildId = await fetchRaleysBuildId();
  console.log(`[smoke] buildId = ${buildId} (${Date.now() - t0} ms)`);

  console.log(`[smoke] fetching PMC${pmcId} sitemap...`);
  const sitemap = await fetchRaleysProductSitemap({ pmcId });
  console.log(`[smoke] sitemap returned ${sitemap.length} products`);

  if (sitemap.length === 0) {
    console.error(`[smoke] sitemap empty — bailing out`);
    process.exit(1);
  }

  // Pick 5 evenly-distributed samples across the catalog.
  const step = Math.max(1, Math.floor(sitemap.length / 5));
  const samples = [0, step, step * 2, step * 3, step * 4]
    .map((i) => sitemap[i])
    .filter(Boolean);

  console.log(`\n[smoke] fetching ${samples.length} sample product JSONs:`);
  for (const item of samples) {
    const tFetch = Date.now();
    try {
      const product = await fetchProductJson(buildId, item.raleysId, item.slug);
      const dt = Date.now() - tFetch;
      console.log(
        `  ${item.raleysId.padEnd(10)} ${(product.brand ?? "?").padEnd(20)} ${product.name.slice(0, 38).padEnd(38)} ` +
          `pack=${(product.packCount ?? "?").toString().padEnd(3)} ` +
          `unit=${(product.packUnitMl ?? "?").toString().padEnd(5)}ml ` +
          `$${(product.priceCents / 100).toFixed(2).padEnd(7)} ` +
          `${product.discounted ? "SALE" : "    "} ` +
          `upc=${product.upc ?? "?"} ` +
          `(${dt}ms)`,
      );
    } catch (err) {
      console.error(`  ${item.raleysId} FAILED: ${err}`);
    }
  }

  console.log(`\n[smoke] DONE — total ${Date.now() - t0} ms`);
}

main().catch((err) => {
  console.error("[smoke] FATAL:", err);
  process.exit(1);
});
