import { describe, expect, it } from "vitest";

import { fetchRaleysProductSitemap, parseSitemap } from "../sitemap";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.raleys.com/product/10260018/bogle-chardonnay</loc>
    <lastmod>2026-05-04T22:19:05.455Z</lastmod>
  </url>
  <url>
    <loc>https://www.raleys.com/product/10261825/tito_s-handmade-vodka</loc>
    <lastmod>2026-05-04T22:19:05.455Z</lastmod>
  </url>
  <url>
    <loc>https://www.raleys.com/product/10200449/coors-light-4-2-abv-30-pack</loc>
    <lastmod>2026-05-04T22:19:05.455Z</lastmod>
  </url>
  <url>
    <loc>https://www.raleys.com/category/PMC18/wine-beer-spirits</loc>
  </url>
  <url>
    <loc>https://www.raleys.com/product/30500041/don-julio-reposado</loc>
  </url>
</urlset>`;

describe("parseSitemap", () => {
  it("parses product URLs from a real-shaped sitemap fragment", () => {
    const result = parseSitemap(FIXTURE);
    expect(result).toHaveLength(4);
    expect(result.map((p) => p.raleysId)).toEqual([
      "10260018",
      "10261825",
      "10200449",
      "30500041",
    ]);
  });

  it("captures the slug separately from the ID", () => {
    const result = parseSitemap(FIXTURE);
    const coors = result.find((p) => p.raleysId === "10200449");
    expect(coors?.slug).toBe("coors-light-4-2-abv-30-pack");
  });

  it("preserves the full URL for navigation", () => {
    const result = parseSitemap(FIXTURE);
    expect(result[0].url).toBe(
      "https://www.raleys.com/product/10260018/bogle-chardonnay",
    );
  });

  it("parses lastmod into a Date when present", () => {
    const result = parseSitemap(FIXTURE);
    expect(result[0].lastModified).toBeInstanceOf(Date);
    expect(result[0].lastModified?.toISOString()).toBe(
      "2026-05-04T22:19:05.455Z",
    );
  });

  it("returns null lastModified when absent", () => {
    const result = parseSitemap(FIXTURE);
    const donJulio = result.find((p) => p.raleysId === "30500041");
    expect(donJulio?.lastModified).toBeNull();
  });

  it("ignores non-product URLs (categories, content pages)", () => {
    const result = parseSitemap(FIXTURE);
    // The fixture contains a /category/ URL — it should be skipped.
    expect(result.find((p) => p.url.includes("/category/"))).toBeUndefined();
  });

  it("handles empty input", () => {
    expect(parseSitemap("")).toEqual([]);
    expect(parseSitemap("<urlset></urlset>")).toEqual([]);
  });

  it("ignores malformed url blocks", () => {
    const partial = "<urlset><url></url></urlset>";
    expect(parseSitemap(partial)).toEqual([]);
  });
});

describe("fetchRaleysProductSitemap", () => {
  it("fetches the PMC18 sitemap and parses it", async () => {
    const stubFetch: typeof globalThis.fetch = async (url) => {
      expect(String(url)).toContain("/sitemap/products/PMC18/products-sitemap.xml");
      return new Response(FIXTURE, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    };
    const result = await fetchRaleysProductSitemap({ fetch: stubFetch });
    expect(result).toHaveLength(4);
  });

  it("respects the pmcId parameter", async () => {
    let observedUrl = "";
    const stubFetch: typeof globalThis.fetch = async (url) => {
      observedUrl = String(url);
      return new Response("<urlset></urlset>", { status: 200 });
    };
    await fetchRaleysProductSitemap({ pmcId: 7, fetch: stubFetch });
    expect(observedUrl).toContain("/sitemap/products/PMC7/products-sitemap.xml");
  });

  it("throws on non-2xx response", async () => {
    const stubFetch: typeof globalThis.fetch = async () =>
      new Response("Forbidden", { status: 403, statusText: "Forbidden" });
    await expect(
      fetchRaleysProductSitemap({ fetch: stubFetch }),
    ).rejects.toThrow(/403/);
  });
});
