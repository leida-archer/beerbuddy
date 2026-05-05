/**
 * Fetch + parse a single Raley's product JSON.
 *
 * Endpoint: /_next/data/{buildId}/en/product/{raleysId}/{slug}.json
 * Allowed by robots.txt (only /api, /account, /customer disallowed).
 * Returns Commercetools-shape JSON; payload validated and reduced to a
 * narrow `RaleysProduct` shape before reaching the rest of the pipeline.
 */

import { z } from "zod";

/** Narrow record returned to the rest of the adapter. */
export interface RaleysProduct {
  raleysId: string;
  slug: string;
  /** Display name as shown in the UI. */
  name: string;
  /** Brand attribute, when present. Falls back to first word of name. */
  brand: string | null;
  /** Stable Raley's SKU (matches the URL ID for masterVariants). */
  sku: string;
  /** Universal Product Code from `attributesRaw[name="primaryUPC"]`. */
  upc: string | null;
  /** Pack count from `attributesRaw[name="packageCount"]` (e.g. 12, 30). */
  packCount: number | null;
  /** Per-container volume in ml from `attributesRaw[name="MetricServingSize"]`. */
  packUnitMl: number | null;
  /** Current selling price in cents. */
  priceCents: number;
  /** Regular (non-discounted) price in cents from price.custom.regularPrice. */
  regularPriceCents: number | null;
  /** True when price.discounted is non-null. */
  discounted: boolean;
}

/**
 * Schema for the slice of the response we actually use. Loose where
 * Raley's might rearrange (the localized name can be a string or an
 * `{ "en-US": string }` object), strict where it matters (price must
 * be a positive integer in cents).
 */
const NameSchema = z.union([
  z.string().min(1),
  z.record(z.string()).transform((rec) => rec["en-US"] ?? rec.en ?? Object.values(rec)[0]),
]);

const AttributeSchema = z.object({
  name: z.string(),
  value: z.unknown(),
});

const PriceSchema = z.object({
  value: z.object({
    centAmount: z.number().int().positive(),
    currencyCode: z.string().optional(),
  }),
  discounted: z.unknown().nullable().optional(),
  custom: z
    .object({
      customFieldsRaw: z.array(AttributeSchema).optional(),
    })
    .optional()
    .nullable(),
});

const ResponseSchema = z.object({
  pageProps: z.object({
    product: z.object({
      masterData: z.object({
        current: z.object({
          name: NameSchema,
          masterVariant: z.object({
            sku: z.string(),
            attributesRaw: z.array(AttributeSchema).default([]),
            price: PriceSchema,
          }),
        }),
      }),
    }),
  }),
});

const PRODUCT_URL = (buildId: string, raleysId: string, slug: string) =>
  `https://www.raleys.com/_next/data/${buildId}/en/product/${raleysId}/${slug}.json`;

/**
 * Fetch a single product's JSON and parse it into a RaleysProduct.
 * Throws on non-2xx, malformed JSON, or schema violations.
 */
export async function fetchProductJson(
  buildId: string,
  raleysId: string,
  slug: string,
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<RaleysProduct> {
  const f = options.fetch ?? globalThis.fetch;
  const url = PRODUCT_URL(buildId, raleysId, slug);
  const r = await f(url, {
    headers: {
      "User-Agent": "BeerBuddy/0 (+https://github.com/archer-leida/beerbuddy)",
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    throw new Error(
      `Product JSON ${raleysId} ${r.status} ${r.statusText} (${url})`,
    );
  }
  const data = await r.json();
  return parseProductJson(raleysId, slug, data);
}

/**
 * Parse a parsed-JSON response into a RaleysProduct. Exported separately
 * for unit testing without making network calls.
 */
export function parseProductJson(
  raleysId: string,
  slug: string,
  data: unknown,
): RaleysProduct {
  const validated = ResponseSchema.parse(data);
  const current = validated.pageProps.product.masterData.current;
  const variant = current.masterVariant;
  const attrs = variant.attributesRaw;

  const findAttr = (name: string): unknown =>
    attrs.find((a) => a?.name === name)?.value;
  const findCustom = (name: string): unknown =>
    variant.price.custom?.customFieldsRaw?.find((a) => a?.name === name)?.value;

  const name = current.name;
  const brand = stringOrNull(findAttr("brand"));
  const upc = stringOrNull(findAttr("primaryUPC"));
  const packCount = numberOrNull(findAttr("packageCount"));
  const packUnitMl = numberOrNull(findAttr("MetricServingSize"));

  const regularField = findCustom("regularPrice");
  const regularPriceCents =
    regularField && typeof regularField === "object" && regularField !== null
      ? numberOrNull((regularField as { centAmount?: unknown }).centAmount)
      : null;

  return {
    raleysId,
    slug,
    name,
    brand: brand ?? brandFromName(name),
    sku: variant.sku,
    upc,
    packCount,
    packUnitMl,
    priceCents: variant.price.value.centAmount,
    regularPriceCents,
    discounted: variant.price.discounted != null,
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * If Raley's doesn't expose a structured brand attribute, fall back to
 * the first word of the product name. Imperfect but better than null
 * for cross-chain matching.
 */
function brandFromName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || name;
}
