import { describe, expect, it } from "vitest";
import {
  AI_GENERATED_MARKETING_VISUAL,
  BUSINESS_PROVIDED_EVIDENCE,
  PROHIBITED_EVIDENCE,
  briefDivergence,
  compileCreativeBrief,
  pickArchetype,
} from "@/lib/builder/creative-brief";
import { createDesignFingerprint } from "@/lib/builder/design-fingerprint";
import { VISUAL_DIRECTIONS, planShots } from "@/lib/visual-direction";
import { compileFirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";

function briefFor(businessName: string, industry: string, hasOwnerPhotos = false) {
  const fingerprint = createDesignFingerprint({
    businessName,
    industry,
    city: "Raleigh",
  });
  const direction = VISUAL_DIRECTIONS[0]!;
  const shots = planShots({
    direction,
    serviceNames: ["Full detail", "Ceramic coating"],
    hasHeroImage: hasOwnerPhotos,
    mediaCount: hasOwnerPhotos ? 3 : 0,
  });
  return compileCreativeBrief({
    fingerprint,
    direction,
    shots,
    industryLabel: industry,
    industrySignals: industry,
    primaryCta: "Get a quote",
    secondaryCta: "Call us",
    conversionPlacements: ["hero", "footer"],
    stickyMobile: true,
    hasOwnerPhotos,
  });
}

describe("creative brief", () => {
  it("picks industry-appropriate archetypes instead of one house style", () => {
    expect(pickArchetype("auto detailing")).toBe("premium-automotive");
    expect(pickArchetype("family law firm")).toBe("high-end-professional");
    expect(pickArchetype("neighbourhood coffee shop")).toBe("restaurant-appetite");
    expect(pickArchetype("roofing contractor")).toBe("trade-craft");
    expect(pickArchetype("mobile dog walking")).toBe("local-trust");
  });

  it("is deterministic for the same business", () => {
    expect(briefFor("Supreme Detailing", "auto detailing")).toEqual(
      briefFor("Supreme Detailing", "auto detailing"),
    );
  });

  it("does not converge on one composition inside one industry", () => {
    const names = ["Supreme Detailing", "Apex Auto Spa", "Carolina Shine Co", "Nightfall Detail"];
    const briefs = names.map((name) => briefFor(name, "auto detailing"));
    const structural = new Set(
      briefs.map((b) =>
        [b.heroComposition, b.sectionRhythm, b.cardLanguage, b.typography.pairingId].join("|"),
      ),
    );
    expect(structural.size).toBeGreaterThan(1);
    expect(briefDivergence(briefs[0]!, briefs[1]!)).toBeGreaterThan(0);
  });

  it("writes an image brief for every planned slot with layout-usable direction", () => {
    const brief = briefFor("Supreme Detailing", "auto detailing");
    expect(brief.imageInventory.length).toBeGreaterThan(0);
    for (const spec of brief.imageInventory) {
      expect(spec.subject).toBeTruthy();
      expect(spec.camera).toBeTruthy();
      expect(spec.lighting).toBeTruthy();
      expect(spec.aspectRatio).toMatch(/^\d+:\d+$/);
      expect(spec.mobileCrop).toContain("320px");
      expect(spec.constraints).toContain("no text");
      expect(spec.constraints.join(" ")).toMatch(/never presented as proof/);
      expect(spec.evidenceTag).toBe(AI_GENERATED_MARKETING_VISUAL);
    }
  });

  it("tags owner-supplied material separately from generated marketing visuals", () => {
    const owner = briefFor("Supreme Detailing", "auto detailing", true);
    for (const spec of owner.imageInventory) {
      expect(spec.evidenceTag).toBe(BUSINESS_PROVIDED_EVIDENCE);
    }
  });

  it("refuses to invent business evidence", () => {
    const brief = briefFor("Supreme Detailing", "auto detailing");
    expect(brief.prohibitedEvidence).toEqual(PROHIBITED_EVIDENCE);
    const serialized = JSON.stringify(brief).toLowerCase();
    expect(serialized).not.toMatch(/\b5[- ]star\b|award-winning|certified by|\d+ happy customers/);
  });

  it("keeps accessible contrast targets in the colour system", () => {
    const brief = briefFor("Supreme Detailing", "auto detailing");
    expect(brief.color.minBodyContrast).toBeGreaterThanOrEqual(4.5);
    expect(brief.color.minLargeTextContrast).toBeGreaterThanOrEqual(3);
  });

  it("reaches the real first-build creative direction", () => {
    const direction = compileFirstBuildCreativeDirection({
      organizationId: "org-1",
      businessName: "Supreme Detailing",
      industry: "auto detailing",
      description: "Mobile auto detailing",
      city: "Raleigh",
      state: "NC",
      serviceArea: "Raleigh, NC",
      phone: null,
      email: null,
      yearsInBusiness: null,
      services: [{ name: "Full detail" }, { name: "Ceramic coating" }],
      goals: ["quotes"],
      conversionGoal: "quotes",
      photoCount: 0,
      testimonialCount: 0,
      bookableServices: 0,
      hasHours: false,
    });
    expect(direction.brief.archetype).toBe("premium-automotive");
    expect(direction.brief.imageInventory.length).toBeGreaterThan(0);
    expect(direction.brief.fingerprintId).toBe(direction.fingerprint.id);
  });
});
