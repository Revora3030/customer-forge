import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, open, watchErrors } from "./helpers";

/** Read-only smoke check of the public landing page. */
test.describe("smoke: landing page", () => {
  test("loads with no errors, no sideways scroll, and a visible primary call to action", async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await open(page, "/");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("[data-hero-cta]").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(errors.pageErrors, "uncaught errors on /").toEqual([]);
    expect(errors.consoleErrors, "console errors on /").toEqual([]);
  });

  test("sign-up is reachable", async ({ page }) => {
    await open(page, "/signup");
    await expect(page).toHaveURL(/\/auth\?.*mode=signup/);
    await expect(page.locator("#a-email")).toBeVisible();
  });

  test("sign-in is reachable", async ({ page }) => {
    await open(page, "/login");
    await expect(page).toHaveURL(/\/auth\?.*mode=signin/);
    await expect(page.locator("#a-email")).toBeVisible();
    await expect(page.locator("#a-password")).toBeVisible();
  });
});
