import { describe, expect, it } from "vitest";
import { getDealById, pricePerOz } from "../deals";

describe("getDealById", () => {
  it("returns the deal joined with its full Store record for a known id", async () => {
    // Use a known id from the current fixture. If the fixture is
    // ever rebuilt with different ids, update this test to match.
    const result = await getDealById("savemart-193352");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("savemart-193352");
    expect(result?.store).toMatchObject({
      id: "savemart-nevada-city",
      name: "Save Mart",
      city: "Nevada City",
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
    expect(await getDealById("savemart-193")).toBeNull();
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
