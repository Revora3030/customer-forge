import { describe, expect, it } from "vitest";
import { compileFirstBuildCreativeDirection } from "./first-build-creative";
import { firstBuildImageShots } from "./first-build-images.server";

const creative = compileFirstBuildCreativeDirection({
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