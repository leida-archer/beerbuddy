import { describe, expect, it } from "vitest";

import { fetchProductJson, parseProductJson } from "../productJson";

/** Realistic Commercetools-shape fixture matching the real Raley's response
 * for product 10200449 (Coors Light 30-pack). attributesRaw is an array
 * keyed by `name` — order is incidental, must look up by name not index. */
const COORS_LIGHT_FIXTURE = {
  pageProps: {
    product: {
      masterData: {
        current: {
          name: "Coors Light 4.2% ABV, 30 Pack",
          masterVariant: {
            sku: "10200449",
            attributesRaw: [
              { name: "brand", value: "Coors Light" },
              { name: "packageCount", value: 30 },
              { name: "MetricServingSize", value: 355.0 },
              { name: "primaryUPC", value: "00071990300302" },
              { name: "departmentId", value: "ALC" },
            ],
            price: {
              value: { centAmount: 2799, currencyCode: "USD" },
              discounted: null,
              custom: {
                customFieldsRaw: [
                  { name: "memberPrice", value: { centAmount: 2599 } },
                  { name: "regularPrice", value: { centAmount: 2799 } },
                  { name: "validUntil", value: null },
                ],
              },
            },
          },
        },
      },
    },
  },
};

const SIERRA_NEVADA_DISCOUNTED_FIXTURE = {
  pageProps: {
    product: {
      masterData: {
        current: {
          name: "Sierra Nevada Pale Ale 12-Pack 12oz Cans",
          masterVariant: {
            sku: "10200500",
            attributesRaw: [
              { name: "brand", value: "Sierra Nevada" },
              { name: "packageCount", value: 12 },
              { name: "MetricServingSize", value: 355.0 },
              { name: "primaryUPC", value: "00083820000016" },
            ],
            price: {
              value: { centAmount: 1399, currencyCode: "USD" },
              discounted: {
                value: { centAmount: 1399, currencyCode: "USD" },
                discount: { typeId: "product-discount", id: "abc-123" },
              },
              custom: {
                customFieldsRaw: [
                  { name: "regularPrice", value: { centAmount: 1799 } },
                ],
              },
            },
          },
        },
      },
    },
  },
};

describe("parseProductJson", () => {
  it("extracts everything we care about from the Coors Light fixture", () => {
    const result = parseProductJson("10200449", "coors-light-4-2-abv-30-pack", COORS_LIGHT_FIXTURE);
    expect(result).toEqual({
      raleysId: "10200449",
      slug: "coors-light-4-2-abv-30-pack",
      name: "Coors Light 4.2% ABV, 30 Pack",
      brand: "Coors Light",
      sku: "10200449",
      upc: "00071990300302",
      packCount: 30,
      packUnitMl: 355,
      priceCents: 2799,
      regularPriceCents: 2799,
      discounted: false,
    });
  });

  it("flags discounted=true when discounted is non-null", () => {
    const result = parseProductJson("10200500", "sierra-nevada", SIERRA_NEVADA_DISCOUNTED_FIXTURE);
    expect(result.discounted).toBe(true);
    expect(result.priceCents).toBe(1399);
    expect(result.regularPriceCents).toBe(1799);
  });

  it("looks up attributes by name, not by array index", () => {
    // Same data but attributes shuffled. parseProductJson should still work.
    const shuffled = structuredClone(COORS_LIGHT_FIXTURE);
    shuffled.pageProps.product.masterData.current.masterVariant.attributesRaw.reverse();
    const result = parseProductJson("10200449", "coors-light-4-2-abv-30-pack", shuffled);
    expect(result.brand).toBe("Coors Light");
    expect(result.packCount).toBe(30);
    expect(result.upc).toBe("00071990300302");
  });

  it("falls back to first word of name when brand attribute is missing", () => {
    const noBrand = structuredClone(COORS_LIGHT_FIXTURE);
    noBrand.pageProps.product.masterData.current.masterVariant.attributesRaw =
      noBrand.pageProps.product.masterData.current.masterVariant.attributesRaw.filter(
        (a) => a.name !== "brand",
      );
    const result = parseProductJson("10200449", "coors-light-4-2-abv-30-pack", noBrand);
    expect(result.brand).toBe("Coors");
  });

  it("returns null UPC when primaryUPC attribute is missing", () => {
    const noUpc = structuredClone(COORS_LIGHT_FIXTURE);
    noUpc.pageProps.product.masterData.current.masterVariant.attributesRaw =
      noUpc.pageProps.product.masterData.current.masterVariant.attributesRaw.filter(
        (a) => a.name !== "primaryUPC",
      );
    const result = parseProductJson("10200449", "x", noUpc);
    expect(result.upc).toBeNull();
  });

  it("handles localized name objects (en-US wrapper)", () => {
    const localized = structuredClone(COORS_LIGHT_FIXTURE);
    (localized.pageProps.product.masterData.current as { name: unknown }).name = {
      "en-US": "Coors Light 4.2% ABV, 30 Pack",
    };
    const result = parseProductJson("10200449", "x", localized);
    expect(result.name).toBe("Coors Light 4.2% ABV, 30 Pack");
  });

  it("rejects responses missing required fields", () => {
    expect(() => parseProductJson("x", "y", {})).toThrow();
    expect(() =>
      parseProductJson("x", "y", { pageProps: { product: {} } }),
    ).toThrow();
  });

  it("rejects negative or zero prices", () => {
    const bad = structuredClone(COORS_LIGHT_FIXTURE);
    bad.pageProps.product.masterData.current.masterVariant.price.value.centAmount = 0;
    expect(() => parseProductJson("x", "y", bad)).toThrow();
  });
});

describe("fetchProductJson", () => {
  it("fetches with the correct buildId-templated URL and parses", async () => {
    let observedUrl = "";
    const stubFetch: typeof globalThis.fetch = async (url) => {
      observedUrl = String(url);
      return new Response(JSON.stringify(COORS_LIGHT_FIXTURE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const result = await fetchProductJson(
      "C2rj76tz9CZuu2IAGaLg0",
      "10200449",
      "coors-light-4-2-abv-30-pack",
      { fetch: stubFetch },
    );
    expect(observedUrl).toBe(
      "https://www.raleys.com/_next/data/C2rj76tz9CZuu2IAGaLg0/en/product/10200449/coors-light-4-2-abv-30-pack.json",
    );
    expect(result.priceCents).toBe(2799);
  });

  it("throws on 404 (stale buildId scenario)", async () => {
    const stubFetch: typeof globalThis.fetch = async () =>
      new Response("Not Found", { status: 404, statusText: "Not Found" });
    await expect(
      fetchProductJson("stale-build-id", "10200449", "x", { fetch: stubFetch }),
    ).rejects.toThrow(/404/);
  });
});
