import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_TIER_MODELS,
  DEFAULT_IMAGE_TIER_PRICE_USD,
  IMAGE_TIERS,
  isEditPurpose,
  planImageWork,
  tierForImagePurpose,
  tierSupportsEditing,
} from "./image-tiers";

describe("premium picture tiers", () => {
  it("wires the two named premium picture models", () => {
    expect(DEFAULT_IMAGE_TIER_MODELS.sunburst).toBe("gpt-image-2.5-sunburst");
    expect(DEFAULT_IMAGE_TIER_MODELS.flare).toBe("gpt-image-2.5-flare");
    expect(IMAGE_TIERS).toEqual(["sunburst", "flare"]);
  });

  it("sends the hero and editorial frames to the highest-quality tier", () => {
    expect(tierForImagePurpose("hero_master")).toBe("sunburst");
    expect(tierForImagePurpose("editorial_feature")).toBe("sunburst");
  });

  it("sends high-volume, iterative work to the fast tier", () => {
    for (const purpose of ["starter_photo", "service_photo", "variation", "iteration"] as const)
      expect(tierForImagePurpose(purpose)).toBe("flare");
  });

  it("routes every change to an existing picture to the precision tier", () => {
    expect(isEditPurpose("precision_edit")).toBe(true);
    expect(isEditPurpose("crop_refine")).toBe(true);
    expect(isEditPurpose("variation")).toBe(false);
    expect(planImageWork("precision_edit")).toEqual({
      purpose: "precision_edit",
      tier: "sunburst",
      editing: true,
      supported: true,
    });
  });

  it("only allows the precision tier to change an existing picture", () => {
    expect(tierSupportsEditing("sunburst")).toBe(true);
    expect(tierSupportsEditing("flare")).toBe(false);
  });

  it("prices the premium tier above the fast tier, and never at zero", () => {
    expect(DEFAULT_IMAGE_TIER_PRICE_USD.sunburst).toBeGreaterThan(
      DEFAULT_IMAGE_TIER_PRICE_USD.flare,
    );
    expect(DEFAULT_IMAGE_TIER_PRICE_USD.flare).toBeGreaterThan(0);
  });
});

describe("premium picture pricing", () => {
  it("uses the pinned per-tier price when no override is configured", async () => {
    const { paidImagePriceMicrocents } = await import("./paid-image.server");
    expect(paidImagePriceMicrocents("sunburst")).toBe(
      Math.round(DEFAULT_IMAGE_TIER_PRICE_USD.sunburst * 100_000_000),
    );
    expect(paidImagePriceMicrocents("flare")).toBeLessThan(
      paidImagePriceMicrocents("sunburst"),
    );
  });
});
