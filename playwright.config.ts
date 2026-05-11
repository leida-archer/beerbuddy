import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e config. Runs against a freshly-booted dev server on
 * port 3100 (kept off 3000 so it doesn't fight a `bun dev` you might
 * already have running). Tests live in `e2e/` and exercise the
 * server-rendered routes — no browser-side state to worry about.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
