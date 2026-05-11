/**
 * Drizzle schema — full first cut.
 *
 * Maps directly to docs/design.md § Architecture sketch and the
 * indexes locked in /plan-eng-review Issue 10A. Every table here
 * has a corresponding decision somewhere in the design doc; do not
 * add or remove tables without updating the doc.
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * Stores — chains and indies. ~30 expected at launch.
 *
 * `id` is a stable string (e.g. "raleys-grass-valley") rather than a
 * surrogate integer so it's safe to reference from seed files,
 * adapters, and tests without a roundtrip.
 */
export const stores = pgTable(
  "stores",
  {
    id: text("id").primaryKey(),
    chainId: text("chain_id").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    zip: text("zip").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    isIndie: boolean("is_indie").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stores_chain_idx").on(t.chainId),
    index("stores_geo_idx").on(t.lat, t.lon),
  ],
);

/**
 * Canonical products — the "true" product across chains.
 *
 * Per /plan-eng-review Issue 10A: unique index on (brand, name,
 * packSize, packUnitMl). The alias table (below) maps each chain's
 * SKU to one of these canonical rows.
 */
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    brand: text("brand").notNull(),
    name: text("name").notNull(),
    packSize: integer("pack_size").notNull(),
    packUnitMl: integer("pack_unit_ml").notNull(),
    abv: real("abv"),
    style: text("style"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_brand_name_pack_idx").on(
      t.brand,
      t.name,
      t.packSize,
      t.packUnitMl,
    ),
  ],
);

/**
 * Per-chain SKU aliases that map to canonical products.
 *
 * Manual workflow in Week 5 (admin candidate-match UI per
 * /plan-eng-review Issue 12 / docs/design.md § Next Steps).
 *
 * `confirmedAt` and `confirmedBySession` per /plan-eng-review
 * critical-gap #12 — alias wrong-match audit trail.
 */
export const productAliases = pgTable(
  "product_aliases",
  {
    id: serial("id").primaryKey(),
    chainSku: text("chain_sku").notNull(),
    canonicalProductId: integer("canonical_product_id")
      .notNull()
      .references(() => products.id),
    rawName: text("raw_name").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedBySession: text("confirmed_by_session"),
  },
  (t) => [
    uniqueIndex("aliases_chain_sku_idx").on(t.chainSku),
    index("aliases_canonical_idx").on(t.canonicalProductId),
  ],
);

/**
 * Price events — only written when price changes for (store, product).
 *
 * Storage discipline per docs/design.md § Architecture: idempotent
 * writes, no daily snapshots. Estimated ~180k rows/year at steady
 * state, well under Neon free-tier.
 *
 * Indexes per /plan-eng-review Issue 10A.
 */
export const priceEvents = pgTable(
  "price_events",
  {
    id: serial("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => stores.id),
    canonicalProductId: integer("canonical_product_id")
      .notNull()
      .references(() => products.id),
    priceCents: integer("price_cents").notNull(),
    wasPriceCents: integer("was_price_cents"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(),
  },
  (t) => [
    uniqueIndex("price_events_unique_idx").on(
      t.storeId,
      t.canonicalProductId,
      t.observedAt,
    ),
    index("price_events_product_observed_idx").on(t.canonicalProductId, t.observedAt),
    index("price_events_store_observed_idx").on(t.storeId, t.observedAt),
    index("price_events_observed_idx").on(t.observedAt),
  ],
);

/**
 * Per-run summary written by runner.ts after each adapter execution.
 *
 * Matches the AdapterRun shape in src/lib/ingest/contract.ts.
 * Failures are denormalized into JSON columns for easy postmortem
 * inspection without joining to additional tables.
 */
export const runs = pgTable(
  "runs",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    productsObserved: integer("products_observed").notNull(),
    pricesWritten: integer("prices_written").notNull(),
    parseFailureCount: integer("parse_failure_count").notNull(),
    fetchErrorCount: integer("fetch_error_count").notNull(),
    parseFailures: jsonb("parse_failures"),
    fetchErrors: jsonb("fetch_errors"),
  },
  (t) => [index("runs_source_started_idx").on(t.sourceId, t.startedAt)],
);

/**
 * Quarantine — sanity-bounds rejected events (Issue 3A).
 *
 * Reviewed manually weekly. If a quarantined event turns out to be
 * legitimate, it can be promoted into price_events; otherwise
 * it stays here as evidence of a glitch.
 */
export const quarantineEvents = pgTable("quarantine_events", {
  id: serial("id").primaryKey(),
  storeId: text("store_id").notNull(),
  rawProductIdentifier: text("raw_product_identifier").notNull(),
  attemptedPriceCents: integer("attempted_price_cents"),
  priorPriceCents: integer("prior_price_cents"),
  reason: text("reason").notNull(),
  rawSnippet: text("raw_snippet"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Manual parse queue — adapter-flagged "needs human attention" entries.
 *
 * Replaces the original LLM circular-parsing path (omitted 2026-05-10).
 * Whenever an adapter detects a source it can't auto-parse — a chain
 * whose weekly ad ships only as a PDF or screenshot, a site that
 * sprouted a captcha, a layout it doesn't recognize — it writes a row
 * here instead of attempting a heuristic. The admin handles each entry
 * out-of-band (their own Anthropic SDK / OCR / eyeballs), enters the
 * resulting prices via /admin/indie, and marks the row resolved.
 *
 * `kind` keeps the schema generic for future intervention types beyond
 * "parse this PDF" — captcha solves, store-ID lookups, etc.
 */
export const manualParseQueue = pgTable(
  "manual_parse_queue",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    kind: text("kind").notNull().default("manual-parse"),
    sourceUrl: text("source_url"),
    mediaType: text("media_type"),
    hint: text("hint").notNull(),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    resolutionNotes: text("resolution_notes"),
  },
  (t) => [
    index("manual_parse_queue_pending_idx").on(t.resolvedAt),
    index("manual_parse_queue_source_idx").on(t.sourceId),
  ],
);

/**
 * Daily-refreshed materialized view of (product, current_price,
 * 90-day median, deal_score) — see docs/design.md § Architecture.
 *
 * Drizzle does not (as of v0.36) generate CREATE MATERIALIZED VIEW
 * directly from schema. The view is created in a hand-written
 * migration during Week 5 once we have ≥30 days of history.
 *
 * Schema documented here as a TypeScript type for query callers;
 * the actual SQL is in drizzle/migrations/000N_matview.sql when
 * Week 5 lands.
 */
export type ProductDealScore = {
  canonicalProductId: number;
  currentPriceCents: number;
  median90dCents: number | null;
  dealScorePct: number | null;
  refreshedAt: Date;
};
