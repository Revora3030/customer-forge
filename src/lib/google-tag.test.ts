import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

describe("single Google tag after load or first interaction", () => {
  let listeners: Map<string, Listener>;
  let appended: Array<{ src: string }>;
  let readyState: string;

  beforeEach(() => {
    vi.resetModules();
    listeners = new Map();
    appended = [];
    readyState = "loading";
    vi.stubGlobal("window", {
      addEventListener: (name: string, fn: Listener) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    vi.stubGlobal("document", {
      get readyState() {
        return readyState;
      },
      head: { appendChild: (node: { src: string }) => appended.push(node) },
      querySelector: () => (appended.length > 0 ? appended[0] : null),
      createElement: () => ({ src: "", async: false, setAttribute: () => undefined, remove: () => undefined }),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests nothing from Google before load or input", async () => {
    const { ensureGoogleTagScript } = await import("./google-tag");
    ensureGoogleTagScript("G-WC1X5HWN7W");
    expect(appended).toHaveLength(0);
  });

  it("injects one script on load and ignores a second product's request", async () => {
    const { ensureGoogleTagScript } = await import("./google-tag");
    ensureGoogleTagScript("G-WC1X5HWN7W");
    ensureGoogleTagScript("AW-18474339242");
    listeners.get("load")?.();
    expect(appended).toHaveLength(1);
    expect(appended[0]?.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-WC1X5HWN7W");
  });

  it("injects on the first interaction, once", async () => {
    const { ensureGoogleTagScript } = await import("./google-tag");
    ensureGoogleTagScript("G-WC1X5HWN7W");
    listeners.get("pointerdown")?.();
    expect(appended).toHaveLength(1);
    expect(listeners.size).toBe(0);
  });

  it("injects immediately when the page is already loaded", async () => {
    readyState = "complete";
    const { ensureGoogleTagScript } = await import("./google-tag");
    ensureGoogleTagScript("G-WC1X5HWN7W");
    expect(appended).toHaveLength(1);
  });

  it("stamps js once however many Google products start", async () => {
    const { initGtag } = await import("./google-tag");
    initGtag();
    initGtag();
    const dl = (globalThis as unknown as { window: { dataLayer: unknown[][] } }).window.dataLayer;
    expect(dl.filter((entry) => entry[0] === "js")).toHaveLength(1);
  });
});
