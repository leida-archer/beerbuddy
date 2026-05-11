import { describe, expect, it } from "vitest";

import { nameSimilarity } from "../nameSimilarity";

describe("nameSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(nameSimilarity("Sierra Nevada Pale Ale", "Sierra Nevada Pale Ale")).toBe(1);
  });

  it("returns 0 for fully disjoint token sets", () => {
    expect(nameSimilarity("Stone IPA", "Bud Light")).toBe(0);
  });

  it("treats case + punctuation as noise", () => {
    expect(nameSimilarity("Sierra-Nevada PALE ALE", "sierra nevada pale ale")).toBe(1);
  });

  it("surfaces matches that share the brand prefix and product name", () => {
    // Realistic Jaccard score for cross-chain naming where brand+product
    // tokens match but one side has a trailing qualifier. Above the
    // 0.6 findAliasCandidates threshold, so this pair gets shown.
    const sim = nameSimilarity(
      "Sierra Nevada Pale Ale",
      "Sierra Nevada Pale Ale Bottles",
    );
    expect(sim).toBeGreaterThanOrEqual(0.6);
    expect(sim).toBeLessThan(1);
  });

  it("Jaccard alone won't catch heavy abbreviations — documented v0 limitation", () => {
    // "Sierra Nev PA" only shares {sierra} with "Sierra Nevada Pale Ale".
    // 1/6 ≈ 0.17 — below the 0.6 surfacing threshold. Captured as a
    // test so the limitation is visible if/when we upgrade the heuristic.
    expect(nameSimilarity("Sierra Nev PA", "Sierra Nevada Pale Ale")).toBeLessThan(0.3);
  });

  it("partial overlap is between 0 and 1", () => {
    const sim = nameSimilarity("Stone IPA 6 pack", "Stone Delicious IPA");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("returns 0 when either input is empty after tokenization", () => {
    expect(nameSimilarity("", "Stone IPA")).toBe(0);
    expect(nameSimilarity("???", "...")).toBe(0);
  });

  it("token duplicates don't inflate similarity (Jaccard on sets)", () => {
    expect(nameSimilarity("ipa ipa ipa", "ipa")).toBe(1);
  });
});
