import { expect, test } from "@playwright/test";
import {
  SKIP,
  env,
  expectNoHorizontalOverflow,
  expectSignInRedirect,
  open,
  signIn,
  watchErrors,
} from "./helpers";

/**
 * Customer journeys against the deployed site, run at 320px and 1440px (see playwright.live.config.ts).
 *
 * Each journey has a read-only part that always runs (the page a visitor reaches, its form, and the
 * sign-in gate in front of protected screens). Steps that would create accounts, leads, sites or
 * charges are skipped with a reason unless the matching opt-in variables are set (see helpers.ts).
 * Nothing is ever submitted to production by default.
 */

test.describe("journey: sign up", () => {
  test("the sign-up form is usable and rejects a malformed email before sending anything", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await open(page, "/auth?mode=signup");
    const email = page.locator("#a-email");
    const password = page.locator("#a-password");
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
    await email.fill("not-an-email");
    expect(
      await email.evaluate((el: HTMLInputElement) => el.checkValidity()),
      "malformed email is invalid",
    ).toBe(false);
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, "uncaught errors on sign-up").toEqual([]);
  });

  test("a brand-new account can be created", async ({ page }) => {
    test.skip(!env.allowWrites, SKIP.writes);
    await open(page, "/auth?mode=signup");
    const stamp = Date.now();
    const name = page.locator("#a-name");
    if (await name.isVisible()) await name.fill("E2E Sentinel");
    await page.locator("#a-email").fill(`e2e+${stamp}@example.com`);
    await page.locator("#a-password").fill(`E2e-${stamp}-pass!`);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(
      page.getByRole("status").or(page.locator("text=/confirm|check your email/i")).first(),
    ).toBeVisible();
  });
});

test.describe("journey: onboarding", () => {
  test("onboarding sits behind sign-in", async ({ page }) => {
    await expectSignInRedirect(page, "/onboarding");
    await expect(page).toHaveURL(/redirect=/);
  });

  test("a signed-in owner sees the business details step", async ({ page }) => {
    test.skip(!env.hasAccount, SKIP.account);
    await signIn(page);
    await open(page, "/onboarding");
    await expect(page.locator("#o-name")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("journey: build a site", () => {
  test("the get-started builder form is reachable without an account", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "/get-started");
    await expect(page.locator("form").first()).toBeVisible();
    await expect(page.locator('form button[type="submit"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, "uncaught errors on /get-started").toEqual([]);
  });

  test("the website editor sits behind sign-in", async ({ page }) => {
    await expectSignInRedirect(page, "/app/website");
  });
});

test.describe("journey: publish", () => {
  test("the launch screen sits behind sign-in", async ({ page }) => {
    await expectSignInRedirect(page, "/app/launch");
  });

  test("a signed-in owner can reach the launch screen", async ({ page }) => {
    test.skip(!env.hasAccount, SKIP.account);
    await signIn(page);
    await open(page, "/app/launch");
    await expect(page.locator("main h1, main h2").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("journey: pay", () => {
  test("pricing shows the $350 setup and $100/month plan", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "/pricing");
    await expect(page.locator("body")).toContainText("$350");
    await expect(page.locator("body")).toContainText("$100");
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, "uncaught errors on /pricing").toEqual([]);
  });

  test("billing sits behind sign-in", async ({ page }) => {
    await expectSignInRedirect(page, "/app/billing");
  });

  test("checkout opens Stripe in TEST mode", async ({ page }) => {
    test.skip(!env.hasAccount || !env.stripeTest, `${SKIP.account} ${SKIP.stripe}`);
    await signIn(page);
    await open(page, "/app/billing");
    const [request] = await Promise.all([
      page.waitForRequest(/stripe\.com\//, { timeout: 45_000 }),
      page
        .getByRole("button", { name: /subscribe|checkout|start|pay/i })
        .first()
        .click(),
    ]);
    expect(request.url()).not.toMatch(/pk_live_/);
  });
});

test.describe("journey: capture a lead", () => {
  test("the contact form is visible and requires name, email and message", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "/contact");
    for (const id of ["#c-name", "#c-email", "#c-message"]) {
      const field = page.locator(id);
      await expect(field, `${id} visible`).toBeVisible();
      expect(await field.evaluate((el: HTMLInputElement) => el.required), `${id} required`).toBe(
        true,
      );
    }
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, "uncaught errors on /contact").toEqual([]);
  });

  test("a lead submitted through the contact form is accepted", async ({ page }) => {
    test.skip(!env.allowWrites, SKIP.writes);
    await open(page, "/contact");
    await page.locator("#c-name").fill("E2E Sentinel");
    await page.locator("#c-email").fill(`e2e+lead${Date.now()}@example.com`);
    await page.locator("#c-message").fill("Automated end-to-end test lead. Please ignore.");
    await page.locator('form button[type="submit"]').first().click();
    await expect(page.locator("text=/thank|received|sent/i").first()).toBeVisible();
  });
});

test.describe("journey: dashboard", () => {
  test("the public demo dashboard renders", async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, "/demo/dashboard");
    await expect(page.getByLabel("Demo dashboard sections")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, "uncaught errors on /demo/dashboard").toEqual([]);
  });

  test("the owner dashboard sits behind sign-in", async ({ page }) => {
    await expectSignInRedirect(page, "/app");
  });

  test("a signed-in owner reaches the dashboard", async ({ page }) => {
    test.skip(!env.hasAccount, SKIP.account);
    await signIn(page);
    await open(page, "/app");
    await expect(page.locator("main").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
