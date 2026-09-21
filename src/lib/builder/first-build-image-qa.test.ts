import { describe, expect, it } from "vitest";
import {
  ATTACHABLE_SLOTS,
  gradeFirstBuildImages,
  imageRepairPlan,
} from "@/lib/builder/first-build-image-qa";
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.types";

function asset(overrides: Partial<FirstBuildImageAsset> = {}): FirstBuildImageAsset {
  return {
    slot: "hero",
    label: "Hero",
    altText: "Warm evening light over a tidy workshop bay",
    path: "org/hero.png",
    mediaId: "m1",
    provider: "cloudflare",
    model: "flux-1-schnell",
    prompt: "prompt",
    placement: ["home.hero"],
    aspectRatio: "16:9",
    ...overrides,
  };
}

describe("starter picture quality gate", () => {
  it("accepts a complete, safely placed picture", () => {
    const result = gradeFirstBuildImages([asset()]);
    expect(result.clean).toBe(true);
    expect(result.accepted).toHaveLength(1);
  });

  it("never allows proof-style placements", () => {
    const result = gradeFirstBuildImages([
      asset({ slot: "service", placement: ["home.gallery"], label: "Gallery" }),
      asset({ slot: "proof", label: "Reviews", path: "org/proof.png" }),
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
    expect(ATTACHABLE_SLOTS.has("proof")).toBe(false);
  });

  it("rejects pictures with no usable description", () => {
    const result = gradeFirstBuildImages([asset({ altText: "img" })]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reason).toMatch(/description/i);
  });

  it("rejects pictures with no stored file or missing provenance", () => {
    const result = gradeFirstBuildImages([
      asset({ path: "" }),
      asset({ provider: "", path: "org/a.png" }),
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it("drops duplicates of the same file and the same spot", () => {
    const result = gradeFirstBuildImages([asset(), asset(), asset({ path: "org/hero-2.png" })]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
  });
});

describe("picture repair plan", () => {
  it("retries fixable problems and hands proof slots back to the owner", () => {
    const steps = imageRepairPlan({
      rejected: [
        { slot: "hero", label: "Hero", reason: "the picture had no usable description for screen readers" },
        { slot: "service", label: "Gallery", reason: "that part of the page must only show your own work" },
      ],
      skipped: [{ slot: "cta", label: "Closing", reason: "monthly spending cap reached" }],
    });
    expect(steps.map((step) => step.action)).toEqual([
      "retry_picture",
      "ask_owner_photo",
      "ask_owner_photo",
    ]);
  });

  it("caps the plan so one bad build cannot flood the repair loop", () => {
    const steps = imageRepairPlan({
      rejected: Array.from({ length: 30 }, (_, index) => ({
        slot: "hero",
        label: `Shot ${index}`,
        reason: "the same picture was produced twice",
      })),
      skipped: [],
    });
    expect(steps).toHaveLength(12);
  });
});
