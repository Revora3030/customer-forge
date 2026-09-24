import { describe, expect, it } from "vitest";
import { fallbackBrief, blankCopy } from "@/lib/site-engine.server";
import { generateWebsitePlan } from "@/lib/website-plan";
import { blankFirstBuildDirection } from "./first-build-contract";
import { synthesizeNativeFirstBuild } from "./native-first-build";

const facts = {
  businessName: "Northline Roofing",
  industry: "Roofing contractor",
  description: "We repair and replace roofs.",
  city: "Leeds",
  state: null,
  serviceArea: "West Yorkshire",
  phone: "0113 000 0000",
  email: "hello@example.test",
  yearsInBusiness: null,
  hasHours: false,
  style: null,
  goals: ["quote"],
  ctaLabel: "Get a quote",
  services: [{ name: "Roof repair", description: "Repairs for damaged roofs." }],
};

function fixture() {
  const brief = fallbackBrief(facts);
  const copy = {
    ...blankCopy(facts),
    heroHeadline: "Roof repair across West Yorkshire",
    heroSubheadline: "We repair and replace roofs.",
    primaryCta: "Get a quote",
    intro: "Northline Roofing repairs and replaces roofs.",
    metaTitle: "Northline Roofing",
    metaDescription: "Roof repair and replacement in West Yorkshire.",
  };
  const plan = generateWebsitePlan({ ...facts, goals: ["quote"], photoCount: 0, testimonialCount: 0, hasCredentials: false, socialLinks: 0 });
  const creative = blankFirstBuildDirection({
    organizationId: "11111111-1111-4111-8111-111111111111",
    businessName: facts.businessName,
    industry: facts.industry,
    description: facts.description,
    city: facts.city,
    state: facts.state,
    serviceArea: facts.serviceArea,
    phone: facts.phone,
    email: facts.email,
    yearsInBusiness: facts.yearsInBusiness,
    services: facts.services,
    goals: facts.goals,
    conversionGoal: "quotes",
    photoCount: 0,
    testimonialCount: 0,
    bookableServices: 0,
    hasHours: false,
  });
  return { brief, copy, plan, creative };
}

describe("native first-build synthesis", () => {
  it("joins every deterministic stage and records field provenance", () => {
    const result = synthesizeNativeFirstBuild({
      facts: { ...facts, services: facts.services.map((service) => service.name) },
      language: "English",
      ...fixture(),
    });
    expect(result.engine).toBe("revora-native");
    expect(result.stages).toContain("adversarial_review");
    expect(result.provenance["description"]).toBe("SUPPLIED");
    expect(result.provenance["creativeDirection"]).toBe("DERIVED");
    expect(result.lockedText).toContain("We repair and replace roofs.");
    expect(result.pageStrategy.some((page) => page.slug === "contact")).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("blocks unsupported claims and records missing facts as UNKNOWN", () => {
    const built = fixture();
    built.copy.about = "Award-winning roofers trusted by hundreds.";
    const result = synthesizeNativeFirstBuild({
      facts: {
        ...facts,
        services: facts.services.map((service) => service.name),
        description: null,
        phone: null,
      },
      language: "English",
      ...built,
    });
    expect(result.valid).toBe(false);
    expect(result.findings.some((finding) => finding.reviewer === "facts")).toBe(true);
    expect(result.provenance["description"]).toBe("UNKNOWN");
    expect(result.provenance["phone"]).toBe("UNKNOWN");
  });

  it("does not falsely claim a non-English language was verified", () => {
    const result = synthesizeNativeFirstBuild({
      facts: { ...facts, services: facts.services.map((service) => service.name) },
      language: "Español",
      ...fixture(),
    });
    expect(result.language.requested).toBe("Español");
    expect(result.language.preservation).toBe("NOT_VERIFIED");
    expect(result.reviewers.some((reviewer) => reviewer.name === "security")).toBe(true);
    expect(result.selection).toBe("deterministic-native-contract");
    expect(result.disagreements).toEqual([]);
    expect(result.timingMs).toBeGreaterThanOrEqual(0);
  });
});