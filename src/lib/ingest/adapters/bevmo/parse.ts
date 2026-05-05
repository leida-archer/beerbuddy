/**
 * Parse a Shopify product object → our internal RaleysProduct-compatible
 * shape. (Same shape across chain adapters so the persist + UI layers
 * don't care which chain produced a record.)
 *
 * BevMo runs on Shopify; product handles are numeric IDs (e.g. "447490")
 * rather than the slug-style handles other Shopify stores use. Variants[0]
 * is treated as the canonical variant. Pack info is parsed from the title.
 */

import { z } from "zod";

export interface BevmoProduct {
  bevmoId: string;
  /** URL handle (always numeric for BevMo). */
  handle: string;
  title: string;
  brand: string | null;
  sku: string | null;
  /** UPC isn't in standard Shopify schema; null for now. */
  upc: null;
  packCount: number | null;
  packUnitMl: number | null;
  priceCents: number;
  regularPriceCents: number | null;
  discounted: boolean;
}

export const ShopifyVariantSchema = z.object({
  id: z.union([z.number(), z.string()]),
  sku: z.string().optional().nullable(),
  price: z.string(),
  compare_at_price: z.string().nullable().optional(),
  available: z.boolean().optional(),
});

export const ShopifyProductSchema = z.object({
  id: z.union([z.number(), z.string()]),
  handle: z.string(),
  title: z.string(),
  vendor: z.string().optional().nullable(),
  product_type: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  variants: z.array(ShopifyVariantSchema).min(1),
});

export type ShopifyProduct = z.infer<typeof ShopifyProductSchema>;

export const ShopifyCatalogResponseSchema = z.object({
  products: z.array(ShopifyProductSchema),
});

export type ShopifyCatalogResponse = z.infer<
  typeof ShopifyCatalogResponseSchema
>;

/**
 * Test whether a Shopify product is a beer based on its product_type.
 * BevMo's taxonomy puts beer at "Alcohol > Beer > {style} > {sub-style}".
 *
 * Lenient: any product_type containing "Beer" passes. Filters out wine,
 * spirits, mixers, RTDs marketed as cocktails.
 */
export function isBeerProduct(product: ShopifyProduct): boolean {
  const type = product.product_type ?? "";
  return /\bBeer\b/i.test(type);
}

/** Parse a Shopify $X.YY price string → integer cents. */
export function shopifyPriceToCents(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^\$/, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Parse pack info out of a product title. Imperfect but covers the
 * common patterns BevMo titles use:
 *
 *   "Sierra Nevada Pale Ale 12pk 12oz Can"   → 12 × 355
 *   "Cutwater Banana Mudslide 4pk 12oz Can"  → 4 × 355
 *   "Stone IPA 6-pack 12oz Bottle"           → 6 × 355
 *   "Modelo Especial 18 Pack"                → 18 × null (no unit)
 *   "Single 19.2oz Tallboy"                  → 1 × 568
 *   "Coors Light 30 Pack"                    → 30 × null
 */
export function parsePackInfo(title: string): {
  packCount: number | null;
  packUnitMl: number | null;
} {
  const packMatch = /(\d+)\s*(?:pk|pack|-pack|p\b)/i.exec(title);
  const packCount = packMatch ? Number.parseInt(packMatch[1], 10) : 1;

  const ozMatch = /(\d+(?:\.\d+)?)\s*oz\b/i.exec(title);
  const mlMatch = /(\d+(?:\.\d+)?)\s*m[lL]\b/.exec(title);
  let packUnitMl: number | null = null;
  if (ozMatch) {
    packUnitMl = Math.round(Number.parseFloat(ozMatch[1]) * 29.5735);
  } else if (mlMatch) {
    packUnitMl = Math.round(Number.parseFloat(mlMatch[1]));
  }

  return { packCount: Number.isFinite(packCount) ? packCount : null, packUnitMl };
}

/**
 * Convert a parsed Shopify product into a BevmoProduct record. Throws
 * via Zod if the response shape is wrong.
 */
export function parseShopifyProduct(raw: unknown): BevmoProduct {
  const product = ShopifyProductSchema.parse(raw);
  const variant = product.variants[0];
  const priceCents = shopifyPriceToCents(variant.price);
  if (priceCents == null) {
    throw new Error(
      `Variant ${variant.id} has unparseable price: ${variant.price}`,
    );
  }
  const regularPriceCents = shopifyPriceToCents(variant.compare_at_price ?? null);
  const discounted =
    regularPriceCents != null && regularPriceCents > priceCents;

  const { packCount, packUnitMl } = parsePackInfo(product.title);

  return {
    bevmoId: String(product.id),
    handle: product.handle,
    title: product.title,
    brand: (product.vendor ?? null) || null,
    sku: variant.sku ?? null,
    upc: null,
    packCount,
    packUnitMl,
    priceCents,
    regularPriceCents,
    discounted,
  };
}
