/**
 * Grocery Outlet adapter smoke test.
 *
 * Calls extractGroceryOutletBeerProducts() once with verbose diagnostics
 * and reports the result. Used to debug "fixture build returns 0 deals"
 * regressions without re-running the full build-fixtures pipeline.
 *
 * Usage:
 *   bun run scripts/grocery-outlet-smoke.ts
 */

import { extractGroceryOutletBeerProducts } from "@/lib/ingest/adapters/grocery-outlet/extract";

async function main() {
  const t0 = Date.now();
  console.log("[go-smoke] starting extraction...");
  const products = await extractGroceryOutletBeerProducts();
  const dur = Date.now() - t0;
  console.log(`[go-smoke] done in ${dur} ms — ${products.length} products`);

  if (products.length === 0) {
    console.log("[go-smoke] EMPTY RESULT");
    return;
  }

  for (const p of products.slice(0, 8)) {
    console.log(
      `  ${p.groceryOutletId.padEnd(10)} ${p.name.slice(0, 60).padEnd(60)} $${(p.priceCents / 100).toFixed(2).padStart(6)} ${p.packCount ?? "?"}x${p.packUnitMl ?? "?"}ml`,
    );
  }
  if (products.length > 8) console.log(`  ... and ${products.length - 8} more`);
}

main().catch((err) => {
  console.error("[go-smoke] FATAL:", err);
  process.exit(1);
});
