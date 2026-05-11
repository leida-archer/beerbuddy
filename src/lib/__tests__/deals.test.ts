import { describe, expect, it } from "vitest";
import { getDealById, getDeals, pricePerOz } from "../deals";

describe("getDealById", () => {
  it("returns the first fixture deal joined with its full Store record", async () => {
    // Pick the first deal dynamically — keeps the test stable across
    // fixture rebuilds (the canonical ID format may change when the
    // builder is re-run; see scripts/build-fixtures.ts).
    const { deals } = await getDeals();
    expect(deals.length).toBeGreaterThan(0);
    const probe = deals[0];

    const result = await getDealById(probe.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(probe.id);
    expect(result?.store.id).toBe(probe.storeId);
    expect(result?.store).toMatchObject({
      name: probe.storeName,
      city: probe.storeCity,
    });
    // The legacy denormalized fields are stripped:
    expect(
      (result as unknown as Record<string, unknown>).storeId,
    ).toBeUndefined();
    expect(
      (result as unknown as Record<string, unknown>).storeName,
    ).toBeUndefined();
  });

  it("returns null for an unknown id", async () => {
    expect(await getDealById("definitely-not-a-real-id")).toBeNull();
  });

  it("returns null for the empty string id", async () => {
    expect(await getDealById("")).toBeNull();
  });

  it("does not match a substring of another id", async () => {
    // Defensive: the find uses === not includes/startsWith.
    const { deals } = await getDeals();
    const truncated = deals[0].id.slice(0, deals[0].id.length - 1);
    expect(await getDealById(truncated)).toBeNull();
  });
});

describe("pricePerOz", () => {
  it("computes dollars per fluid ounce for a 12-pack of 12oz cans", () => {
    // 12 cans × 355 mL = 4260 mL ≈ 144 fl oz. $18.99 / 144oz ≈ $0.132/oz.
    const ppoz = pricePerOz({
      priceCents: 1899,
      packCount: 12,
      packUnitMl: 355,
    });
    expect(ppoz).not.toBeNull();
    expect(ppoz!).toBeCloseTo(0.132, 2);
  });

  it("returns null when packCount is null", () => {
    expect(
      pricePerOz({ priceCents: 1899, packCount: null, packUnitMl: 355 }),
    ).toBeNull();
  });

  it("returns null when packUnitMl is null", () => {
    expect(
      pricePerOz({ priceCents: 1899, packCount: 12, packUnitMl: null }),
    ).toBeNull();
  });

  it("returns null when packCount or packUnitMl is zero", () => {
    expect(
      pricePerOz({ priceCents: 1899, packCount: 0, packUnitMl: 355 }),
    ).toBeNull();
    expect(
      pricePerOz({ priceCents: 1899, packCount: 12, packUnitMl: 0 }),
    ).toBeNull();
  });
});
