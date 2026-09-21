import { describe, expect, it } from "vitest";
import { createDesignFingerprint } from "@/lib/builder/design-fingerprint";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-creative";
import {
  applyScreenshotReferenceToCreative,
  deriveScreenshotReferenceFingerprint,
  normalizeScreenshotReferenceObservations,
} from "@/lib/builder/screenshot-reference";

const base = createDesignFingerprint({
  businessName: "Northline",
  industry: "Automotive detailing",
  city: "New York",
  photoCount: 0,
});

describe("screenshot reference fingerprint", () => {
  it("maps bounded observations into the finite design fingerprint vocabulary", () => {
    const result = deriveScreenshotReferenceFingerprint({
      base,
      businessName: "Northline",
      observations: {
        layout: ["split two column hero with a bento grid below"],
        typography: ["large headline with geometric modern sans"],
        spacing: ["airy spacious rhythm"],
        color: ["dark black canvas with gold accents"],
        interactions: ["sticky navigation with subtle fade animation"],
      },
    });
    expect(result.applied).toBe(true);
    expect(result.fingerprint.pageShell).toBe("split-screen");
    expect(result.fingerprint.typeSystem).toBe("geometric-sans");
    expect(result.fingerprint.density).toBe("airy");
    expect(result.fingerprint.colorSystem).toBe("ivory-gold");
    expect(result.fingerprint.motionLevel).toBe("subtle");
  });

  it("never preserves copy, brand names, urls or exact colours from the reference", () => {
    const result = deriveScreenshotReferenceFingerprint({
      base,
      businessName: "Northline",
      observations: {
        layout: ["clone Northline exactly and copy the logo"],
        color: ["use #123456 and https://competitor.example"],
        typography: ["verbatim same wording"],
      },
    });
    expect(JSON.stringify(result.signals)).not.toMatch(/Northline|123456|competitor/i);
    expect(result.antiCloning.copiedAssetsAllowed).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("falls back to the original fingerprint for malformed input", () => {
    const result = deriveScreenshotReferenceFingerprint({ base, observations: "not structured" });
    expect(result.applied).toBe(false);
    expect(result.fingerprint).toEqual(base);
    expect(result.warnings[0]).toMatch(/No structured/);
  });

  it("is deterministic for the same observations", () => {
    const observations = {
      layout: ["editorial magazine sections"],
      spacing: ["compact dense cards"],
      interactions: ["static no animation"],
    };
    const a = deriveScreenshotReferenceFingerprint({ base, observations });
    const b = deriveScreenshotReferenceFingerprint({ base, observations });
    expect(a).toEqual(b);
  });

  it("normalizes observations with deduping, blocked names and per-field limits", () => {
    const normalized = normalizeScreenshotReferenceObservations(
      {
        layout: [
          "Bento grid proof row",
          "Bento grid proof row",
          "Northline branded header",
          "clone the exact hero",
          "full bleed cinematic panel",
          "split hero with side by side copy",
        ],
        color: ["Use #ffcc00 exactly", "dark charcoal canvas", "https://competitor.example"],
        components: ["sticky navigation", "floating quote form", "mobile bottom bar"],
      },
      { businessName: "Northline", blockedNames: ["Competitor"], maxPerField: 2 },
    );

    expect(normalized.layout).toEqual(["bento grid proof row", "branded header"]);
    expect(normalized.color).toEqual(["dark charcoal canvas"]);
    expect(normalized.components).toEqual(["sticky navigation", "floating quote form"]);
    expect(JSON.stringify(normalized)).not.toMatch(/Northline|clone|#ffcc00|competitor/i);
  });

  it("aligns the creative brief to a reference fingerprint without importing copy", () => {
    const creative = {
      fingerprint: base,
      brief: {
        fingerprintId: base.id,
        archetype: "service-business",
        personality: "precise and premium",
        density: "balanced",
        heroComposition: base.heroComposition,
        sectionRhythm: base.sectionRhythm,
        cardLanguage: "soft cards",
        ctaLanguage: "paired buttons",
        backgroundTreatment: "quiet canvas",
        color: { system: base.colorSystem },
        motion: { level: base.motionLevel, language: "subtle motion" },
        photography: {
          language: "clean service details",
          lighting: "soft light",
          environment: "studio",
          treatment: "natural crops",
        },
        mobileStrategy: ["short hero"],
        conversionStrategy: ["lead form near proof"],
        industryConventions: ["service menu"],
        imageInventory: [
          {
            slot: "hero",
            label: "Hero visual",
            purpose: "show the service atmosphere",
            subject: "detail bay",
            aspectRatio: "16:9",
            framing: "wide",
            mobileCrop: "center",
            evidenceTag: "generated-artwork",
            palette: base.colorSystem,
            mood: base.family,
          },
        ],
      },
      imagery: { status: "needed", shots: [], assetPlan: { readiness: "needs_assets", missingRequired: [] } },
      industry: { objections: [], avoid: [] },
      audience: "local buyers",
      unknowns: [],
    } as FirstBuildCreativeDirection;

    const result = applyScreenshotReferenceToCreative({
      creative,
      observations: {
        layout: ["split two column hero"],
        typography: ["geometric modern sans"],
        color: ["dark canvas with gold accent"],
      },
      businessName: "Northline",
    });

    expect(result.reference.applied).toBe(true);
    expect(result.creative.fingerprint.pageShell).toBe("split-screen");
    expect(result.creative.brief.fingerprintId).toBe(result.creative.fingerprint.id);
    expect(result.creative.brief.color.system).toBe(result.creative.fingerprint.colorSystem);
    expect(JSON.stringify(result.reference.signals)).not.toMatch(/exact wording|logo|clone/i);
  });
});
