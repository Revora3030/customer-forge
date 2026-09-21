import { describe, expect, it } from "vitest";
import {
  TEMPLATE_GALLERY,
  blockLabel,
  searchTemplates,
  suggestTemplates,
  templateById,
  templateInstruction,
} from "./template-gallery";

describe("template gallery", () => {
  it("offers one template per kind of website, each complete", () => {
    expect(TEMPLATE_GALLERY.length).toBeGreaterThanOrEqual(10);
    for (const template of TEMPLATE_GALLERY) {
      expect(template.name.length).toBeGreaterThan(2);
      expect(template.summary.length).toBeGreaterThan(5);
      expect(template.goalLabel.length).toBeGreaterThan(5);
      expect(template.pages[0]).toBe("Home");
      expect(template.pages).toContain("Contact");
      expect(template.homeBlocks[0]).toBe("Opening banner");
      expect(new Set(template.homeBlocks).size).toBe(template.homeBlocks.length);
    }
  });

  it("uses plain words for every block, never raw codes", () => {
    for (const template of TEMPLATE_GALLERY) {
      for (const block of template.homeBlocks) {
        expect(block).not.toMatch(/_/);
      }
    }
  });

  it("is stable and findable by id", () => {
    const first = TEMPLATE_GALLERY[0]!;
    expect(templateById(first.id)).toEqual(first);
    expect(templateById("nope")).toBeNull();
    expect(templateById(null)).toBeNull();
  });

  it("labels unknown blocks readably instead of failing", () => {
    expect(blockLabel("weird_block")).toBe("Weird Block");
  });
});

describe("finding a template", () => {
  it("searches names, summaries and trade words", () => {
    const results = searchTemplates("restaurant");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name.toLowerCase()).toContain("restaurant");
  });

  it("returns the whole gallery for an empty search", () => {
    expect(searchTemplates("")).toHaveLength(TEMPLATE_GALLERY.length);
    expect(searchTemplates(null)).toHaveLength(TEMPLATE_GALLERY.length);
  });

  it("returns nothing rather than a wrong guess for nonsense", () => {
    expect(searchTemplates("zzzzqqqq")).toEqual([]);
  });

  it("suggests templates from the business's own trade", () => {
    const suggestions = suggestTemplates({ industry: "plumbing", description: "emergency callouts" }, 3);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.some((t) => /service/i.test(t.name))).toBe(true);
  });

  it("still suggests something when nothing is known yet", () => {
    expect(suggestTemplates({}, 2)).toHaveLength(2);
  });
});

describe("the instruction a template sends to the builder", () => {
  const instruction = templateInstruction(TEMPLATE_GALLERY[0]!);

  it("names the layout, pages, blocks and the goal", () => {
    expect(instruction).toContain(TEMPLATE_GALLERY[0]!.name);
    expect(instruction).toContain("Pages:");
    expect(instruction).toContain("Home page blocks");
  });

  it("forbids invented facts", () => {
    expect(instruction).toContain("do not invent any facts");
  });
});
