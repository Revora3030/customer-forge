import { expect, test, type Page } from "@playwright/test";
import { STUB_SUPABASE_URL } from "./constants";

/**
 * JC-17 / JC-18 scene smoke tests. Nothing real is touched: the sign-in check and the city's data calls are
 * answered by the test, so the city renders with "unavailable" states, which is enough to prove it draws.
 *  - 390px: the city is drawn (not blank), the page does not scroll sideways.
 *  - desktop: the 3D canvas is non-blank and stays within the 150 draw-call budget (dev-only readout).
 *  - low-power device: the 3D scene is skipped and the Operations view shows the tables.
 */

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function signedInStub(page: Page) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", aal: "aal1", exp: expiresAt })}.stub`;
  const user = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "e2e@example.invalid", app_metadata: {}, user_metadata: {}, factors: [], created_at: "2026-01-01T00:00:00Z" };
  const session = { access_token: token, refresh_token: "stub", token_type: "bearer", expires_in: 3600, expires_at: expiresAt, user };
  await page.addInitScript(([key, value]) => { window.localStorage.setItem(key as string, value as string); }, ["sb-e2e-stub-auth-token", JSON.stringify(session)]);
  await page.route(`${STUB_SUPABASE_URL}/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/user")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    // The admin area only opens for a platform admin, so the stubbed account holds that role.
    if (url.includes("/rest/v1/user_roles")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ role: "super_admin" }]) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(/\/_serverFn\//, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "stubbed in the mobile city test" }) }));
}

async function open(page: Page) {
  await signedInStub(page);
  await page.goto("/admin/city");
}

/** Counts the distinct colours in a screenshot (decoded in the page, so no image library is needed). */
async function distinctColours(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 120; canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(image, 0, 0, 120, 120);
    const pixels = ctx.getImageData(0, 0, 120, 120).data;
    const seen = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) seen.add(((pixels[i] ?? 0) >> 4) << 8 | ((pixels[i + 1] ?? 0) >> 4) << 4 | ((pixels[i + 2] ?? 0) >> 4));
    return seen.size;
  }, png.toString("base64"));
}


test.describe("390px phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "no-preference" });

  test("the city draws something and nothing spills sideways", async ({ page }) => {
    await open(page);
    const frame = page.getByTestId("city-svg-map");
    await expect(frame).toBeVisible({ timeout: 30_000 });
    // No 3D canvas is mounted on a phone: it is the flat map, so there is no WebGL cost.
    await expect(page.locator("canvas")).toHaveCount(0);
    const shot = await frame.screenshot();
    expect(await distinctColours(page, shot), "the 390px city looks blank").toBeGreaterThan(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe("desktop 3D scene", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });

  test("the canvas is non-blank and within the draw-call budget", async ({ page }) => {
    await open(page);
    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => distinctColours(page, await canvas.screenshot()), { timeout: 30_000, message: "the 3D canvas looks blank" }).toBeGreaterThan(8);
    // Dev-only readout: draw calls of the last frame, against the 150 budget.
    const stats = page.getByTestId("city-dev-stats");
    await expect(stats).toHaveAttribute("data-draw-calls", /^\d+$/, { timeout: 30_000 });
    const calls = Number(await stats.getAttribute("data-draw-calls"));
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(150);
  });

  test("a mount/unmount loop (leave and come back to the city) leaves one canvas and one readout", async ({ page }) => {
    await open(page);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Operations" }).click();
      await expect(page.locator("canvas")).toHaveCount(0);
      await page.getByRole("button", { name: "City", exact: true }).click();
      await expect(page.locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    }
    await expect(page.getByTestId("city-dev-stats")).toHaveCount(1);
  });
});

test.describe("low-power device", () => {
  test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });

  test("skips 3D and shows the same counts, runs and replay as tables", async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, "deviceMemory", { value: 2, configurable: true }); });
    await open(page);
    await expect(page.getByTestId("city-operations-tables")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("city-fallback-note")).toContainText("low-power");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Districts" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Replay events/ })).toBeVisible();
    // Switching back to City on a low-power device shows the flat map, never WebGL.
    await page.getByRole("button", { name: "City", exact: true }).click();
    await expect(page.getByTestId("city-svg-map")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  });
});
