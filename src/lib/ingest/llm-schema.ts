/**
 * Zod schemas for LLM-parsed circular output (Issue 7A).
 *
 * Used by adapters that ingest weekly-ad PDFs or screenshots via
 * Anthropic Haiku with structured output. The schema is the gate:
 * if Haiku's response doesn't conform, the row is logged to
 * llm_parse_failures and skipped — never persisted to price_events.
 *
 * Tightening the schema here (e.g., requiring brand to be a known
 * value from a small enum) is the safest way to catch LLM
 * hallucinations downstream.
 */

import { z } from "zod";

export const PriceCentsSchema = z
  .number()
  .int()
  .positive()
  .max(100_000, "Price > $1000/cents — likely an LLM unit confusion (dollars-as-cents).");

export const PackUnitMlSchema = z
  .number()
  .int()
  .positive()
  .max(2000, "Pack unit > 2000ml — likely LLM error (no consumer beer container is that big).");

export const PackSizeSchema = z
  .number()
  .int()
  .positive()
  .max(48, "Pack size > 48 — unusual; verify before persisting.");

export const AbvSchema = z
  .number()
  .min(0)
  .max(20, "ABV > 20% — exotic; flag for review.")
  .optional();

/**
 * One product extracted from a weekly ad / circular PDF.
 *
 * The fields here are deliberately strict — every adapter using
 * LLM parsing must produce data conforming to this shape, or it
 * gets quarantined. Tighter schemas catch more hallucinations.
 */
export const CircularProductSchema = z.object({
  brand: z.string().min(1).max(80),
  productName: z.string().min(1).max(200),
  packSize: PackSizeSchema,
  packUnitMl: PackUnitMlSchema,
  abv: AbvSchema,
  style: z.string().max(60).optional(),
  priceCents: PriceCentsSchema,
  wasPriceCents: PriceCentsSchema.optional(),
  storeIdHint: z.string().max(80).optional(),
  rawSource: z.string().max(500),
});

export type CircularProduct = z.infer<typeof CircularProductSchema>;

export const CircularResponseSchema = z.object({
  products: z.array(CircularProductSchema).max(2000),
  validThrough: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CircularResponse = z.infer<typeof CircularResponseSchema>;
