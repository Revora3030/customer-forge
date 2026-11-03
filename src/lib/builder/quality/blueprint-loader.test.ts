import { describe, expect, it } from "vitest";
import { PLAYBOOK_CATALOG } from "@/lib/builder/playbook-catalog.generated";
import { ARCHETYPE_TO_SLUG, BLUEPRINT_ALIASES, loadBlueprint, resolveBlueprintSlug } from "./blueprint-loader";

const slugs = new Set(PLAYBOOK_CATALOG.map((entry) => entry.slug));

describe("blueprint-first loader", () => {
  it("only maps aliases and archetypes onto real catalog categories", () => {
    for (const [, slug] of BLUEPRINT_ALIASES) expect(slugs.has(slug), slug).toBe(true);
    for (const slug of Object.values(ARCHETYPE_TO_SLUG)) expect(slugs.has(slug), slug).toBe(true);
  });

  it("loads a complete blueprint for every catalog category label", () => {
    for (const entry of PLAYBOOK_CATALOG) {
      const loaded = loadBlueprint(entry.label);
      expect(loaded.sections.length, entry.slug).toBeGreaterThanOrEqual(5);
      expect(loaded.signatureTool.name, entry.slug).toBeTruthy();
      expect(loaded.palette.base, entry.slug).toMatch(/^#[0-9a-f]{6}$/i);
      expect(loaded.promptBlock.length, entry.slug).toBeGreaterThan(200);
    }
  });

  it("finds a trade blueprint for plain trade names", () => {
    expect(loadBlueprint("Plumbing").source).toBe("trade");
    expect(loadBlueprint("Roofing contractor").slug).toBe("roofing");
    expect(loadBlueprint("Family dentist").slug).toBe("dental");
  });

  it("uses alias words for phrasings the trade patterns miss", () => {
    expect(resolveBlueprintSlug("Handyman").slug).toBe("home-services");
    expect(resolveBlueprintSlug("Taproom").slug).toBe("brewery-winery");
    expect(resolveBlueprintSlug("Stump grinding").slug).toBe("tree-service");
  });

  it("reads the description and services when the industry says nothing", () => {
    const loaded = loadBlueprint("", "We mow lawns and trim hedges");
    expect(loaded.slug).toBe("landscaping");
    expect(loaded.source).not.toBe("generic");
  });

  it("never returns a blank page: odd, empty and nonsense industries all get a full blueprint", () => {
    for (const industry of [null, undefined, "", "   ", "xqzv", "Quantum llama grooming", "!!!", "a".repeat(500)]) {
      const loaded = loadBlueprint(industry);
      expect(loaded.slug.length).toBeGreaterThan(0);
      expect(loaded.sections.length).toBeGreaterThanOrEqual(5);
      expect(loaded.hero.primaryCta.length).toBeGreaterThan(0);
      expect(loaded.promptBlock).toContain("BLUEPRINT-FIRST");
    }
    expect(loadBlueprint(null).source).toBe("generic");
    expect(loadBlueprint("xqzv").slug).toBeTruthy();
  });

  it("carries the owner-supplied keys and omit rules so facts stay the owner's", () => {
    const loaded = loadBlueprint("Jet ski rentals");
    expect(loaded.slug).toBe("watersports-rentals");
    expect(loaded.omitIfMissing.length).toBeGreaterThan(0);
    expect(loaded.promptBlock).toMatch(/never facts|owner/i);
  });

  it("returns copies, so a caller cannot change the shared catalog", () => {
    const first = loadBlueprint("Plumbing");
    first.palette.base = "#000000";
    first.sections[0]!.label = "changed";
    const second = loadBlueprint("Plumbing");
    expect(second.palette.base).not.toBe("#000000");
    expect(second.sections[0]!.label).not.toBe("changed");
  });
});
