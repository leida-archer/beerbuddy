// src/lib/geo/__tests__/zip.test.ts
import { describe, expect, it } from "vitest";
import { isValidZip, SUPPORTED_ZIPS } from "../zip";

describe("isValidZip", () => {
  it("accepts each supported Nevada County ZIP", () => {
    expect(isValidZip("95945")).toBe(true); // Grass Valley
    expect(isValidZip("95946")).toBe(true); // Penn Valley
    expect(isValidZip("95949")).toBe(true); // Lake of the Pines
    expect(isValidZip("95959")).toBe(true); // Nevada City
  });

  it("rejects an out-of-area ZIP", () => {
    expect(isValidZip("90210")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidZip("")).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(isValidZip("abcde")).toBe(false);
  });

  it("rejects a wrong-length ZIP", () => {
    expect(isValidZip("9594512")).toBe(false);
  });
});

describe("SUPPORTED_ZIPS", () => {
  it("contains exactly the 4 v0 ZIPs", () => {
    expect(SUPPORTED_ZIPS.size).toBe(4);
    expect([...SUPPORTED_ZIPS].sort()).toEqual(["95945", "95946", "95949", "95959"]);
  });
});
