// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consent = vi.hoisted(() => ({ allowed: false }));
const trackConversion = vi.hoisted(() => vi.fn());
vi.mock("@/lib/conversion", () => ({ trackConversion }));
vi.mock("@/lib/consent", () => ({
  EXPERIMENTS_STORAGE_KEY: "revora.experiments.v1",
  canTrackAds: async () => consent.allowed,
}));

import { activeVariants, consentedVariantOf } from "@/lib/experiments";
import { useExperiment } from "@/lib/experiments.hooks";

const KEY = "revora.experiments.v1";

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function Probe() {
  return createElement("span", null, useExperiment("pricing_layout"));
}

describe("A/B test assignment waits for the analytics choice", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    consent.allowed = false;
    trackConversion.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the control and stores nothing without consent", async () => {
    expect(await consentedVariantOf("pricing_layout")).toEqual({
      variant: "stacked",
      assigned: false,
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("deletes an earlier assignment when the choice no longer allows it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ pricing_layout: "split" }));
    expect((await consentedVariantOf("pricing_layout")).variant).toBe("stacked");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(activeVariants()).toEqual({});
  });

  it("assigns and keeps a variant once consent allows it", async () => {
    consent.allowed = true;
    expect(await consentedVariantOf("pricing_layout")).toEqual({
      variant: "split",
      assigned: true,
    });
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({ pricing_layout: "split" });
  });

  it("the hook keeps the control and records no exposure until Accept", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    await settle();
    expect(host.textContent).toBe("stacked");
    expect(trackConversion).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBeNull();

    consent.allowed = true;
    await act(async () => window.dispatchEvent(new Event("revora:consent-changed")));
    await settle();
    expect(host.textContent).toBe("split");
    expect(trackConversion).toHaveBeenCalledWith("experiment_exposure", {
      metadata: { experiment: "pricing_layout", variant: "split" },
    });
    act(() => root.unmount());
  });
});
