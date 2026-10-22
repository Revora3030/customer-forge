import { afterEach, describe, expect, it, vi } from "vitest";
import { effectiveVideoTier, paidVideoModel, paidVideoPriceMicrocents } from "./paid-video.server";

afterEach(() => vi.unstubAllEnvs());

describe("video tiers", () => {
  it("runs and prices premium as standard while both use the same model", () => {
    vi.stubEnv("PAID_VIDEO_MODEL", "");
    vi.stubEnv("PAID_VIDEO_MODEL_PREMIUM", "");
    vi.stubEnv("PAID_VIDEO_PRICE_USD", "");
    expect(paidVideoModel("premium")).toBe(paidVideoModel("standard"));
    const tier = effectiveVideoTier("premium");
    expect(tier).toBe("standard");
    expect(paidVideoPriceMicrocents(tier)).toBe(paidVideoPriceMicrocents("standard"));
  });
  it("keeps premium only when a distinct model is configured", () => {
    vi.stubEnv("PAID_VIDEO_MODEL_PREMIUM", "google/veo-3.1");
    expect(effectiveVideoTier("premium")).toBe("premium");
    expect(effectiveVideoTier("standard")).toBe("standard");
  });
});
