import { describe, expect, it } from "vitest";
import { blankAiDesignRecord } from "@/lib/builder/ai-design-record";
import type { FirstBuildCreativeDirection } from "@/lib/builder/first-build-contract";
import {
  applyScreenshotReferenceToCreative,
  deriveScreenshotReferenceDesignRecord,
  normalizeScreenshotReferenceObservations,
} from "@/lib/builder/screenshot-reference";

const base = blankAiDesignRecord();

describe("screenshot reference signals", () => {
  it("never patches the saved look — signals only go to the AI", () => {
    const ref = deriveScreenshotReferenceDesignRecord({
      observations: { layout: ["split hero", "bento grid"], color: ["dark"] },
      base,
    });
    expect(ref.designRecord).toEqual(base);
    expect(ref.signals.layout.length).toBeGreaterThan(0);
  });

  it("never preserves copy, brand names, urls or exact colours from the reference", () => {
    const result = deriveScreenshotReferenceDesignRecord({
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

  it("falls back to the original designRecord for malformed input", () => {
    const result = deriveScreenshotReferenceDesignRecord({ base, observations: "not structured" });
    expect(result.applied).toBe(false);
    expect(result.designRecord).toEqual(base);
    expect(result.warnings[0]).toMatch(/No structured/);
  });

  it("is deterministic for the same observations", () => {
    const observations = {
      layout: ["editorial magazine sections"],
      spacing: ["compact dense cards"],
      interactions: ["static no animation"],
    };
    const a = deriveScreenshotReferenceDesignRecord({ base, observations });
    const b = deriveScreenshotReferenceDesignRecord({ base, observations });
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

});
