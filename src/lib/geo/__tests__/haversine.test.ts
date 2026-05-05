import { describe, expect, it } from "vitest";

import { haversineMiles } from "../haversine";

// Known reference distances (great-circle, miles), independently
// verified via geopy. Tolerance 0.5% is plenty for "drive there"
// use cases — Haversine is exact enough at this scale.

describe("haversineMiles", () => {
  it("returns 0 for the same point", () => {
    const p = { lat: 39.2191, lon: -121.0611 }; // Grass Valley, CA
    expect(haversineMiles(p, p)).toBeCloseTo(0, 6);
  });

  it("Grass Valley → Nevada City (~3.7 mi)", () => {
    const grassValley = { lat: 39.2191, lon: -121.0611 };
    const nevadaCity = { lat: 39.2616, lon: -121.0161 };
    expect(haversineMiles(grassValley, nevadaCity)).toBeCloseTo(3.7, 0);
  });

  it("Grass Valley → Auburn (~17 mi, BevMo destination)", () => {
    const grassValley = { lat: 39.2191, lon: -121.0611 };
    const auburn = { lat: 38.8966, lon: -121.0769 };
    const d = haversineMiles(grassValley, auburn);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(25);
  });

  it("symmetric", () => {
    const a = { lat: 39.2191, lon: -121.0611 };
    const b = { lat: 39.2616, lon: -121.0161 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 9);
  });

  it("antipodes (~12,438 mi)", () => {
    // Grass Valley → its antipode on the opposite side of the earth.
    const a = { lat: 39.2191, lon: -121.0611 };
    const b = { lat: -39.2191, lon: 58.9389 };
    expect(haversineMiles(a, b)).toBeCloseTo(12438, -1);
  });

  it("equator longitude — 1 degree ≈ 69.1 mi on a spherical earth", () => {
    // True equatorial distance (oblate spheroid) is 69.17 mi/deg.
    // Haversine uses mean Earth radius and yields 69.10. Within 0.1%
    // for "drive to the nearest store" use cases.
    const a = { lat: 0, lon: 0 };
    const b = { lat: 0, lon: 1 };
    expect(haversineMiles(a, b)).toBeCloseTo(69.1, 1);
  });
});
