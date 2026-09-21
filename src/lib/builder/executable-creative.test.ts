import { describe, expect, it } from "vitest";
import { compileFirstBuildCreativeDirection } from "./first-build-creative";
import {
  compileExecutableCreativeSection,
  readExecutableCreativeSection,
  resolveExecutableCreativeSection,
  writeExecutableCreativeSection,
} from "./executable-creative";

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
  services: [{ name: "Interior detail" }],
  goals: ["quotes"],
  conversionGoal: "quotes",
  photoCount: 0,
  testimonialCount: 0,
  bookableServices: 0,
  hasHours: false,
});

describe("executable creative contract", () => {
  it("persists a finite creative decision the renderer can consume", () => {
    const contract = compileExecutableCreativeSection("hero", creative.fingerprint, creative.brief);
    const stored = writeExecutableCreativeSection({ effect: "rise" }, contract);
    expect(readExecutableCreativeSection(stored)).toEqual(contract);
    expect(stored).toMatchObject({ effect: "rise" });
  });

  it("fails closed for malformed stored data", () => {
    expect(readExecutableCreativeSection({ creative: { version: 9, family: "bad" } })).toBeNull();
  });

  it("upgrades image-backed legacy dark heroes without overwriting stored contracts", () => {
    const fingerprint = { ...creative.fingerprint, family: "dark-focused" };
    const inferred = resolveExecutableCreativeSection({
      kind: "hero",
      settings: {},
      fingerprint,
      hasMedia: true,
    });
    expect(inferred).toMatchObject({
      composition: "full-bleed-overlay",
      mediaRole: "background",
      headingTreatment: "statement",
    });

    const stored = compileExecutableCreativeSection("hero", fingerprint, creative.brief);
    expect(resolveExecutableCreativeSection({
      kind: "hero",
      settings: writeExecutableCreativeSection({}, stored),
      fingerprint,
      hasMedia: true,
    })).toEqual(stored);
  });
});