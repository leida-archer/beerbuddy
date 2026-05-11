import { describe, expect, it } from "vitest";

import { computeRow, dealScorePct, median } from "../baseline";

describe("median", () => {
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
  });

  it("returns the single value when length is 1", () => {
    expect(median([1399])).toBe(1399);
  });

  it("returns the middle value for odd-length arrays", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("does not mutate its input", () => {
    const input = [5, 1, 3];
    median(input);
    expect(input).toEqual([5, 1, 3]);
  });
});

describe("dealScorePct", () => {
  it("returns null when there's no baseline (no history)", () => {
    expect(dealScorePct(1399, null)).toBeNull();
  });

  it("returns null when baseline is zero or negative", () => {
    expect(dealScorePct(1399, 0)).toBeNull();
    expect(dealScorePct(1399, -100)).toBeNull();
  });

  it("returns 0 when current price is at or above median", () => {
    expect(dealScorePct(1500, 1500)).toBe(0);
    expect(dealScorePct(1700, 1500)).toBe(0); // above-median is 'not a deal', not negative
  });

  it("returns positive percent when current is below median", () => {
    // 1200 vs 1500 median = 20% off
    expect(dealScorePct(1200, 1500)).toBe(20);
  });

  it("rounds to the nearest integer percent", () => {
    // 1234 vs 1500 = 17.7333...% → 18
    expect(dealScorePct(1234, 1500)).toBe(18);
  });

  it("returns null on invalid current price", () => {
    expect(dealScorePct(Number.NaN, 1500)).toBeNull();
    expect(dealScorePct(0, 1500)).toBeNull();
    expect(dealScorePct(-100, 1500)).toBeNull();
  });
});

describe("computeRow", () => {
  it("rounds the fractional median to integer cents", () => {
    const row = computeRow({
      canonicalProductId: 1,
      storeId: "raleys-grass-valley",
      history: [1399, 1499, 1599, 1699], // median = 1549
      currentPriceCents: 1299,
    });
    expect(row.median90dCents).toBe(1549);
    // 1299 vs 1549 = 16.14...% → 16
    expect(row.dealScorePct).toBe(16);
  });

  it("propagates null score when history is empty", () => {
    const row = computeRow({
      canonicalProductId: 1,
      storeId: "raleys-grass-valley",
      history: [],
      currentPriceCents: 1299,
    });
    expect(row.median90dCents).toBeNull();
    expect(row.dealScorePct).toBeNull();
  });

  it("carries canonicalProductId + storeId through unchanged", () => {
    const row = computeRow({
      canonicalProductId: 42,
      storeId: "savemart-nevada-city",
      history: [1500, 1500],
      currentPriceCents: 1200,
    });
    expect(row.canonicalProductId).toBe(42);
    expect(row.storeId).toBe("savemart-nevada-city");
  });
});
