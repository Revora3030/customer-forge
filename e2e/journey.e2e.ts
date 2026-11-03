import { expect, test, type Page } from "@playwright/test";
import { STUB_SUPABASE_URL } from "./constants";

/**
 * Customer journey: sign-up -> checkout -> dashboard.
 *
 * Runs with no secrets (the CI default):
 *   - public pages load, the sign-up screen creates an account against a stubbed auth endpoint, and
 *     visitors without a session are sent to sign in.
 * Opt-in (skipped with a reason when not configured), against an app wired to a Stripe TEST account:
 *   - E2E_BASE_URL + E2E_TEST_EMAIL + E2E_TEST_PASSWORD: a pre-made test user signs in and the dashboard loads.
 *   - E2E_STRIPE_TEST_CHECKOUT=1 as well: the billing page opens Stripe's checkout. It stops before paying.
 * Stripe is TEST mode only. Every Stripe request is checked and the run fails if a live key shows up.
 */

const LIVE_KEY = /\b(?:pk|sk|rk)_live_[A-Za-z0-9]+/;

/** Fails the test if any request to Stripe carries a live-mode key. */
async function forbidLiveStripe(page: Page) {
  await page.route(/stripe\.com\//, async (route) => {
    const request = route.request();
    const haystack = `${request.url()}\n${request.postData() ?? ""}\n${JSON.stringify(request.headers())}`;
    if (LIVE_KEY.test(haystack)) {
      await route.abort();
      throw new Error("A live Stripe key was used in the end-to-end run. These tests are TEST mode only.");
    }
    await route.continue();
  });
}

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("public site", () => {
  for (const path of ["/", "/pricing", "/get-started", "/login"]) {
    test(`${path} loads`, async ({ page }) => {
      const errors = trackPageErrors(page);
      const response = await page.goto(path);
      expect(response?.status(), `${path} status`).toBeLessThan(400);
      await expect(page.locator("main, #root, body").first()).toBeVisible();
      expect(errors, `uncaught errors on ${path}`).toEqual([]);
    });
  }
});

test.describe("sign-up (auth stubbed, nothing is created)", () => {
  test("a new visitor creates an account and is asked to confirm their email", async ({ page }) => {
    let signUpBody: Record<string, unknown> | null = null;
    await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
      const request = route.request();
      if (request.url().includes("/auth/v1/signup")) {
        signUpBody = request.postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          // What Supabase returns when email confirmation is on: a user and no session.
          body: JSON.stringify({
            id: "00000000-0000-4000-8000-000000000001",
            aud: "authenticated",
            role: "",
            email: "e2e-new-owner@example.test",
            confirmation_sent_at: new Date().toISOString(),
            app_metadata: {},
            user_metadata: {},
            identities: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.goto("/signup"); // redirects to /auth?mode=signup
    await expect(page).toHaveURL(/\/auth\?.*mode=signup/);
    // Let the page hydrate first, otherwise the click can land on a form that React has not wired up yet.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#a-name")).toBeVisible();
    await page.locator("#a-name").fill("E2E Owner");
    await page.locator("#a-email").fill("e2e-new-owner@example.test");
    await page.locator("#a-password").fill("E2e-only-password-1!");
    const signedUp = page.waitForRequest((request) => request.url().includes("/auth/v1/signup"));
    await page.getByRole("button", { name: /create account/i }).click();
    await signedUp;

    await expect(page.getByText(/check your email/i).first()).toBeVisible();
    expect(signUpBody, "sign-up request reached the auth endpoint").not.toBeNull();
    expect((signUpBody as unknown as { email?: string }).email).toBe("e2e-new-owner@example.test");
  });

  test("visitors without a session are sent to sign in from the dashboard", async ({ page }) => {
    await page.route(`${STUB_SUPABASE_URL}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.goto("/app");
    await expect(page).toHaveURL(/\/(auth|login)/);
  });
});

const creds = { email: process.env.E2E_TEST_EMAIL, password: process.env.E2E_TEST_PASSWORD };
const hasAccount = Boolean(process.env.E2E_BASE_URL && creds.email && creds.password);

async function signIn(page: Page) {
  await page.goto("/auth");
  await page.locator("#a-email").fill(creds.email!);
  await page.locator("#a-password").fill(creds.password!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

test.describe("signed-in journey (opt-in, Stripe TEST account)", () => {
  test.skip(
    !hasAccount,
    "Skipped: needs E2E_BASE_URL, E2E_TEST_EMAIL and E2E_TEST_PASSWORD for a pre-made test user on a Stripe TEST-mode app. CI does not have these, so checkout and the signed-in dashboard are not exercised there.",
  );

  test("a signed-in owner reaches a dashboard that loads", async ({ page }) => {
    const errors = trackPageErrors(page);
    await forbidLiveStripe(page);
    await signIn(page);
    await expect(page).toHaveURL(/\/app|\/onboarding/, { timeout: 30_000 });
    await expect(page.locator("main").first()).toBeVisible();
    expect(errors, "uncaught errors on the dashboard").toEqual([]);
  });

  test("billing opens Stripe checkout in TEST mode (stops before paying)", async ({ page }) => {
    test.skip(
      process.env.E2E_STRIPE_TEST_CHECKOUT !== "1",
      "Skipped: set E2E_STRIPE_TEST_CHECKOUT=1 against an app wired to Stripe TEST keys to open checkout.",
    );
    await forbidLiveStripe(page);
    await signIn(page);
    await page.goto("/app/billing");
    await page.getByRole("button", { name: /start|pay|checkout|subscribe/i }).first().click();
    await expect(page.locator('iframe[src*="stripe.com"]').first()).toBeVisible({ timeout: 30_000 });
  });
});
