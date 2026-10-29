import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGa4 } from "./ga4";
import { loadGoogleAds } from "./google-ads";
afterEach(() => vi.unstubAllGlobals());
describe("nonessential Google tags", () => {
  it.each([null, "denied"])("does not insert third-party scripts before permission: %s", async (choice) => {
    const append = vi.fn();
    vi.stubGlobal("window", { location: { hostname: "localhost", pathname: "/auth" }, localStorage: { getItem: () => choice } });
    vi.stubGlobal("document", { head: { appendChild: append }, createElement: vi.fn() });
    await loadGa4("G-TEST123");
    await loadGoogleAds(true);
    expect(append).not.toHaveBeenCalled();
  });
  it("does not load platform tags on private customer previews even after acceptance", async () => {
    const append = vi.fn();
    vi.stubGlobal("window", { location: { hostname: "localhost", pathname: "/draft/customer" }, localStorage: { getItem: () => "granted" } });
    vi.stubGlobal("document", { head: { appendChild: append }, createElement: vi.fn() });
    await loadGa4("G-TEST123");
    await loadGoogleAds(true);
    expect(append).not.toHaveBeenCalled();
  });
});