/**
 * Discover the Raley's Next.js buildId.
 *
 * Each Raley's deploy gets a unique buildId (e.g. "C2rj76tz9CZuu2IAGaLg0")
 * that's part of every `_next/data/{buildId}/...` URL. The buildId is
 * embedded in the homepage's `<script id="__NEXT_DATA__" type="application/json">`
 * tag — fetching the homepage HTML and regex-extracting it works without
 * Playwright.
 *
 * Fetches the homepage once per ingestion run, caches buildId for the
 * subsequent product-JSON fetches. ~80 ms per discovery; cheap.
 *
 * If Raley's deploys mid-run, the buildId for half the products will be
 * stale and those fetches will 404. Adapter handles this by retrying the
 * buildId fetch and continuing.
 */

const HOMEPAGE_URL = "https://www.raleys.com/";
// Match a <script> tag whose attributes (in any order) include
// id="__NEXT_DATA__". The order-independent matcher is more robust to
// minor build changes that re-emit attributes in a different order.
const NEXT_DATA_RE =
  /<script\b[^>]*?\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;

export async function fetchRaleysBuildId(options: {
  fetch?: typeof globalThis.fetch;
} = {}): Promise<string> {
  const f = options.fetch ?? globalThis.fetch;

  const response = await f(HOMEPAGE_URL, {
    headers: {
      "User-Agent": "BeerBuddy/0 (+https://github.com/archer-leida/beerbuddy)",
      Accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Homepage fetch for buildId failed: ${response.status} ${response.statusText}`,
    );
  }
  const html = await response.text();
  return extractBuildId(html);
}

/**
 * Extract the buildId from a page's HTML by parsing the embedded
 * __NEXT_DATA__ JSON. Exported for unit testing.
 */
export function extractBuildId(html: string): string {
  const match = NEXT_DATA_RE.exec(html);
  if (!match) {
    throw new Error("No __NEXT_DATA__ script found in homepage HTML");
  }
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(
      `__NEXT_DATA__ JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as { buildId?: unknown }).buildId !== "string"
  ) {
    throw new Error("__NEXT_DATA__ does not contain a string buildId");
  }
  return (data as { buildId: string }).buildId;
}
