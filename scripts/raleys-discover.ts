/**
 * Raley's discovery script.
 *
 * Run this once locally to verify the adapter's selector assumptions
 * against the actual Raley's category page. Captures a screenshot and
 * a DOM snapshot to /tmp/ for inspection.
 *
 * Usage:
 *   bun run scripts/raleys-discover.ts
 *
 * Optional flags:
 *   --headed         Open a real browser window (default: headless).
 *   --pmc 18         Specific PMC category (default: 18 / wine-beer-spirits).
 *   --slow           Slow-mo by 250 ms per Playwright step.
 *
 * Outputs:
 *   /tmp/raleys-discover-{timestamp}.png   full-page screenshot
 *   /tmp/raleys-discover-{timestamp}.html  rendered DOM snapshot
 *   /tmp/raleys-discover-{timestamp}.json  diagnostic counts
 *
 * After running, inspect the .html and .png files. If product cards
 * are visible and our extraction script doesn't pick them up, adjust
 * src/lib/ingest/adapters/raleys/extract.ts to match the real DOM.
 */

import fs from "node:fs/promises";
import { chromium } from "playwright";

import { extractProducts, loadAllPages } from "@/lib/ingest/adapters/raleys/extract";
import { fetchRaleysProductSitemap } from "@/lib/ingest/adapters/raleys/sitemap";

interface Flags {
  headed: boolean;
  pmcId: number;
  slow: boolean;
  /** Cap on how many Load More clicks to do during discovery. Default 5
   * — enough to verify pagination works without a full ~190-click run. */
  loadMoreCap: number;
}

// XHRs we don't care about — filter out before reporting so the
// signal-to-noise of the diagnostic JSON is high.
const NOISE_HOSTS = [
  "google.com",
  "googletagmanager.com",
  "gstatic.com",
  "pinterest.com",
  "doubleclick.net",
  "facebook.com",
  "facebook.net",
  "applicationinsights.azure.com",
  "monitor.azure.com",
  "ads.nextdoor.com",
];

const NOISE_PATHS = ["/api/auth/csrf", "/recaptcha"];

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { headed: false, pmcId: 18, slow: false, loadMoreCap: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--headed") flags.headed = true;
    else if (arg === "--slow") flags.slow = true;
    else if (arg === "--pmc" && argv[i + 1]) {
      flags.pmcId = Number.parseInt(argv[++i], 10);
    } else if (arg === "--load-more" && argv[i + 1]) {
      flags.loadMoreCap = Number.parseInt(argv[++i], 10);
    }
  }
  return flags;
}

function isNoise(url: string): boolean {
  for (const host of NOISE_HOSTS) {
    if (url.includes(host)) return true;
  }
  for (const path of NOISE_PATHS) {
    if (url.includes(path)) return true;
  }
  return false;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outBase = `/tmp/raleys-discover-${ts}`;

  console.log(`[discover] flags: ${JSON.stringify(flags)}`);
  console.log(`[discover] artifacts will be written to ${outBase}.{png,html,json}`);

  // Step 1: sitemap fetch.
  const sitemapStart = Date.now();
  const sitemap = await fetchRaleysProductSitemap({ pmcId: flags.pmcId });
  console.log(
    `[discover] sitemap: ${sitemap.length} products in PMC${flags.pmcId} (fetched in ${Date.now() - sitemapStart}ms)`,
  );
  console.log(`[discover] first 3 sitemap entries:`);
  for (const p of sitemap.slice(0, 3)) {
    console.log(`           ${p.raleysId}  ${p.slug}`);
  }

  // Step 2: open Playwright.
  const browser = await chromium.launch({
    headless: !flags.headed,
    slowMo: flags.slow ? 250 : 0,
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1600 },
  });
  const page = await context.newPage();
  const url = `https://www.raleys.com/category/PMC${flags.pmcId}/wine-beer-spirits`;

  // Capture network signals so we can spot what API endpoints fire.
  // Tag each XHR with whether it happened before vs. after Load More
  // so we can isolate the actual product-fetch endpoint.
  let phase: "initial" | "loadmore" = "initial";
  const xhrUrls: Array<{
    phase: "initial" | "loadmore";
    method: string;
    url: string;
    status: number | null;
    contentType: string;
  }> = [];
  page.on("response", (resp) => {
    const url = resp.url();
    if (isNoise(url)) return;
    const ct = resp.headers()["content-type"] ?? "";
    const looksApiy = ct.includes("json") || url.includes("/api") || url.includes("resourceapi") || url.includes("graphql");
    if (looksApiy) {
      xhrUrls.push({
        phase,
        method: resp.request().method(),
        url,
        status: resp.status(),
        contentType: ct,
      });
    }
  });

  console.log(`[discover] navigating to ${url}`);
  const navStart = Date.now();
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  console.log(
    `[discover] nav response: ${response?.status() ?? "(no response)"} in ${Date.now() - navStart}ms`,
  );

  await page.waitForTimeout(2_000);

  // Count anchors at initial render before triggering pagination.
  const initialCount = await page.evaluate(() => {
    const RE = /^\/product\/(\d+)/;
    const seen = new Set<string>();
    document.querySelectorAll('a[href^="/product/"]').forEach((a) => {
      const m = RE.exec(a.getAttribute("href") ?? "");
      if (m) seen.add(m[1]);
    });
    return seen.size;
  });
  console.log(`[discover] initial anchor count: ${initialCount}`);

  // Step 3: trigger Load More to find the pagination XHR.
  phase = "loadmore";
  console.log(`[discover] clicking Load More up to ${flags.loadMoreCap} times…`);
  const clicks = await loadAllPages(page, { maxClicks: flags.loadMoreCap });
  await page.waitForTimeout(800);

  const visibleAfter = await page.evaluate(() => {
    const RE = /^\/product\/(\d+)/;
    const seen = new Set<string>();
    document.querySelectorAll('a[href^="/product/"]').forEach((a) => {
      const m = RE.exec(a.getAttribute("href") ?? "");
      if (m) seen.add(m[1]);
    });
    return seen.size;
  });
  console.log(`[discover] anchors after ${clicks} Load More clicks: ${visibleAfter}`);

  // Step 4: extract products and report.
  const scraped = await extractProducts(page);
  const withPrice = scraped.filter((p) => p.priceCents != null).length;
  console.log(
    `[discover] extracted ${scraped.length} cards; ${withPrice} have a parsed price`,
  );
  console.log(`[discover] first 5 extracted (id | name | price | was):`);
  for (const p of scraped.slice(0, 5)) {
    console.log(
      `           ${p.raleysId.padEnd(10)} ${p.name.slice(0, 40).padEnd(40)} ${
        p.priceCents != null ? `$${(p.priceCents / 100).toFixed(2)}` : "(no price)"
      }   was=${p.wasPriceCents != null ? `$${(p.wasPriceCents / 100).toFixed(2)}` : "—"}`,
    );
  }

  // Step 5: persist artifacts.
  const html = await page.content();
  await fs.writeFile(`${outBase}.html`, html);
  await page.screenshot({ path: `${outBase}.png`, fullPage: true });
  // Group XHRs by phase so we can see what the Load More click triggered.
  const initialXhrs = xhrUrls.filter((x) => x.phase === "initial");
  const loadmoreXhrs = xhrUrls.filter((x) => x.phase === "loadmore");

  await fs.writeFile(
    `${outBase}.json`,
    JSON.stringify(
      {
        url,
        navStatus: response?.status() ?? null,
        sitemapCount: sitemap.length,
        initialAnchorCount: initialCount,
        loadMoreClicks: clicks,
        anchorsAfterLoadMore: visibleAfter,
        cardsExtracted: scraped.length,
        cardsWithPrice: withPrice,
        firstFiveCards: scraped.slice(0, 5),
        xhrCounts: {
          initial: initialXhrs.length,
          loadmore: loadmoreXhrs.length,
        },
        xhrInitial: initialXhrs,
        xhrLoadMore: loadmoreXhrs,
      },
      null,
      2,
    ),
  );

  console.log(`[discover] XHR counts — initial: ${initialXhrs.length}, after Load More: ${loadmoreXhrs.length}`);
  if (loadmoreXhrs.length > 0) {
    console.log(`[discover] XHRs triggered by Load More (most likely product endpoint):`);
    for (const x of loadmoreXhrs.slice(0, 10)) {
      console.log(`           ${x.status} ${x.method} ${x.url.slice(0, 130)}`);
    }
  }

  console.log(`\n[discover] DONE`);
  console.log(`[discover]   HTML        ${outBase}.html`);
  console.log(`[discover]   Screenshot  ${outBase}.png`);
  console.log(`[discover]   Diagnostics ${outBase}.json`);
  console.log(`\n[discover] If extracted=0 or all prices are null, open the .html`);
  console.log(`[discover] in your editor and adjust the selector strategy in`);
  console.log(`[discover] src/lib/ingest/adapters/raleys/extract.ts.`);

  await browser.close();
}

main().catch((err) => {
  console.error("[discover] FAILED");
  console.error(err);
  process.exit(1);
});
