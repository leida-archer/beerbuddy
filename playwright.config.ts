import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config. Runs against a freshly-booted dev server on
 * port 3210 (kept off 3000 so it doesn't fight a `bun dev` you might
 * already have running). Tests live in `e2e/` and exercise the
 * server-rendered routes — no browser-side state to worry about.
 *
 * Cross-viewport coverage:
 *   - desktop-chromium (1280×720, Desktop Chrome UA) — the dev surface.
 *   - mobile-chromium (Pixel 7, Mobile Chrome UA) — DESIGN.md target.
 *
 * Both projects run the same specs; if a layout breaks on phone-width
 * the suite catches it before it ships. CI runs both; locally you can
 * `bun run test:e2e --project=mobile-chromium` to scope down.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun run dev -- -p 3210",
    url: "http://localhost:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
