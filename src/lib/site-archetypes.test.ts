import { describe, expect, it } from "vitest";
import {
  SITE_ARCHETYPES,
  archetypeById,
  classifyArchetype,
  resolveArchetypeText,
} from "@/lib/site-archetypes";

const SECTION_KINDS = new Set([
  "hero", "trust_bar", "intro", "services", "service_detail", "benefits", "process", "stats",
  "gallery", "reviews", "guarantee", "offer", "lead_magnet", "area", "areas", "faq", "pricing",
  "quote", "booking", "cta", "sticky_cta", "contact", "policy", "custom",
]);

const PAGE_KINDS = new Set([
  "home", "services", "service", "area", "pricing", "book", "about", "reviews", "gallery", "faq",
  "offers", "contact", "thanks", "privacy", "custom",
]);

describe("site archetypes", () => {
  it("offers a wide, unique set of website shapes", () => {
    expect(SITE_ARCHETYPES.length).toBeGreaterThanOrEqual(20);
    const ids = SITE_ARCHETYPES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses section and page kinds the renderer supports", () => {
    for (const archetype of SITE_ARCHETYPES) {
      for (const section of archetype.homeSections) expect(SECTION_KINDS.has(section.kind)).toBe(true);
      for (const page of archetype.pages) {
        expect(PAGE_KINDS.has(page.kind)).toBe(true);
        expect(page.sections.length).toBeGreaterThan(0);
        for (const section of page.sections) expect(SECTION_KINDS.has(section.kind)).toBe(true);
      }
    }
  });

  it("never states a business fact in structural copy", () => {
    const banned = /\b(best|award|certified|licensed|guaranteed results|\d+%|\$\d|5[- ]star|trusted by \d)/i;
    for (const archetype of SITE_ARCHETYPES) {
      const text = [
        ...archetype.homeSections,
        ...archetype.pages.flatMap((page) => page.sections),
      ]
        .flatMap((section) => [section.heading, section.subheading ?? ""])
        .join(" | ");
      expect(text).not.toMatch(banned);
    }
  });

  it("routes different industries to different website shapes", () => {
    const cases: [string, string][] = [
      ["Restaurant", "restaurant"],
      ["Dental", "clinic"],
      ["Plumbing", "local_service"],
      ["Law", "legal_finance"],
      ["Gym", "fitness"],
      ["Real Estate", "real_estate"],
      ["Hotel", "hospitality"],
      ["Marketing Agency", "agency"],
      ["Charity", "nonprofit"],
      ["Software", "saas_product"],
      ["Photography", "portfolio"],
      ["Auto Detailing", "automotive"],
      ["Home care", "care_services"],
      ["Tutoring", "education"],
    ];
    for (const [industry, expected] of cases) {
      expect(classifyArchetype({ industry }).id, industry).toBe(expected);
    }
    expect(new Set(cases.map(([industry]) => classifyArchetype({ industry }).id)).size).toBeGreaterThan(10);
  });

  it("falls back to the local service shape when nothing matches", () => {
    expect(classifyArchetype({ industry: "" }).id).toBe("local_service");
    expect(classifyArchetype({ industry: "zzzz unknown trade" }).id).toBe("local_service");
  });

  it("looks up by id and resolves structural tokens", () => {
    expect(archetypeById("restaurant")?.name).toBeTruthy();
    expect(archetypeById("nope")).toBeNull();
    expect(resolveArchetypeText("Inside {name}", { businessName: "Rosa's" })).toBe("Inside Rosa's");
  });
});
