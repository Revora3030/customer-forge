import { describe, expect, it } from "vitest";
import { businessDna, dnaBrief, screenClaims, type DnaFacts } from "@/lib/business-dna";

const roofer: DnaFacts = {
  businessName: "Lone Star Roofing",
  industry: "Roofing",
  services: ["Roof replacement", "Roof repair", "Roof inspection"],
  city: "Dallas",
  serviceArea: "Dallas & Fort Worth",
  phone: "(214) 555 0110",
  email: "hello@lonestar.example",
  conversionGoal: "calls",
  hasHours: true,
};

describe("business DNA", () => {
  it("keeps supplied facts and lists what is missing without strategy inference", () => {
    const dna = businessDna(roofer);
    expect(dna.name).toBe("Lone Star Roofing");
    expect(dna.industry).toBe("Roofing");
    expect(dna.services).toEqual(["Roof replacement", "Roof repair", "Roof inspection"]);
    expect(dna.serviceArea).toBe("Dallas & Fort Worth");
    expect(dna.desiredAction).toBe("calls");
    expect(dna.unknown).toContain("photos of real work");
    expect(dna.needed.length).toBeGreaterThan(0);
    expect(dna.confidence).toBeGreaterThan(50);
  });

  it("never fabricates identity when nothing was supplied", () => {
    const dna = businessDna({});
    expect(dna.name).toBe("This business");
    expect(dna.services).toEqual([]);
    expect(dna.city).toBeNull();
    expect(dna.unknown).toContain("industry");
    expect(dna.confidence).toBe(0);
    expect(dna.prohibited).toContain("awards");
  });

  it("does not classify the business into deterministic creative or conversion strategy", () => {
    const dna = businessDna({ industry: "Mobile car detailing", bookableServices: 3 }) as unknown as Record<string, unknown>;
    expect(dna.primaryCta).toBeUndefined();
    expect(dna.urgency).toBeUndefined();
    expect(dna.qualifyingFields).toBeUndefined();
    expect(dna.pricingModel).toBeUndefined();
    expect(dna.seoStrategy).toBeUndefined();
    expect(dna.positioning).toBeUndefined();
  });

  it("screens invented claims out of copy but allows supplied facts", () => {
    const issues = screenClaims(
      "Award-winning, licensed roofers with a 5 star rating and a 100% guarantee.",
      roofer,
    );
    expect(issues.map((i) => i.reason)).toEqual(
      expect.arrayContaining(["award", "credential", "star rating", "statistic", "guarantee"]),
    );

    const allowed = screenClaims("Certified installers.", {
      ...roofer,
      certifications: "GAF Master Elite",
    });
    expect(allowed.some((i) => i.reason === "credential")).toBe(false);
  });

  it("renders a prompt brief that carries the do-not-guess ledger", () => {
    const brief = dnaBrief(businessDna(roofer));
    expect(brief).toContain("NEVER CLAIM");
    expect(brief).toContain("UNKNOWN — never guess");
    expect(brief).toContain("Lone Star Roofing");
    expect(brief).not.toContain("PRIMARY CTA");
    expect(brief).not.toContain("SEO STRATEGY");
  });
});
