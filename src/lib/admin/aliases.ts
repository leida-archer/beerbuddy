/**
 * Product alias candidate-match logic (admin /aliases workflow).
 *
 * The alias resolver in `lib/ingest/persist.ts` auto-creates a stub
 * `products` row whenever a chain sees a SKU we've never seen before.
 * The deduplication invariant — `(brand, name, packSize, packUnitMl)`
 * is unique — collapses obvious cross-chain matches automatically.
 * Anything that doesn't collapse ends up as separate canonical rows.
 *
 * This module surfaces the leftover candidate matches and exposes a
 * safe merge primitive. The admin UI consumes both. Per
 * /plan-eng-review Issue 12, the merge MUST preserve audit history:
 * the alias rows are re-pointed (NOT deleted), and the orphan canonical
 * product row is deleted only after all aliases have moved.
 */

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { priceEvents, productAliases, products } from "@/lib/db/schema";
import { nameSimilarity } from "./nameSimilarity";

export { nameSimilarity };

export interface CandidatePair {
  /** Canonical IDs of the two products the heuristic thinks may match. */
  leftId: number;
  rightId: number;
  /** Display info used by the admin UI to render a comparison row. */
  leftBrand: string;
  leftName: string;
  rightBrand: string;
  rightName: string;
  packSize: number;
  packUnitMl: number;
  /** Sources that contributed each side, comma-separated chain names. */
  leftSources: string;
  rightSources: string;
  /** Levenshtein-ish similarity hint, 0..1 — for ordering. Higher == more similar. */
  similarity: number;
}

/**
 * Surface candidate matches: pairs of canonical products that share
 * the same packSize/packUnitMl AND whose normalized brand+name are
 * similar enough that the developer should look at them.
 *
 * Bound on result size: returns at most `limit` pairs, ordered by
 * descending similarity. The exact-match case is already collapsed
 * by the products unique index, so anything surfaced here is
 * fuzzy-similar (e.g. "Sierra Nev PA" vs "Sierra Nevada Pale Ale").
 */
export async function findAliasCandidates(
  limit = 50,
): Promise<CandidatePair[]> {
  const rows = await db
    .select({
      id: products.id,
      brand: products.brand,
      name: products.name,
      packSize: products.packSize,
      packUnitMl: products.packUnitMl,
    })
    .from(products);

  const aliasRows = await db
    .select({
      canonicalProductId: productAliases.canonicalProductId,
      chainSku: productAliases.chainSku,
    })
    .from(productAliases);

  const sourcesByProduct = new Map<number, string[]>();
  for (const a of aliasRows) {
    const chain = a.chainSku.split("/", 1)[0] || "unknown";
    const list = sourcesByProduct.get(a.canonicalProductId) ?? [];
    if (!list.includes(chain)) list.push(chain);
    sourcesByProduct.set(a.canonicalProductId, list);
  }

  const candidates: CandidatePair[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.packSize !== b.packSize || a.packUnitMl !== b.packUnitMl) continue;
      const sim = nameSimilarity(`${a.brand} ${a.name}`, `${b.brand} ${b.name}`);
      if (sim < 0.6) continue;
      candidates.push({
        leftId: a.id,
        rightId: b.id,
        leftBrand: a.brand,
        leftName: a.name,
        rightBrand: b.brand,
        rightName: b.name,
        packSize: a.packSize,
        packUnitMl: a.packUnitMl,
        leftSources: (sourcesByProduct.get(a.id) ?? []).join(","),
        rightSources: (sourcesByProduct.get(b.id) ?? []).join(","),
        similarity: sim,
      });
    }
  }
  candidates.sort((x, y) => y.similarity - x.similarity);
  return candidates.slice(0, limit);
}

export interface MergeAliasesResult {
  /** Number of `product_aliases` rows repointed onto the canonical product. */
  aliasesMoved: number;
  /** Number of `price_events` rows whose canonical_product_id was rewritten. */
  priceEventsRepointed: number;
  /** True when the source product row was deleted at the end. */
  sourceDeleted: boolean;
}

/**
 * Merge `sourceId` into `targetId`, keeping `targetId`.
 *
 * Steps:
 *   1. Repoint all `product_aliases.canonical_product_id = sourceId` → `targetId`.
 *   2. Repoint all `price_events.canonical_product_id = sourceId` → `targetId`.
 *      (Without this, historical observations would orphan once the
 *      source row is deleted.)
 *   3. Delete the `products` row at `sourceId`.
 *
 * No-op + throws if source == target. The audit trail for the moved
 * aliases is left intact — their `confirmedAt` reflects the original
 * creation time; `confirmedBySession` is overwritten to "merge:<target>"
 * so the next person to look knows this row was re-pointed.
 */
export async function mergeAliases(
  sourceId: number,
  targetId: number,
  sessionTag = "merge",
): Promise<MergeAliasesResult> {
  if (sourceId === targetId) {
    throw new Error(`mergeAliases: sourceId === targetId (${sourceId})`);
  }

  const aliasesMoved = await db
    .update(productAliases)
    .set({
      canonicalProductId: targetId,
      confirmedBySession: `${sessionTag}:${targetId}`,
    })
    .where(eq(productAliases.canonicalProductId, sourceId))
    .returning({ id: productAliases.id });

  const priceEventsRepointed = await db
    .update(priceEvents)
    .set({ canonicalProductId: targetId })
    .where(eq(priceEvents.canonicalProductId, sourceId))
    .returning({ id: priceEvents.id });

  const deleted = await db
    .delete(products)
    .where(eq(products.id, sourceId))
    .returning({ id: products.id });

  return {
    aliasesMoved: aliasesMoved.length,
    priceEventsRepointed: priceEventsRepointed.length,
    sourceDeleted: deleted.length > 0,
  };
}

