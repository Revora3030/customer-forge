import { defineConfig, devices } from "@playwright/test";
import { STUB_SUPABASE_URL } from "./constants";

/**
 * Customer-journey end-to-end tests (sign-up -> checkout -> dashboard).
 *
 * - Chromium only, headless, retries=1, one worker. No secrets needed for the default run.
 * - Stripe is TEST mode only. The journey never uses live keys: see the live-key guard in
 *   journey.e2e.ts, which fails the run if a `pk_live_`/`sk_live_` value appears in any Stripe request.
 * - With no real backend configured, the dev server starts with placeholder Supabase values and the
 *   sign-up test stubs the auth endpoint in the browser. Nothing is created anywhere.
 */

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const useExternalApp = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  retries: 1,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useExternalApp
    ? undefined
    : {
        command: "npm run dev -- --host localhost --port 8080",
        cwd: "..",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          // Placeholders only (publishable-key shape, no real project behind them).
          VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? STUB_SUPABASE_URL,
          VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_e2e_stub_key",
          VITE_SUPABASE_PROJECT_ID: process.env.VITE_SUPABASE_PROJECT_ID ?? "e2e-stub",
        },
      },
});
