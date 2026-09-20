import { describe, expect, it } from "vitest";
import { archetypeFor, enrichPlaybookWithArchetype } from "./archetype-playbook";
import { playbookFor } from "./industry";

describe("archetype playbook bridge", () => {
  it("uses the business industry when the request says nothing about a website type", () => {
    expect(archetypeFor({ industry: "Dental" }, "make it look premium").id).toBe("clinic");
  });

  it("lets an explicit request outrank the stored industry", () => {
    expect(archetypeFor({ industry: "Plumbing" }, "turn this into a restaurant website").id).toBe(
      "restaurant",
    );
  });

  it("adds the pages and sections that kind of website needs", () => {
    const base = playbookFor("Restaurant");
    const enriched = enrichPlaybookWithArchetype(base, archetypeFor({ industry: "Restaurant" }));
    expect(enriched.pages.map((page) => page.slug)).toEqual(
      expect.arrayContaining(["menu", "visit"]),
    );
    expect(enriched.pages.length).toBeGreaterThanOrEqual(base.pages.length);
    expect(new Set(enriched.pages.map((p) => p.slug)).size).toBe(enriched.pages.length);
  });

  it("keeps the home page ending on its call to action", () => {
    const base = playbookFor("Hotel");
    const enriched = enrichPlaybookWithArchetype(base, archetypeFor({ industry: "Hotel" }));
    const last = enriched.homeSections[enriched.homeSections.length - 1]!;
    expect(["cta", "sticky_cta"]).toContain(last);
    expect(new Set(enriched.homeSections).size).toBe(enriched.homeSections.length);
  });

  it("produces different structures for different kinds of business", () => {
    const shapes = ["Restaurant", "Hotel", "Gym", "Law", "Charity"].map((industry) =>
      enrichPlaybookWithArchetype(playbookFor(industry), archetypeFor({ industry }))
        .pages.map((page) => page.slug)
        .join(","),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });
});
