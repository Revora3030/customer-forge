import { afterEach, describe, expect, it, vi } from "vitest";
import { canTrackAds, updateConsent } from "./consent";

afterEach(() => vi.unstubAllGlobals());

function browser(choice: string | null) {
  const values = new Map<string, string>();
  if (choice !== null) values.set("cookie_consent", choice);
  const gtag = vi.fn();
  vi.stubGlobal("window", {
    location: { hostname: "localhost" },
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    gtag,
  });
  return { values, gtag };
}

describe("advertising consent", () => {
  it("does not track before a decision in a consent region", async () => {
    browser(null);
    expect(await canTrackAds()).toBe(false);
  });
  it("rejecting persists denial and disables advertising signals", async () => {
    const { values, gtag } = browser("granted");
    updateConsent("denied");
    expect(await canTrackAds()).toBe(false);
    expect(values.get("cookie_consent")).toBe("denied");
    expect(gtag).toHaveBeenCalledWith("consent", "update", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  });
  it("accepting persists consent and permits tracking", async () => {
    browser(null);
    updateConsent("granted");
    expect(await canTrackAds()).toBe(true);
  });
});