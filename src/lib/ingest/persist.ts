/**
 * Persistence helpers for the ingestion pipeline.
 *
 * These are the only place that touches price_events / runs /
 * quarantine_events. Adapters call them; tests can stub them.
 *
 * Idempotency contract (price-change-event semantics, locked in
 * docs/design.md § Architecture sketch): a price observation that
 * matches the most recent priceCents for the same (store, product)
 * is a no-op. New row is written only on actual change. Result:
 * ~3,500 rows/week steady state instead of ~245,000 daily snapshots.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  manualParseQueue,
  priceEvents,
  productAliases,
  products,
  quarantineEvents,
  runs,
} from "@/lib/db/schema";
import type { AdapterRun } from "./contract";

export interface PriceEventInput {
  storeId: string;
  canonicalProductId: number;
  priceCents: number;
  wasPriceCents?: number;
  source: string;
  observedAt?: Date;
}

/**
 * Look up the most recent price for a (store, product) pair.
 * Returns null if there's no prior observation.
 */
export async function getMostRecentPrice(
  storeId: string,
  canonicalProductId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ priceCents: priceEvents.priceCents })
    .from(priceEvents)
    .where(
      and(
        eq(priceEvents.storeId, storeId),
        eq(priceEvents.canonicalProductId, canonicalProductId),
      ),
    )
    .orderBy(desc(priceEvents.observedAt))
    .limit(1);

  return row?.priceCents ?? null;
}

/**
 * Write a price event idempotently — only if it differs from the most
 * recent observation for the same (store, product). Returns true if a
 * row was written, false if the observation was a no-op.
 *
 * Caller is responsible for sanity-checking via isPriceSane() BEFORE
 * calling this; quarantine routing lives in writeQuarantine().
 */
export async function writePriceEvent(input: PriceEventInput): Promise<boolean> {
  const prior = await getMostRecentPrice(input.storeId, input.canonicalProductId);
  if (prior === input.priceCents) return false;

  await db.insert(priceEvents).values({
    storeId: input.storeId,
    canonicalProductId: input.canonicalProductId,
    priceCents: input.priceCents,
    wasPriceCents: input.wasPriceCents,
    source: input.source,
    observedAt: input.observedAt ?? new Date(),
  });
  return true;
}

/**
 * Sentinel pack values used when the source doesn't tell us how a SKU
 * is packaged (e.g. single 22oz bombers from Raley's omit packageCount).
 * Stored canonically as (1, 0) so the unique index on products has a
 * deterministic key. The detail-page UI treats packUnitMl=0 as
 * "unknown" and hides the formatted pack line.
 */
const UNKNOWN_PACK_SIZE = 1;
const UNKNOWN_PACK_UNIT_ML = 0;

export interface AliasResolveInput {
  /** Chain-prefixed SKU, e.g. "raleys/123456". MUST be unique across chains. */
  chainSku: string;
  /** Display brand from the source. Empty string → "Unknown". */
  brand: string | null;
  /** Display name from the source — used as the canonical name when this
   * chain SKU is the first to surface this product. */
  rawName: string;
  /** Pack count (12 for a 12-pack); null if unknown. */
  packCount: number | null;
  /** Per-container volume in ml; null if unknown. */
  packUnitMl: number | null;
  abv?: number | null;
  style?: string | null;
}

export interface AliasResolveResult {
  canonicalProductId: number;
  /** True when this call created a new alias row (or a new products row). */
  isNew: boolean;
}

/**
 * Bridge between a chain-specific SKU and the canonical `products` table.
 *
 * Idempotent. Two-phase, to preserve admin overrides:
 *   1. Look up the alias by chainSku. If found, return its current
 *      canonical_product_id — this respects manual re-mappings done
 *      via the /admin/aliases candidate-match UI.
 *   2. Otherwise, upsert a `products` row keyed on
 *      (brand, name, packSize, packUnitMl) — the unique index — and
 *      then insert a `product_aliases` row pointing chainSku at it,
 *      tagged `confirmedBySession = "auto"` so the admin UI can
 *      surface auto-stubs for review.
 *
 * Returns `{ canonicalProductId, isNew }`. Callers feed
 * `canonicalProductId` into `writePriceEvent`.
 *
 * NOTE: The Neon HTTP driver does not support real multi-statement
 * transactions, so the two inserts are sequential HTTP calls. Both
 * use `ON CONFLICT` to stay idempotent under retry — an orphan
 * products row created by a partial failure is harmless and will be
 * reused by the next call.
 */
export async function upsertAliasAndCanonicalProduct(
  input: AliasResolveInput,
): Promise<AliasResolveResult> {
  const existing = await db
    .select({ canonicalProductId: productAliases.canonicalProductId })
    .from(productAliases)
    .where(eq(productAliases.chainSku, input.chainSku))
    .limit(1);
  if (existing.length > 0) {
    return { canonicalProductId: existing[0].canonicalProductId, isNew: false };
  }

  const brand = (input.brand ?? "").trim() || "Unknown";
  const name = input.rawName.trim();
  const packSize = input.packCount ?? UNKNOWN_PACK_SIZE;
  const packUnitMl = input.packUnitMl ?? UNKNOWN_PACK_UNIT_ML;

  const upserted = await db
    .insert(products)
    .values({
      brand,
      name,
      packSize,
      packUnitMl,
      abv: input.abv ?? null,
      style: input.style ?? null,
    })
    .onConflictDoUpdate({
      target: [products.brand, products.name, products.packSize, products.packUnitMl],
      set: { brand },
    })
    .returning({ id: products.id });
  const canonicalProductId = upserted[0]?.id;
  if (canonicalProductId == null) {
    throw new Error(
      `upsertAliasAndCanonicalProduct: products upsert returned no id for ${input.chainSku}`,
    );
  }

  await db
    .insert(productAliases)
    .values({
      chainSku: input.chainSku,
      canonicalProductId,
      rawName: name,
      confirmedBySession: "auto",
    })
    .onConflictDoNothing({ target: productAliases.chainSku });

  return { canonicalProductId, isNew: true };
}

export interface QuarantineInput {
  storeId: string;
  rawProductIdentifier: string;
  attemptedPriceCents: number | null;
  priorPriceCents: number | null;
  reason: string;
  rawSnippet?: string;
}

export async function writeQuarantine(input: QuarantineInput): Promise<void> {
  await db.insert(quarantineEvents).values({
    storeId: input.storeId,
    rawProductIdentifier: input.rawProductIdentifier,
    attemptedPriceCents: input.attemptedPriceCents ?? null,
    priorPriceCents: input.priorPriceCents ?? null,
    reason: input.reason,
    rawSnippet: input.rawSnippet ?? null,
  });
}

export interface QueueManualParseInput {
  /** Stable chain identifier — same string the adapter uses ("spd", "save-a-lot"). */
  sourceId: string;
  /** "manual-parse" by default; other kinds: "captcha", "config-needed", "site-error". */
  kind?: string;
  /** URL that contains the data the admin needs to look at, when one exists. */
  sourceUrl?: string;
  /** "application/pdf", "image/png", "text/html", etc. — display-only hint. */
  mediaType?: string;
  /** Free-form note: what the admin should look for / why auto-parse failed. */
  hint: string;
}

/**
 * Queue a row for admin attention and emit a console-level notification.
 *
 * Replaces the original `writeLlmParseFailure` path. Adapters call this
 * whenever they hit a source they can't auto-parse — instead of trying
 * to fix it inline (LLM, brittle heuristics), they enqueue it for the
 * admin to handle out-of-band.
 *
 * Notification today is console-only; a Resend / Slack / Pushover side
 * channel can be plugged in via `notifyAdmin` (lib/admin/notify.ts)
 * without changing this call site.
 */
export async function queueManualParse(
  input: QueueManualParseInput,
): Promise<{ id: number }> {
  const [row] = await db
    .insert(manualParseQueue)
    .values({
      sourceId: input.sourceId,
      kind: input.kind ?? "manual-parse",
      sourceUrl: input.sourceUrl,
      mediaType: input.mediaType,
      hint: input.hint,
    })
    .returning({ id: manualParseQueue.id });

  // Lazy import so persist.ts stays db-only; notify can pull in
  // delivery dependencies (email, webhooks) without coupling them
  // to the ingestion path.
  const { notifyAdmin } = await import("@/lib/admin/notify");
  await notifyAdmin({
    subject: `[BeerBuddy] manual parse needed: ${input.sourceId}`,
    body: input.hint,
    sourceId: input.sourceId,
    sourceUrl: input.sourceUrl,
    queueId: row.id,
  });

  return { id: row.id };
}

/**
 * Persist a run summary after the orchestrator finishes an adapter.
 * The full ParseFailure / FetchError arrays are denormalized into
 * jsonb columns for postmortem inspection.
 */
export async function recordRun(run: AdapterRun): Promise<void> {
  await db.insert(runs).values({
    sourceId: run.sourceId,
    startedAt: run.runStartedAt,
    durationMs: run.durationMs,
    productsObserved: run.productsObserved,
    pricesWritten: run.pricesWritten,
    parseFailureCount: run.parseFailures.length,
    fetchErrorCount: run.fetchErrors.length,
    parseFailures: run.parseFailures.length > 0 ? run.parseFailures : null,
    fetchErrors: run.fetchErrors.length > 0 ? run.fetchErrors : null,
  });
}
