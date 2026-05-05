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

import { extractProducts, scrollUntilStable } from "@/lib/ingest/adapters/raleys/extract";
import { fetchRaleysProductSitemap } from "@/lib/ingest/adapters/raleys/sitemap";

interface Flags {
  headed: boolean;
  pmcId: number;
  slow: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { headed: false, pmcId: 18, slow: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--headed") flags.headed = true;
    else if (arg === "--slow") flags.slow = true;
    else if (arg === "--pmc" && argv[i + 1]) {
      flags.pmcId = Number.parseInt(argv[++i], 10);
    }
  }
  return flags;
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
  const xhrUrls: Array<{ method: string; url: string; status: number | null }> = [];
  page.on("response", (resp) => {
    const ct = resp.headers()["content-type"] ?? "";
    if (ct.includes("json") || resp.url().includes("/api")) {
      xhrUrls.push({
        method: resp.request().method(),
        url: resp.url(),
        status: resp.status(),
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

  // Step 3: scroll-to-stable and count anchors.
  const visibleAfter = await scrollUntilStable(page);
  console.log(`[discover] product anchors after scroll-to-stable: ${visibleAfter}`);

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
  await fs.writeFile(
    `${outBase}.json`,
    JSON.stringify(
      {
        url,
        navStatus: response?.status() ?? null,
        sitemapCount: sitemap.length,
        anchorsAfterScroll: visibleAfter,
        cardsExtracted: scraped.length,
        cardsWithPrice: withPrice,
        firstFiveCards: scraped.slice(0, 5),
        xhrSeen: xhrUrls.slice(0, 30),
      },
      null,
      2,
    ),
  );

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
