import { describe, expect, it } from "vitest";
import { blankFirstBuildDirection } from "./first-build-contract";
import { firstBuildImageShots } from "./first-build-images.server";

const creative = blankFirstBuildDirection({
  organizationId: "11111111-1111-4111-8111-111111111111",
  businessName: "Northline Detail",
  industry: "Automotive detailing",
  description: "Mobile vehicle detailing",
  city: "Leeds",
  state: null,
  serviceArea: "Leeds",
  phone: null,
  email: null,
  yearsInBusiness: null,
  services: [{ name: "Interior detail" }, { name: "Exterior detail" }],
  goals: ["quotes"],
  conversionGoal: "quotes",
  photoCount: 0,
  testimonialCount: 0,
  bookableServices: 0,
  hasHours: false,
});

creative.brief.imageInventory = [
  { slot: "hero", label: "Opening detail", purpose: "Lead the home page", subject: "A clean detailed vehicle", environment: "Bright detailing bay", action: "Stationary", lighting: "Directional daylight", camera: "Wide editorial", framing: "Wide scene", focalPoint: "right", negativeSpace: "left", aspectRatio: "16:9", palette: "Neutral", mood: "Precise", section: ["hero"], mobileCrop: "Keep vehicle visible", altText: "Clean detailed vehicle in a bright bay", constraints: ["no text"], evidenceTag: "AI_GENERATED_MARKETING_VISUAL" },
  { slot: "service", label: "Interior detail", purpose: "Support the interior service", subject: "Carefully cleaned car interior", environment: "Detailing bay", action: "Detailing tools arranged nearby", lighting: "Soft daylight", camera: "Close editorial", framing: "Interior crop", focalPoint: "centre", negativeSpace: "top", aspectRatio: "4:3", palette: "Neutral", mood: "Meticulous", section: ["services"], mobileCrop: "Keep dashboard visible", altText: "Freshly cleaned car interior", constraints: ["no text"], evidenceTag: "AI_GENERATED_MARKETING_VISUAL" },
  { slot: "service", label: "Exterior detail", purpose: "Support the exterior service", subject: "Polished vehicle exterior", environment: "Clean detailing bay", action: "Stationary", lighting: "Raking daylight", camera: "Three-quarter view", framing: "Exterior crop", focalPoint: "right", negativeSpace: "left", aspectRatio: "4:3", palette: "Neutral", mood: "Refined", section: ["services"], mobileCrop: "Keep bodywork visible", altText: "Polished vehicle exterior", constraints: ["no text"], evidenceTag: "AI_GENERATED_MARKETING_VISUAL" },
  { slot: "about", label: "Editorial process", purpose: "Show the craft without impersonating staff", subject: "Detailing tools and materials", environment: "Organised workbench", action: "Tools ready for use", lighting: "Window light", camera: "Editorial still life", framing: "Layered close view", focalPoint: "centre", negativeSpace: "right", aspectRatio: "3:2", palette: "Neutral", mood: "Intentional", section: ["about"], mobileCrop: "Keep tools visible", altText: "Professional detailing tools on an organised workbench", constraints: ["no text"], evidenceTag: "AI_GENERATED_MARKETING_VISUAL" },
];

describe("first-build image coverage", () => {
  it("fills safe supporting slots when one owner photo already exists", () => {
    const shots = firstBuildImageShots(creative, 1, new Set(["hero"]));
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.some((shot) => shot.slot === "hero")).toBe(false);
    expect(shots.some((shot) => shot.slot === "service" || shot.slot === "cta")).toBe(true);
  });

  it("uses occupied roles rather than treating every upload as hero coverage", () => {
    const shots = firstBuildImageShots(creative, 1, new Set(["service"]));
    expect(shots.some((shot) => shot.slot === "hero")).toBe(true);
    expect(shots.some((shot) => shot.slot === "service")).toBe(false);
  });

  it("does not let one general upload suppress the hero or every service picture", () => {
    const shots = firstBuildImageShots(creative, 1);
    expect(shots.some((shot) => shot.slot === "hero")).toBe(true);
    expect(shots.filter((shot) => shot.slot === "service")).toHaveLength(2);
  });

  it("keeps a truthful editorial about image in the site-wide campaign", () => {
    const shots = firstBuildImageShots(creative, 0);
    expect(shots.some((shot) => shot.slot === "about")).toBe(true);
    expect(shots.find((shot) => shot.slot === "about")?.purpose).toMatch(/without impersonating/i);
  });

  it("keeps one singular hero slot while preserving multiple service slots", () => {
    const duplicated = {
      ...creative,
      imagery: {
        ...creative.imagery,
        shots: [
          ...creative.imagery.shots,
          {
            slot: "hero" as const,
            label: "Second hero",
            purpose: "Duplicate hero candidate",
            aspect: "16:9" as const,
            placement: ["hero"],
          },
        ],
      },
    };
    const shots = firstBuildImageShots(duplicated, 0);
    expect(shots.filter((shot) => shot.slot === "hero")).toHaveLength(1);
    expect(shots.filter((shot) => shot.slot === "service")).toHaveLength(2);
  });
});