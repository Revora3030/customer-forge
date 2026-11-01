import { afterEach, describe, expect, it, vi } from "vitest";

const recordConversion = vi.fn(() => Promise.resolve());
const canTrackAds = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/conversion.functions", () => ({ recordConversion }));
vi.mock("@/lib/ga4", () => ({ ga4Event: vi.fn(), ga4PageView: vi.fn() }));
vi.mock("@/lib/staff-browser", () => ({ isStaffBrowser: () => false }));
vi.mock("@/lib/consent", () => ({ canTrackAds, VISITOR_STORAGE_KEY: "revora.visitor.v1" }));

function browser() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const store = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  });
  vi.stubGlobal("window", {
    location: { hostname: "revoragrowthsystems.com", pathname: "/pricing", search: "" },
    localStorage: store(local),
    sessionStorage: store(session),
  });
  vi.stubGlobal("document", { referrer: "" });
  return local;
}

afterEach(() => {
  vi.unstubAllGlobals();
  recordConversion.mockClear();
});

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("first-party visitor id consent gate", () => {
  it("does not create or send a visitor id without analytics consent", async () => {
    const local = browser();
    canTrackAds.mockResolvedValue(false);
    const { trackConversion } = await import("./conversion");
    trackConversion("page_view");
    await flush();
    expect(local.has("revora.visitor.v1")).toBe(false);
    expect(recordConversion).toHaveBeenCalledTimes(1);
    expect(recordConversion.mock.calls[0]).toBeDefined();
    const arg = (
      recordConversion.mock.calls[0] as unknown as [{ data: { visitorId: unknown } }]
    )[0];
    expect(arg.data.visitorId).toBeNull();
  });

  it("creates and sends a visitor id once consent allows it", async () => {
    const local = browser();
    canTrackAds.mockResolvedValue(true);
    const { trackConversion } = await import("./conversion");
    trackConversion("page_view");
    await flush();
    const id = local.get("revora.visitor.v1");
    expect(id).toBeTruthy();
    const arg = (
      recordConversion.mock.calls[0] as unknown as [{ data: { visitorId: unknown } }]
    )[0];
    expect(arg.data.visitorId).toBe(id);
  });

  it("never sends stored test variants without analytics consent", async () => {
    const local = browser();
    local.set("revora.experiments.v1", JSON.stringify({ pricing_layout: "split" }));
    canTrackAds.mockResolvedValue(false);
    const { trackConversion } = await import("./conversion");
    trackConversion("page_view");
    await flush();
    const arg = (recordConversion.mock.calls[0] as unknown as [{ data: { metadata: unknown } }])[0];
    expect(arg.data.metadata).toEqual({});
  });
});
