import { describe, expect, it } from "vitest";
import { buildDetailHref, buildHref, parsePageState, type PageState } from "../url";

const empty: PageState = {
  zip: "95945",
  sort: "best",
  pack: null,
  pickerOpen: false,
};

describe("parsePageState", () => {
  it("returns defaults for empty params (zip defaults to empty string)", () => {
    expect(parsePageState({})).toEqual({
      zip: "",
      sort: "best",
      pack: null,
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

  it("reads pack string", () => {
    expect(parsePageState({ pack: "12" })).toMatchObject({ pack: "12" });
  });

  // Backward-compat: stale `?style=` URLs are silently dropped post-2026-05-12.
  it("silently ignores legacy style param", () => {
    const state = parsePageState({ style: "ipa", zip: "95945", pack: "12" });
    expect(state).toEqual({
      zip: "95945",
      sort: "best",
      pack: "12",
      pickerOpen: false,
    });
    expect("style" in state).toBe(false);
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

  it("sort + pack → /deals?zip=95945&sort=cheap&pack=12", () => {
    expect(buildHref(empty, { sort: "cheap", pack: "12" })).toBe(
      "/deals?zip=95945&sort=cheap&pack=12",
    );
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
      pickerOpen: true,
    };
    expect(buildHref(state, { sort: "cheap" })).toBe(
      "/deals?zip=95945&sort=cheap&pack=12&fp=open",
    );
  });

  it("clearing pack with null preserves zip and other params", () => {
    const state: PageState = {
      zip: "95945",
      sort: "cheap",
      pack: "12",
      pickerOpen: true,
    };
    expect(buildHref(state, { pack: null })).toBe(
      "/deals?zip=95945&sort=cheap&fp=open",
    );
  });

  it("setting sort back to best removes sort but keeps zip", () => {
    const state: PageState = {
      zip: "95945",
      sort: "cheap",
      pack: null,
      pickerOpen: false,
    };
    expect(buildHref(state, { sort: "best" })).toBe("/deals?zip=95945");
  });

  it("closing picker (pickerOpen: false) removes fp but keeps zip", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: null,
      pickerOpen: true,
    };
    expect(buildHref(state, { pickerOpen: false })).toBe("/deals?zip=95945");
  });

  it("removing × on a pack chip preserves picker open + zip", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: "12",
      pickerOpen: true,
    };
    expect(buildHref(state, { pack: null })).toBe("/deals?zip=95945&fp=open");
  });

  it("zip is always the first param in the query string", () => {
    // Locks the param order so URLs have a predictable shape.
    const state: PageState = {
      zip: "95959",
      sort: "cheap",
      pack: "24",
      pickerOpen: false,
    };
    expect(buildHref(state, {})).toBe("/deals?zip=95959&sort=cheap&pack=24");
  });

  it("a different zip is preserved across changes", () => {
    const state: PageState = {
      zip: "95946",
      sort: "best",
      pack: null,
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
      pickerOpen: true,
    };
    expect(buildDetailHref(state, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945&sort=cheap&pack=12&fp=open",
    );
  });

  it("preserves picker-open even when no filters are set", () => {
    const state: PageState = {
      zip: "95945",
      sort: "best",
      pack: null,
      pickerOpen: true,
    };
    expect(buildDetailHref(state, "savemart-19724833")).toBe(
      "/deals/savemart-19724833?zip=95945&fp=open",
    );
  });

  // Regression guard: the legacy style param must never reappear in detail hrefs.
  it("never emits a style param", () => {
    const variations: PageState[] = [
      { zip: "95945", sort: "best", pack: null, pickerOpen: false },
      { zip: "95945", sort: "cheap", pack: "12", pickerOpen: true },
      { zip: "95959", sort: "oz", pack: "24", pickerOpen: false },
    ];
    for (const state of variations) {
      expect(buildDetailHref(state, "x")).not.toContain("style=");
    }
  });

  it("encodes deal IDs with reserved characters", () => {
    // Defensive: existing fixture IDs are URL-safe, but encoding
    // protects future adapters that might emit slashes or spaces.
    expect(buildDetailHref(empty, "weird id/with chars")).toBe(
      "/deals/weird%20id%2Fwith%20chars?zip=95945",
    );
  });
});
