import { defineConfig, devices } from "@playwright/test";

/**
 * Read-only journey checks against a deployed site (production by default).
 *
 * - Separate from playwright.config.ts (which boots a local dev server with stubbed auth), so the
 *   existing "E2E customer journey" workflow is unchanged.
 * - Two viewport projects: 320px (smallest supported phone) and 1440px (desktop).
 * - Nothing here creates accounts, leads, sites or charges on production. Steps that would are
 *   skipped with a reason unless the matching E2E_* opt-in variables are set (see live/env.ts).
 * - Files are named *.live.ts so neither this repo's Vitest run nor the local-server config picks them up.
 */

const baseURL = process.env.E2E_BASE_URL ?? "https://revoragrowthsystems.com";

export default defineConfig({
  testDir: "./live",
  testMatch: "**/*.live.ts",
  retries: 1,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    headless: true,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-320",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 800 } },
    },
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
