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
    expect(dna["primaryCta"]).toBeUndefined();
    expect(dna["urgency"]).toBeUndefined();
    expect(dna["qualifyingFields"]).toBeUndefined();
    expect(dna["pricingModel"]).toBeUndefined();
    expect(dna["seoStrategy"]).toBeUndefined();
    expect(dna["positioning"]).toBeUndefined();
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

  it("catches claims the owner never supplied (insurance, years, job counts, promises, product claims, PSI)", () => {
    const invented = [
      "Fully insured",
      "20 years of experience",
      "Serving Raleigh since 2009",
      "1,200 driveways cleaned",
      "Trusted by 300+ neighbors",
      "Same-day service",
      "Eco-friendly, pet-safe soap",
      "Dialed to 3,000-4,000 PSI for stone",
    ];
    for (const line of invented) expect(screenClaims(line, roofer).length, line).toBeGreaterThan(0);
  });

  it("lets copy repeat those claims when the owner's own words state them", () => {
    const owner = {
      ...roofer,
      description:
        "Same-day service with eco-friendly, pet-safe soap. Fully insured. Serving Raleigh since 2009. We have cleaned 1,200 driveways and are trusted by 300 neighbors.",
      ownerStatements: "Concrete: surface cleaner at 3000 to 4000 psi",
    };
    for (const line of [
      "Fully insured",
      "Serving Raleigh since 2009",
      "1,200 driveways cleaned",
      "Trusted by 300+ neighbors",
      "Same-day service",
      "Eco-friendly, pet-safe soap",
      "Dialed to 3,000-4,000 PSI for stone",
    ])
      expect(screenClaims(line, owner), line).toEqual([]);
  });

  it("still blocks a claim the owner's words do not state", () => {
    const owner = { ...roofer, description: "Open Monday to Friday. We have cleaned 500 driveways." };
    expect(screenClaims("1,200 driveways cleaned", owner).length).toBeGreaterThan(0);
    expect(screenClaims("Same-day service", owner).length).toBeGreaterThan(0);
    expect(screenClaims("Trusted by 300+ neighbors", owner).length).toBeGreaterThan(0);
    expect(screenClaims("20 years of experience", { ...owner, description: "We own 20 trucks." }).length).toBeGreaterThan(0);
    // A different noun is a different claim: the copy must use the owner's words.
    expect(screenClaims("Trusted by 300+ neighbors", { ...owner, description: "Trusted by 300 local families." }).length).toBeGreaterThan(0);
  });

  it("does not let real testimonials unlock an invented track record", () => {
    const withReviews = { ...roofer, testimonialCount: 3 };
    expect(screenClaims("1,200 driveways cleaned", withReviews).length).toBeGreaterThan(0);
    expect(screenClaims("Trusted by 300+ neighbors", withReviews).length).toBeGreaterThan(0);
  });

  it("allows a years claim only when it states the number the owner supplied", () => {
    const owner = { ...roofer, yearsInBusiness: 12 };
    expect(screenClaims("12 years of experience", owner)).toEqual([]);
    expect(screenClaims("Serving Dallas since " + (new Date().getFullYear() - 12), owner)).toEqual([]);
    expect(screenClaims("30 years of experience", owner).length).toBeGreaterThan(0);
    expect(screenClaims("Serving Dallas since 1999", owner).length).toBeGreaterThan(0);
  });

  it("does not flag plain, true sentences", () => {
    for (const line of ["We wash driveways in Raleigh.", "Call to book a visit.", "Roof repair and inspection in Dallas."])
      expect(screenClaims(line, roofer), line).toEqual([]);
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
