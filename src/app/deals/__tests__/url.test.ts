import { describe, expect, it } from "vitest";
import { buildDetailHref, buildHref, parsePageState, type PageState } from "../url";

const empty: PageState = {
  zip: "95945",
  sort: "best",
  pack: null,
  style: null,
  pickerOpen: false,
};

describe("parsePageState", () => {
  it("returns defaults for empty params (zip defaults to empty string)", () => {
    expect(parsePageState({})).toEqual({
      zip: "",
      sort: "best",
      pack: null,
      style: null,
      pickerOpen: false,
    });
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

  it("reads zip from searchParams", () => {
    expect(parsePageState({ zip: "95945" }).zip).toBe("95945");
  });

  it("defaults zip to empty string when absent", () => {
    expect(parsePageState({}).zip).toBe("");
  });
});

describe("buildHref — URL state model", () => {
  it("default state → /deals?zip=95945 (zip always emitted)", () => {
    expect(buildHref(empty, {})).toBe("/deals?zip=95945");
  });

  it("sort=cheap only → /deals?zip=95945&sort=cheap", () => {
    expect(buildHref(empty, { sort: "cheap" })).toBe("/deals?zip=95945&sort=cheap");
  });

  it("multiple filters → /deals?zip=95945&sort=cheap&pack=12&style=ipa", () => {
    expect(
      buildHref(empty, { sort: "cheap", pack: "12", style: "ipa" }),
    ).toBe("/deals?zip=95945&sort=cheap&pack=12&style=ipa");
  });

  it("fp=open is added when pickerOpen=true", () => {
    expect(buildHref(empty, { pickerOpen: true })).toBe("/deals?zip=95945&fp=open");
  });

  it("fp=open + filters", () => {
    expect(
      buildHref(empty, { sort: "cheap", pack: "12", pickerOpen: true }),
    ).toBe("/deals?zip=95945&sort=cheap&pack=12&fp=open");
  });

  it("changing sort preserves other params (including zip)", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: "12",
      style: "ipa",
      pickerOpen: true,
    };
    expect(buildHref(state, { sort: "cheap" })).toBe(
      "/deals?zip=95945&sort=cheap&pack=12&style=ipa&fp=open",
    );
  });

  it("clearing pack with null preserves zip and other params", () => {
    const state: PageState = {
      zip: "95945",
      sort: "cheap",
      pack: "12",
      style: "ipa",
      pickerOpen: true,
    };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?zip=95945&sort=cheap&style=ipa&fp=open",
    );
  });

  it("setting sort back to best removes sort but keeps zip", () => {
    const state: PageState = {
      zip: "95945",
      sort: "cheap",
      pack: null,
      style: null,
      pickerOpen: false,
    };
    expect(buildHref(state, { sort: "best" })).toBe("/deals?zip=95945");
  });

  it("closing picker (pickerOpen: false) removes fp but keeps zip", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: null,
      style: null,
      pickerOpen: true,
    };
    expect(buildHref(state, { pickerOpen: false })).toBe("/deals?zip=95945");
  });

  it("removing × on a filter chip preserves picker open + zip", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: "12",
      style: "ipa",
      pickerOpen: true,
    };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?zip=95945&style=ipa&fp=open",
    );
  });

  it("zip is always the first param in the query string", () => {
    // Locks the param order so URLs have a predictable shape.
    const state: PageState = {
      zip: "95959",
      sort: "cheap",
      pack: "24",
      style: null,
      pickerOpen: false,
    };
    expect(buildHref(state, {})).toBe("/deals?zip=95959&sort=cheap&pack=24");
  });

  it("a different zip is preserved across changes", () => {
    const state: PageState = {
      zip: "95946",
      sort: "best",
      pack: null,
      style: null,
      pickerOpen: false,
    };
    expect(buildHref(state, { sort: "oz" })).toBe("/deals?zip=95946&sort=oz");
  });
});

describe("buildDetailHref", () => {
  it("minimal state → /deals/<id>?zip=<zip>", () => {
    expect(buildDetailHref(empty, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945",
    );
  });

  it("preserves all filter params on the detail URL", () => {
    const state: PageState = {
      zip: "95945",
      sort: "cheap",
      pack: "12",
      style: "ipa",
      pickerOpen: true,
    };
    expect(buildDetailHref(state, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945&sort=cheap&pack=12&style=ipa&fp=open",
    );
  });

  it("preserves picker-open even when no filters are set", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: null,
      style: null,
      pickerOpen: true,
    };
    expect(buildDetailHref(state, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945&fp=open",
    );
  });

  it("encodes deal IDs with reserved characters", () => {
    // Defensive: existing fixture IDs are URL-safe, but encoding
    // protects future adapters that might emit slashes or spaces.
    expect(buildDetailHref(empty, "weird id/with chars")).toBe(
      "/deals/weird%20id%2Fwith%20chars?zip=95945",
    );
  });
});
