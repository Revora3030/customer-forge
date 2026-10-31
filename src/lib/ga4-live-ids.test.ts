import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GA_MEASUREMENT_ID,
  normalizeGaMeasurementId,
  resolveGaMeasurementIds,
} from "./ga4-ids";

describe("resolveGaMeasurementIds", () => {
  it("always reports to Revora's own property first", () => {
    expect(DEFAULT_GA_MEASUREMENT_ID).toBe("G-WC1X5HWN7W");
    expect(resolveGaMeasurementIds(null)).toEqual(["G-WC1X5HWN7W"]);
    expect(resolveGaMeasurementIds(undefined)).toEqual(["G-WC1X5HWN7W"]);
    expect(resolveGaMeasurementIds("")).toEqual(["G-WC1X5HWN7W"]);
  });

  it("keeps exactly one ID even when a different one is saved (the live G-TF2NG1TL9F row)", () => {
    expect(resolveGaMeasurementIds("G-TF2NG1TL9F")).toEqual(["G-WC1X5HWN7W"]);
    expect(resolveGaMeasurementIds(" g-tf2ng1tl9f ")).toEqual(["G-WC1X5HWN7W"]);
  });

  it("does not duplicate the default and ignores invalid saved values", () => {
    expect(resolveGaMeasurementIds("G-WC1X5HWN7W")).toEqual(["G-WC1X5HWN7W"]);
    expect(resolveGaMeasurementIds("g-wc1x5hwn7w")).toEqual(["G-WC1X5HWN7W"]);
    expect(resolveGaMeasurementIds("UA-12345-1")).toEqual(["G-WC1X5HWN7W"]);
    expect(resolveGaMeasurementIds(42)).toEqual(["G-WC1X5HWN7W"]);
    expect(normalizeGaMeasurementId("AW-18474339242")).toBeNull();
  });
});

describe("loadGa4 on the live host", () => {
  let appended: Array<{ src: string }>;
  let storage: Record<string, string>;

  beforeEach(() => {
    vi.resetModules();
    appended = [];
    storage = {};
    vi.stubGlobal("window", {
      location: { hostname: "revoragrowthsystems.com", pathname: "/pricing", href: "https://revoragrowthsystems.com/pricing" },
      localStorage: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
      },
    });
    vi.stubGlobal("document", {
      title: "Pricing",
      head: { appendChild: (node: { src: string }) => appended.push(node) },
      createElement: () => ({ src: "", async: false, remove: () => undefined }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function configCalls() {
    const dl = (globalThis as unknown as { window: { dataLayer: unknown[][] } }).window.dataLayer;
    return dl.filter((args) => args[0] === "config").map((args) => args[1]);
  }

  it("configures exactly one GA4 ID with one gtag.js load", async () => {
    storage["cookie_consent"] = "granted";
    const { loadGa4, ga4ConfiguredIds } = await import("./ga4");
    await loadGa4(resolveGaMeasurementIds("G-TF2NG1TL9F"));
    expect(ga4ConfiguredIds()).toEqual(["G-WC1X5HWN7W"]);
    expect(configCalls()).toEqual(["G-WC1X5HWN7W"]);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-WC1X5HWN7W");

    await loadGa4(resolveGaMeasurementIds("G-TF2NG1TL9F"));
    expect(appended).toHaveLength(1);
    expect(configCalls()).toHaveLength(1);
  });

  it("loads nothing for a visitor who declined", async () => {
    storage["cookie_consent"] = "denied";
    const { loadGa4, ga4IsActive } = await import("./ga4");
    await loadGa4(resolveGaMeasurementIds(null));
    expect(appended).toHaveLength(0);
    expect(ga4IsActive()).toBe(false);
  });

  it("waits for consent in regions that require it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "loc=DE\n" })));
    const { loadGa4, ga4IsActive } = await import("./ga4");
    await loadGa4(resolveGaMeasurementIds(null));
    expect(appended).toHaveLength(0);
    expect(ga4IsActive()).toBe(false);
  });

  it("loads for an undecided US visitor (no banner region)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "loc=US\n" })));
    const { loadGa4, ga4ConfiguredIds } = await import("./ga4");
    await loadGa4(resolveGaMeasurementIds(null));
    expect(ga4ConfiguredIds()).toEqual(["G-WC1X5HWN7W"]);
    expect(appended).toHaveLength(1);
  });
});
