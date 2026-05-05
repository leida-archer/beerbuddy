import { describe, expect, it } from "vitest";

import { formatCents, parsePrice } from "../price";

describe("parsePrice", () => {
  it("parses a standard dollar string", () => {
    expect(parsePrice("$13.99")).toBe(1399);
    expect(parsePrice("$0.99")).toBe(99);
    expect(parsePrice("$22.99")).toBe(2299);
  });

  it("parses a decimal-formatted price without dollar sign", () => {
    expect(parsePrice("13.99")).toBe(1399);
    expect(parsePrice("22.99")).toBe(2299);
  });

  it("parses with surrounding whitespace", () => {
    expect(parsePrice("  $13.99 ")).toBe(1399);
    expect(parsePrice("\n$22.99\n")).toBe(2299);
  });

  it("handles single-digit cents (pads)", () => {
    expect(parsePrice("$13.9")).toBe(1390);
    expect(parsePrice("$13.0")).toBe(1300);
  });

  it("handles missing cents when the dollar sign is present", () => {
    expect(parsePrice("$22")).toBe(2200);
  });

  it("rejects bare integers without a dollar sign or decimal", () => {
    // This is the Raley's bug — "Buy 6" and "750ml" must NOT parse
    // as $6 / $750 just because they contain a number.
    expect(parsePrice("Buy 6")).toBeNull();
    expect(parsePrice("750")).toBeNull();
    expect(parsePrice("12 pack")).toBeNull();
    expect(parsePrice("17")).toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("price unavailable")).toBeNull();
    expect(parsePrice("$")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
  });

  it("handles a comma decimal (some chains use European format)", () => {
    expect(parsePrice("$13,99")).toBe(1399);
  });

  it("ignores trailing junk after a valid price", () => {
    expect(parsePrice("$13.99 each")).toBe(1399);
    expect(parsePrice("$13.99/12-pack")).toBe(1399);
  });

  it("ignores per-unit prices when the dollar version comes first", () => {
    // Real Raley's pattern: "$22.99 ... $0.16 / oz" — the headline
    // price is $22.99; the per-oz figure must not win.
    expect(parsePrice("$22.99 ... $0.16 / oz")).toBe(2299);
  });

  it("rejects non-string input", () => {
    expect(parsePrice(undefined as unknown as string)).toBeNull();
    expect(parsePrice(null as unknown as string)).toBeNull();
    expect(parsePrice(13.99 as unknown as string)).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats round dollars with .00", () => {
    expect(formatCents(2200)).toBe("$22.00");
  });

  it("formats single-digit cents with leading zero", () => {
    expect(formatCents(1305)).toBe("$13.05");
  });

  it("formats two-digit cents", () => {
    expect(formatCents(1399)).toBe("$13.99");
  });

  it("handles zero", () => {
    expect(formatCents(0)).toBe("$0.00");
  });

  it("handles negative values", () => {
    expect(formatCents(-99)).toBe("-$0.99");
  });

  it("handles non-finite", () => {
    expect(formatCents(Number.NaN)).toBe("—");
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
