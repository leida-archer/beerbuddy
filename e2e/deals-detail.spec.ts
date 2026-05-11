import { test, expect } from "@playwright/test";
import fixture from "../src/data/fixtures/deals.json";

const SUPPORTED_ZIP = "95945"; // Grass Valley — always in the allowlist.

test.describe("/deals/[id] integration", () => {
  test("ZIP gate: missing zip param redirects to homepage", async ({ page }) => {
    const probe = fixture.deals[0]!;
    const resp = await page.goto(`/deals/${probe.id}`);
    // Redirect chain ends at "/" with no zip param.
    expect(page.url()).toMatch(/\/$/);
    expect(resp?.status()).toBeLessThan(400);
  });

  test("ZIP gate: invalid zip redirects to / with error param", async ({ page }) => {
    const probe = fixture.deals[0]!;
    await page.goto(`/deals/${probe.id}?zip=99999`);
    expect(page.url()).toContain("error=region");
    expect(page.url()).toContain("zip=99999");
  });

  test("happy path: renders price, store, get-directions for a known deal", async ({ page }) => {
    const probe = fixture.deals[0]!;
    await page.goto(`/deals/${probe.id}?zip=${SUPPORTED_ZIP}`);

    // Title rendered
    await expect(page.locator("h1")).toContainText(probe.name);

    // Price rendered in dollars format
    await expect(page.getByText(/\$\d+\.\d{2}/)).toBeVisible();

    // Get directions button present
    await expect(page.getByRole("link", { name: /Get directions/i })).toBeVisible();
  });

  test("unknown deal id renders the 404 page", async ({ page }) => {
    const resp = await page.goto(
      `/deals/this-deal-does-not-exist?zip=${SUPPORTED_ZIP}`,
    );
    expect(resp?.status()).toBe(404);
  });

  test("BevMo Auburn case shows 'further drive' hint when distance > 15 mi", async ({ page }) => {
    const bevmoDeal = fixture.deals.find((d) => d.storeId === "bevmo-auburn");
    test.skip(!bevmoDeal, "no bevmo fixture row to probe");
    await page.goto(`/deals/${bevmoDeal!.id}?zip=${SUPPORTED_ZIP}`);
    // Distance text is visible regardless; the hint is the new affordance.
    await expect(page.getByText(/further drive/i)).toBeVisible();
  });

  test("Limited price history eyebrow shows when dealScorePct is null", async ({ page }) => {
    const noScoreDeal = fixture.deals.find((d) => d.discountPct == null);
    test.skip(!noScoreDeal, "no fixture row with null discountPct to probe");
    await page.goto(`/deals/${noScoreDeal!.id}?zip=${SUPPORTED_ZIP}`);
    await expect(page.getByText(/Limited price history/i).first()).toBeVisible();
  });

  test("$/oz line hidden when pack info is unavailable", async ({ page }) => {
    const noPackDeal = fixture.deals.find(
      (d) => d.packCount == null || d.packUnitMl == null,
    );
    test.skip(!noPackDeal, "no fixture row missing pack info to probe");
    await page.goto(`/deals/${noPackDeal!.id}?zip=${SUPPORTED_ZIP}`);
    // The $/oz line is the only "/oz" text on the page when present.
    await expect(page.locator("text=/\\/oz/")).toHaveCount(0);
  });
});
