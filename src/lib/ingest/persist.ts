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
  llmParseFailures,
  priceEvents,
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

export interface LlmParseFailureInput {
  sourceId: string;
  rawResponse: unknown;
  zodErrors: unknown;
}

export async function writeLlmParseFailure(input: LlmParseFailureInput): Promise<void> {
  await db.insert(llmParseFailures).values({
    sourceId: input.sourceId,
    rawResponse: input.rawResponse as object,
    zodErrors: input.zodErrors as object,
  });
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
