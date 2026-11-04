import { expect, type Page } from "@playwright/test";

/** Opt-in switches. Every write to production stays off unless a person sets these on purpose. */
export const env = {
  email: process.env.E2E_TEST_EMAIL,
  password: process.env.E2E_TEST_PASSWORD,
  /** A pre-made test account exists on the target site. */
  get hasAccount() {
    return Boolean(this.email && this.password);
  },
  /** Allows steps that create real records (account, site draft, publish, lead) on the target site. */
  allowWrites: process.env.E2E_ALLOW_WRITES === "1",
  /** The target site is wired to Stripe TEST keys (never production). */
  stripeTest: process.env.E2E_STRIPE_TEST_CHECKOUT === "1",
};

export const SKIP = {
  account:
    "Blocked: needs E2E_TEST_EMAIL and E2E_TEST_PASSWORD for a pre-made test account on the target site.",
  writes:
    "Blocked: creates real data on the target site. Needs E2E_ALLOW_WRITES=1, ideally with E2E_BASE_URL pointing at a staging deploy.",
  stripe:
    "Blocked: needs E2E_BASE_URL pointing at a deploy wired to Stripe TEST keys plus E2E_STRIPE_TEST_CHECKOUT=1. Production uses live Stripe, so checkout is never run there.",
};

/** Collects uncaught page errors and console errors for the life of the page. */
export function watchErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

/** Opens a path and checks it answered without an HTTP error. */
export async function open(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 0, `${path} status`).toBeLessThan(400);
  await page.waitForLoadState("load");
}

/** The page must not scroll sideways (document wider than the viewport). */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `page is ${scrollWidth}px wide in a ${clientWidth}px viewport`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

/** Protected pages must send visitors without a session to sign in, keeping where they were going. */
export async function expectSignInRedirect(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/auth(\?|$)/);
  await expect(page.locator("#a-email")).toBeVisible();
  await expect(page.locator("#a-password")).toBeVisible();
}

export async function signIn(page: Page) {
  await page.goto("/auth?mode=signin", { waitUntil: "domcontentloaded" });
  await page.locator("#a-email").fill(env.email!);
  await page.locator("#a-password").fill(env.password!);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/(app|onboarding|my)(\/|\?|$)/, { timeout: 45_000 });
}
