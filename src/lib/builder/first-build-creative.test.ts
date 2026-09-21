import { describe, expect, it } from "vitest";
import { compileFirstBuildCreativeDirection } from "./first-build-creative";

const base = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  businessName: "Northline",
  description: null,
  city: "Leeds",
  state: null,
  serviceArea: "Leeds",
  phone: null,
  email: "hello@example.test",
  yearsInBusiness: null,
  goals: ["quote"],
  conversionGoal: "quotes",
  testimonialCount: 0,
  bookableServices: 0,
  hasHours: false,
};

describe("first-build creative direction", () => {
  it("joins industry, conversion, composition and imagery before materialization", () => {
    const result = compileFirstBuildCreativeDirection({
      ...base,
      industry: "Roofing contractor",
      services: [{ name: "Roof repair" }, { name: "Roof replacement" }],
      photoCount: 3,
    });
    expect(result.industry.id).not.toBe("local_business");
    expect(result.industry.objections.length).toBeGreaterThan(0);
    expect(result.conversion.primaryCta).toBeTruthy();
    expect(result.fingerprint.heroComposition).toBeTruthy();
    expect(result.imagery.shots.length).toBeGreaterThan(3);
    expect(result.imagery.status).toBe("owner_photos");
  });

  it("never claims unavailable photography when the owner supplied none", () => {
    const result = compileFirstBuildCreativeDirection({
      ...base,
      industry: "Dental clinic",
      services: [{ name: "Check-ups" }],
      photoCount: 0,
    });
    expect(result.imagery.status).toBe("artwork_only");
    expect(result.unknowns.join(" ")).toMatch(/photo/i);
    expect(result.imagery.shots.some((shot) => shot.slot === "hero")).toBe(true);
  });

  it("distinguishes a work upload from an assigned hero image", () => {
    const result = compileFirstBuildCreativeDirection({
      ...base,
      industry: "Automotive detailing",
      services: [{ name: "Interior detail" }],
      photoCount: 1,
      hasHeroImage: false,
    });
    expect(result.imagery.shots.some((shot) => shot.slot === "hero")).toBe(true);
  });

  it("gives materially different industries different strategy and composition", () => {
    const restaurant = compileFirstBuildCreativeDirection({ ...base, businessName: "Table 12", industry: "Restaurant", services: [{ name: "Dinner" }], photoCount: 5 });
    const software = compileFirstBuildCreativeDirection({ ...base, businessName: "Signal Desk", industry: "SaaS software", services: [{ name: "Workflow automation" }], photoCount: 0 });
    expect(restaurant.industry.id).not.toBe(software.industry.id);
    expect(restaurant.industry.homeSections).not.toEqual(software.industry.homeSections);
    expect(restaurant.fingerprint.id).not.toBe(software.fingerprint.id);
    expect(restaurant.imagery.directionId).not.toBe(software.imagery.directionId);
  });
});