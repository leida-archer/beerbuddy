import { describe, expect, it } from "vitest";
import { buildHref, parsePageState, type PageState } from "../url";

const empty: PageState = { sort: "best", pack: null, style: null, pickerOpen: false };

describe("parsePageState", () => {
  it("returns defaults for empty params", () => {
    expect(parsePageState({})).toEqual(empty);
  });

  it("reads sort=cheap and sort=oz", () => {
    expect(parsePageState({ sort: "cheap" }).sort).toBe("cheap");
    expect(parsePageState({ sort: "oz" }).sort).toBe("oz");
  });

  it("ignores unrecognized sort values", () => {
    expect(parsePageState({ sort: "totally-bogus" }).sort).toBe("best");
  });

  it("reads pack and style strings", () => {
    expect(parsePageState({ pack: "12", style: "ipa" })).toMatchObject({
      pack: "12",
      style: "ipa",
    });
  });

  it("reads fp=open as pickerOpen=true", () => {
    expect(parsePageState({ fp: "open" }).pickerOpen).toBe(true);
  });

  it("treats other fp values as closed", () => {
    expect(parsePageState({ fp: "closed" }).pickerOpen).toBe(false);
    expect(parsePageState({ fp: "" }).pickerOpen).toBe(false);
  });

  it("handles array-valued params (Next.js multi-value form)", () => {
    expect(parsePageState({ pack: ["12", "24"] }).pack).toBe("12");
  });
});

describe("buildHref — URL state model", () => {
  it("default state → /deals (no params)", () => {
    expect(buildHref(empty, {})).toBe("/deals");
  });

  it("sort=cheap only → /deals?sort=cheap", () => {
    expect(buildHref(empty, { sort: "cheap" })).toBe("/deals?sort=cheap");
  });

  it("multiple filters → /deals?sort=cheap&pack=12&style=ipa", () => {
    expect(
      buildHref(empty, { sort: "cheap", pack: "12", style: "ipa" }),
    ).toBe("/deals?sort=cheap&pack=12&style=ipa");
  });

  it("fp=open is added when pickerOpen=true", () => {
    expect(buildHref(empty, { pickerOpen: true })).toBe("/deals?fp=open");
  });

  it("fp=open + filters", () => {
    expect(
      buildHref(empty, { sort: "cheap", pack: "12", pickerOpen: true }),
    ).toBe("/deals?sort=cheap&pack=12&fp=open");
  });

  it("changing sort preserves other params", () => {
    const state: PageState = { sort: "best", pack: "12", style: "ipa", pickerOpen: true };
    expect(buildHref(state, { sort: "cheap" })).toBe(
      "/deals?sort=cheap&pack=12&style=ipa&fp=open",
    );
  });

  it("clearing pack with null preserves other params", () => {
    const state: PageState = { sort: "cheap", pack: "12", style: "ipa", pickerOpen: true };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?sort=cheap&style=ipa&fp=open",
    );
  });

  it("setting sort back to best removes it from URL", () => {
    const state: PageState = { sort: "cheap", pack: null, style: null, pickerOpen: false };
    expect(buildHref(state, { sort: "best" })).toBe("/deals");
  });

  it("closing picker (pickerOpen: false) removes fp from URL", () => {
    const state: PageState = { sort: "best", pack: null, style: null, pickerOpen: true };
    expect(buildHref(state, { pickerOpen: false })).toBe("/deals");
  });

  it("removing × on a filter chip preserves picker open state", () => {
    // Spec interaction map: "Tap × on a filter chip | remove that param; fp untouched"
    const state: PageState = { sort: "best", pack: "12", style: "ipa", pickerOpen: true };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?style=ipa&fp=open",
    );
  });

  it("toggling picker on with no filters → /deals?fp=open", () => {
    expect(buildHref(empty, { pickerOpen: true })).toBe("/deals?fp=open");
  });
});
