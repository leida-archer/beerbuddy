import { describe, expect, it } from "vitest";

import { isPriceSane } from "../sanity";

describe("isPriceSane", () => {
  it("allows the first observation (no prior)", () => {
    expect(isPriceSane(null, 1399).ok).toBe(true);
    expect(isPriceSane(undefined, 1399).ok).toBe(true);
  });

  it("allows small price changes within bounds", () => {
    expect(isPriceSane(1399, 1499).ok).toBe(true);
    expect(isPriceSane(1399, 1299).ok).toBe(true);
    expect(isPriceSane(1399, 1399).ok).toBe(true);
  });

  it("allows reasonable sales (down to 20% of prior)", () => {
    expect(isPriceSane(2000, 500).ok).toBe(true); // 25% of prior — sale
    expect(isPriceSane(2000, 400).ok).toBe(true); // exactly 20% — boundary
  });

  it("rejects glitch-high prices (> 5x prior)", () => {
    const verdict = isPriceSane(1399, 9999);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe("sanity_bounds_high");
  });

  it("rejects glitch-low prices (< 20% prior)", () => {
    const verdict = isPriceSane(2000, 100);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe("sanity_bounds_low");
  });

  it("rejects zero or negative new prices", () => {
    expect(isPriceSane(1399, 0).ok).toBe(false);
    expect(isPriceSane(1399, -100).ok).toBe(false);
  });

  it("rejects non-finite new prices", () => {
    expect(isPriceSane(1399, Number.NaN).ok).toBe(false);
    expect(isPriceSane(1399, Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it("treats a bad prior charitably (allows the new price through)", () => {
    expect(isPriceSane(0, 1399).ok).toBe(true);
    expect(isPriceSane(-1, 1399).ok).toBe(true);
    expect(isPriceSane(Number.NaN, 1399).ok).toBe(true);
  });

  it("the documented Sierra Nevada glitch scenario from /plan-eng-review", () => {
    // Mon: $13.99. Tue: site glitches and shows $99.00.
    const verdict = isPriceSane(1399, 9900);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toBe("sanity_bounds_high");
  });
});
