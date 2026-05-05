import { describe, expect, it } from "vitest";

import { extractBuildId, fetchRaleysBuildId } from "../buildId";

const FIXTURE_HTML = `<!DOCTYPE html>
<html><head><title>Raley's</title></head>
<body>
<div id="__next">…</div>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{}},"page":"/","query":{},"buildId":"C2rj76tz9CZuu2IAGaLg0","assetPrefix":"","runtimeConfig":{}}
</script>
</body>
</html>`;

describe("extractBuildId", () => {
  it("pulls buildId from a valid __NEXT_DATA__ script", () => {
    expect(extractBuildId(FIXTURE_HTML)).toBe("C2rj76tz9CZuu2IAGaLg0");
  });

  it("works regardless of script attribute order", () => {
    const html = `<script type="application/json" id="__NEXT_DATA__">{"buildId":"abc123"}</script>`;
    expect(extractBuildId(html)).toBe("abc123");
  });

  it("throws when __NEXT_DATA__ is absent", () => {
    expect(() => extractBuildId("<html><body>nothing</body></html>")).toThrow(
      /No __NEXT_DATA__/,
    );
  });

  it("throws on malformed JSON", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">not-json</script>`;
    expect(() => extractBuildId(html)).toThrow(/JSON parse/);
  });

  it("throws when buildId field is missing", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">{"page":"/"}</script>`;
    expect(() => extractBuildId(html)).toThrow(/buildId/);
  });
});

describe("fetchRaleysBuildId", () => {
  it("fetches the homepage and extracts the buildId", async () => {
    let observedUrl = "";
    const stubFetch: typeof globalThis.fetch = async (url) => {
      observedUrl = String(url);
      return new Response(FIXTURE_HTML, { status: 200 });
    };
    const buildId = await fetchRaleysBuildId({ fetch: stubFetch });
    expect(buildId).toBe("C2rj76tz9CZuu2IAGaLg0");
    expect(observedUrl).toBe("https://www.raleys.com/");
  });

  it("throws on non-2xx response", async () => {
    const stubFetch: typeof globalThis.fetch = async () =>
      new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" });
    await expect(fetchRaleysBuildId({ fetch: stubFetch })).rejects.toThrow(
      /503/,
    );
  });
});
