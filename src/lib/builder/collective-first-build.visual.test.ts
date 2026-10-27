import { describe, expect, it } from "vitest";
import { MIN_FIRST_BUILD_PICTURES, missingVisualCampaign } from "./collective-first-build.server";
import { blankCreativeBrief } from "./first-build-contract";

type Brief = ReturnType<typeof blankCreativeBrief>;
type Item = Brief["imageInventory"][number];

const picture = (slot: string): Item =>
  ({
    slot,
    label: slot,
    purpose: "scene",
    subject: "a glossy sedan in a driveway at dusk",
    altText: "Sedan in a driveway at dusk",
    aspectRatio: "16:9",
    section: ["hero"],
  }) as unknown as Item;

function authored(count: number): Brief {
  const brief = blankCreativeBrief([]);
  brief.imageInventory = Array.from({ length: count }, (_, i) => picture(`shot-${i}`));
  brief.heroComposition = "full-bleed photo opening";
  brief.sectionRhythm = "scenes alternate with tight bands";
  brief.backgroundTreatment = "edge-to-edge photography";
  brief.photography = { ...brief.photography, language: "cinematic dusk" };
  return brief;
}

describe("missingVisualCampaign", () => {
  it("flags a build whose picture list and layout direction were never written", () => {
    expect(missingVisualCampaign(blankCreativeBrief([]))).toEqual([
      "imageInventory",
      "heroComposition",
      "sectionRhythm",
      "backgroundTreatment",
      "photography",
    ]);
  });

  it("requires at least 5 authored pictures", () => {
    expect(MIN_FIRST_BUILD_PICTURES).toBe(5);
    expect(missingVisualCampaign(authored(4))).toEqual(["imageInventory"]);
    expect(missingVisualCampaign(authored(5))).toEqual([]);
  });

  it("does not count blank seeded picture slots", () => {
    const brief = authored(5);
    brief.imageInventory = brief.imageInventory.map((item) => ({ ...item, subject: "" }));
    expect(missingVisualCampaign(brief)).toContain("imageInventory");
  });
});
