import { expect, test, type Page } from "@playwright/test";
import { STUB_SUPABASE_URL } from "./constants";

/**
 * JC-60 mobile city: the AI City at 390px.
 * Nothing real is touched: the sign-in check and the city's data calls are answered by the test, so the
 * city renders with "unavailable" states, which is enough to check layout, gestures and touch targets.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "no-preference" });

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

async function openCity(page: Page) {
  await signedInStub(page);
  await page.goto("/admin/city");
  await expect(page.getByTestId("city-svg-map")).toBeVisible({ timeout: 30_000 });
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

const pointer = (page: Page, type: string, pointerId: number, x: number, y: number) =>
  page.getByTestId("city-svg-map").evaluate((svg, a) => {
    const [t, id, px, py] = a as [string, number, number, number];
    svg.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: "touch", isPrimary: id === 1, clientX: px, clientY: py, bubbles: true }));
  }, [type, pointerId, x, y]);

test.describe("mobile city at 390px", () => {
  test("fits the screen: not blank and no sideways scroll", async ({ page }) => {
    await openCity(page);
    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(overflow.scroll, "page is wider than the 390px screen").toBeLessThanOrEqual(overflow.inner);
    const box = await page.getByTestId("city-svg-map").boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.width ?? 0).toBeLessThanOrEqual(390);
    for (const id of ["executive", "factory", "institute", "creative", "growth", "security", "knowledge"]) await expect(page.locator(`[data-testid=city-svg-map] [data-district=${id}]`)).toBeVisible();
    const shot = await page.getByTestId("city-svg-map").screenshot({ path: "test-results/city-390.png" });
    expect(await distinctColours(page, shot), "the city screenshot looks blank").toBeGreaterThan(8);
  });

  test("camera starts framed, pinch zooms, the zoom is capped, reset frames it again", async ({ page }) => {
    await openCity(page);
    const frame = page.locator("[data-zoom]").first();
    await expect(frame).toHaveAttribute("data-zoom", "1.00");
    const box = (await page.getByTestId("city-svg-map").boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await pointer(page, "pointerdown", 1, cx - 40, cy); await pointer(page, "pointerdown", 2, cx + 40, cy);
    await pointer(page, "pointermove", 1, cx - 120, cy); await pointer(page, "pointermove", 2, cx + 120, cy);
    await pointer(page, "pointerup", 1, cx - 120, cy); await pointer(page, "pointerup", 2, cx + 120, cy);
    const zoom = Number(await frame.getAttribute("data-zoom"));
    expect(zoom).toBeGreaterThan(1.5);
    expect(zoom).toBeLessThanOrEqual(3);
    // One finger drag pans the zoomed map (the viewBox moves) without choosing a district.
    const before = await page.getByTestId("city-svg-map").getAttribute("viewBox");
    await pointer(page, "pointerdown", 3, cx, cy); await pointer(page, "pointermove", 3, cx - 60, cy - 30); await pointer(page, "pointerup", 3, cx - 60, cy - 30);
    expect(await page.getByTestId("city-svg-map").getAttribute("viewBox")).not.toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Reset map view" }).click();
    await expect(frame).toHaveAttribute("data-zoom", "1.00");
    await expect(page.getByTestId("city-svg-map")).toHaveAttribute("viewBox", "-8 -8 116 116");
  });

  test("touch targets are at least 44px", async ({ page }) => {
    await openCity(page);
    const targets = [
      page.getByRole("button", { name: "Zoom in" }),
      page.getByRole("button", { name: "Reset city camera" }),
      page.getByRole("button", { name: "Refresh city records" }),
      ...(await page.locator("nav[aria-label=Districts] button").all()),
    ];
    expect(targets.length).toBeGreaterThanOrEqual(10);
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box, "target is on screen").not.toBeNull();
      expect(box!.width, `${await target.getAttribute("aria-label")} width`).toBeGreaterThanOrEqual(43.5);
      expect(box!.height, `${await target.getAttribute("aria-label")} height`).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("district carousel jumps to a district, and the inspector opens at 80% height and drags closed", async ({ page }) => {
    await openCity(page);
    const nav = page.locator("nav[aria-label=Districts]");
    await nav.getByRole("button", { name: /^Growth & Sales Hub/ }).click();
    await expect(page).toHaveURL(/district=growth/);
    await nav.getByRole("button", { name: /^Growth & Sales Hub/ }).click();
    const sheet = page.getByTestId("district-sheet");
    await expect(sheet).toBeVisible();
    await expect.poll(async () => Math.round(((await sheet.boundingBox())?.height ?? 0) / 844 * 100), { timeout: 5_000 }).toBeGreaterThanOrEqual(79);
    expect(Math.round(((await sheet.boundingBox())!.height / 844) * 100)).toBeLessThanOrEqual(81);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Wait for the slide-in to finish (the sheet rests on the bottom edge) before grabbing the handle.
    await expect.poll(async () => { const box = await sheet.boundingBox(); return box ? Math.round(box.y + box.height) : 0; }, { timeout: 5_000 }).toBe(844);
    const handle = (await page.getByTestId("district-sheet-handle").boundingBox())!;
    expect(handle.height).toBeGreaterThanOrEqual(43.5);
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y + 60, { steps: 4 }); await page.mouse.move(x, y + 200, { steps: 6 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
  });
});
