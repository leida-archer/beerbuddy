import { describe, expect, it } from "vitest";

import { formatCents, parsePrice } from "../price";

describe("parsePrice", () => {
  it("parses a standard dollar string", () => {
    expect(parsePrice("$13.99")).toBe(1399);
    expect(parsePrice("$0.99")).toBe(99);
    expect(parsePrice("$22.99")).toBe(2299);
  });

  it("parses without the dollar sign", () => {
    expect(parsePrice("13.99")).toBe(1399);
    expect(parsePrice("17")).toBe(1700);
  });

  it("parses with surrounding whitespace", () => {
    expect(parsePrice("  $13.99 ")).toBe(1399);
    expect(parsePrice("\n$22.99\n")).toBe(2299);
  });

  it("handles single-digit cents (pads)", () => {
    expect(parsePrice("$13.9")).toBe(1390);
    expect(parsePrice("$13.0")).toBe(1300);
  });

  it("handles missing cents", () => {
    expect(parsePrice("$22")).toBe(2200);
    expect(parsePrice("22")).toBe(2200);
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
