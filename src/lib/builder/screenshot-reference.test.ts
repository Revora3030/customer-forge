import { describe, expect, it } from "vitest";
import {
  applyScreenshotReferenceToCreative,
  deriveScreenshotReferenceBrief,
  normalizeScreenshotReferenceObservations,
} from "@/lib/builder/screenshot-reference";
import { blankCreativeBrief } from "@/lib/builder/first-build-contract";

const creative = {
  brief: {
    ...blankCreativeBrief([]),
    concept: "AI-authored test brief",
    personality: "calm",
    typography: { ...blankCreativeBrief([]).typography, display: "Editorial sans", body: "Humanist sans" },
    color: { ...blankCreativeBrief([]).color, system: "quiet blue", strategy: "warm contrast" },
    heroComposition: "wide opening",
    photography: { language: "real work", lighting: "natural", environment: "on location", treatment: "honest", subjects: [] },
    sectionRhythm: "varied",
    density: "authored",
    cardLanguage: "soft panels",
    ctaLanguage: "direct",
    backgroundTreatment: "plain",
    shapeLanguage: { radius: "authored", border: "authored", shadow: "authored" },
    motion: { level: "restrained", language: "authored" },
    mobileStrategy: [], conversionStrategy: [], industryConventions: [], imageInventory: [],
  },
  referenceSignals: null as Record<string, string[]> | null,
};

describe("screenshot reference signals", () => {
  it("never patches a saved look — signals only go to the AI", () => {
    const ref = deriveScreenshotReferenceBrief({
      observations: { layout: ["split hero", "bento grid"], color: ["dark"] },
    });
    expect(ref).not.toHaveProperty("designRecord");
    expect(ref.signals.layout.length).toBeGreaterThan(0);
  });

  it("never preserves copy, brand names, urls or exact colours from the reference", () => {
    const result = deriveScreenshotReferenceBrief({
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

  it("reports malformed input without substituting a design", () => {
    const result = deriveScreenshotReferenceBrief({ observations: "not structured" });
    expect(result.applied).toBe(false);
    expect(result).not.toHaveProperty("designRecord");
    expect(result.warnings[0]).toMatch(/No structured/);
  });

  it("is deterministic for the same observations", () => {
    const observations = {
      layout: ["editorial magazine sections"],
      spacing: ["compact dense cards"],
      interactions: ["static no animation"],
    };
    const a = deriveScreenshotReferenceBrief({ observations });
    const b = deriveScreenshotReferenceBrief({ observations });
    expect(a).toEqual(b);
  });

  it("attaches sanitized signals to the AI creative payload only", () => {
    const result = applyScreenshotReferenceToCreative({
      creative,
      observations: { layout: ["asymmetric opener"], color: ["warm earth tones"] },
    });
    expect(result.creative.referenceSignals?.["layout"]).toEqual(["asymmetric opener"]);
    expect(result.creative.brief).toEqual(creative.brief);
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
});
