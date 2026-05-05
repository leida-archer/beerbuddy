/**
 * Raley's sitemap fetch + parse.
 *
 * Per /design-consultation web audit: raleys.com/robots.txt allows
 * /sitemap/* but disallows /api. The sitemap is the canonical
 * enumeration of products and is publicly indexable, so plain fetch
 * is appropriate (no Playwright needed for this step).
 *
 * Structure observed 2026-05-05:
 *   sitemap.xml              → sitemap index pointing to 5 children
 *   sitemap/products-sitemap.xml
 *                            → meta-index pointing to 18 per-category
 *                              sitemaps at PMC{N}
 *   sitemap/products/PMC18/products-sitemap.xml
 *                            → ~400 product URLs in wine/beer/spirits
 *                              with the pattern /product/{id}/{slug}
 */

const RALEYS_PRODUCT_URL_RE =
  /^https:\/\/(?:www\.)?raleys\.com\/product\/(\d+)\/([^\s<>"]+)$/;

export interface SitemapProduct {
  /** Canonical Raley's product ID (the numeric portion of the URL). */
  raleysId: string;
  /** URL slug — includes brand and pack hints. */
  slug: string;
  /** Full product URL for navigation. */
  url: string;
  /** lastmod from the sitemap, or null if absent. */
  lastModified: Date | null;
}

/**
 * Fetch the wine-beer-spirits products sitemap (PMC18 by default)
 * and return a parsed list of product entries.
 *
 * Pure fetch — no Playwright. Works in Node, in the browser, in
 * Workers, anywhere. Uses the injected fetch so callers can stub
 * for testing.
 */
export async function fetchRaleysProductSitemap(
  options: {
    pmcId?: number;
    fetch?: typeof globalThis.fetch;
  } = {},
): Promise<SitemapProduct[]> {
  const pmcId = options.pmcId ?? 18;
  const url = `https://www.raleys.com/sitemap/products/PMC${pmcId}/products-sitemap.xml`;
  const f = options.fetch ?? globalThis.fetch;

  const response = await f(url, {
    headers: {
      // Identify ourselves; not stealth. Raley's may want to know us
      // by referrer in their logs.
      "User-Agent": "BeerBuddy/0 (+https://github.com/archer-leida/beerbuddy)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Sitemap fetch failed: ${response.status} ${response.statusText} for ${url}`,
    );
  }

  const xml = await response.text();
  return parseSitemap(xml);
}

/**
 * Parse a raleys.com products sitemap XML body into a list of
 * SitemapProduct entries. Tolerant of whitespace and minor format
 * variations; ignores non-product URLs that may sneak in.
 */
export function parseSitemap(xml: string): SitemapProduct[] {
  const results: SitemapProduct[] = [];
  // Each <url>...</url> block contains <loc> and optional <lastmod>.
  // Regex parsing is appropriate here — sitemap XML is well-formed
  // and shallow, so a real XML parser would be overkill.
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/g;
  for (const match of xml.matchAll(urlBlockRe)) {
    const block = match[1];
    const locMatch = /<loc>([^<]+)<\/loc>/.exec(block);
    if (!locMatch) continue;
    const loc = locMatch[1].trim();

    const productMatch = RALEYS_PRODUCT_URL_RE.exec(loc);
    if (!productMatch) continue;

    const lastmodMatch = /<lastmod>([^<]+)<\/lastmod>/.exec(block);
    const lastModified =
      lastmodMatch != null ? new Date(lastmodMatch[1].trim()) : null;

    results.push({
      raleysId: productMatch[1],
      slug: productMatch[2],
      url: loc,
      lastModified: lastModified && !Number.isNaN(lastModified.valueOf()) ? lastModified : null,
    });
  }
  return results;
}
