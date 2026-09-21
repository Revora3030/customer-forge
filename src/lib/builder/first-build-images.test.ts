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
    const shots = firstBuildImageShots(creative, 1);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.some((shot) => shot.slot === "hero")).toBe(false);
    expect(shots.some((shot) => shot.slot === "service" || shot.slot === "cta")).toBe(true);
  });
});