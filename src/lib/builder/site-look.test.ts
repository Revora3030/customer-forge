import { describe, expect, it } from "vitest";
import { cleanLook, lookCanChange, lookSeed, MAX_LOOKS, nextLook, readSectionLook, readSectionLooks, readSiteLook, sectionCanReseed, sectionLookSeed, seedForSection, withLook, withSectionLook } from "@/lib/builder/site-look";
import { legacySectionToComposition } from "@/lib/builder/legacy-composition";
import { pickVariant } from "@/lib/builder/section-variants";

describe("CG-07 try another look", () => {
  it("look 0 keeps the exact pre-CG-07 seed so no existing site changes", () => {
    expect(lookSeed("acme", 0)).toBe("acme");
    expect(lookSeed("acme", readSiteLook({}))).toBe("acme");
    expect(lookSeed("acme", 3)).toBe("acme#look-3");
    expect(lookSeed("", 3)).toBeNull();
  });

  it("reads and cleans the saved look", () => {
    expect(readSiteLook({ look: 4 })).toBe(4);
    expect(readSiteLook({ look: -1 })).toBe(0);
    expect(readSiteLook({ look: MAX_LOOKS })).toBe(0);
    expect(readSiteLook({ look: 1.5 })).toBe(0);
    expect(readSiteLook(null)).toBe(0);
    expect(cleanLook("2")).toBe(2);
  });

  it("next look wraps and never repeats the current one", () => {
    for (let n = 0; n < MAX_LOOKS; n++) expect(nextLook(n)).not.toBe(n);
    expect(nextLook(MAX_LOOKS - 1)).toBe(0);
  });

  it("previews without mutating the saved site, keeping everything else", () => {
    const site = { settings: { generation: { palette: "x", look: 1 }, seo: { a: 1 } }, content: { sections: [] } };
    const preview = withLook(site, 5);
    expect(preview.settings.generation).toEqual({ palette: "x", look: 5 });
    expect(preview.settings.seo).toEqual({ a: 1 });
    expect(site.settings.generation.look).toBe(1);
  });

  it("some look rearranges at least one plain section layout across the 5 groups", () => {
    const groups = ["hero", "cards", "proof", "about", "cta"] as const;
    const changed = groups.some((g) => Array.from({ length: MAX_LOOKS }, (_, n) => pickVariant(g, "sec-1", lookSeed("acme", n))).some((v, _, all) => v !== all[0]));
    expect(changed).toBe(true);
    expect(typeof legacySectionToComposition).toBe("function");
  });

  it("only offers the button when a plain section exists", () => {
    const has = (s: unknown) => Boolean(s && (s as { composition?: unknown }).composition);
    expect(lookCanChange([{ settings: { composition: {} } }], has)).toBe(false);
    expect(lookCanChange([{ settings: { composition: {} } }, { settings: {} }], has)).toBe(true);
    expect(lookCanChange(null, has)).toBe(false);
  });
});

describe("CG-14 per-section look", () => {
  it("keeps look 0 as the site seed so untouched sections do not change", () => {
    expect(sectionLookSeed("acme", 0, "sec-1", 0)).toBe("acme");
    expect(sectionLookSeed("acme", 3, "sec-1", 0)).toBe("acme#look-3");
    expect(seedForSection("acme", { look: 3 }, "sec-1")).toBe("acme#look-3");
  });

  it("mixes a section override into the seed and clears look 0 from the map", () => {
    expect(sectionLookSeed("acme", 0, "sec-1", 2)).toBe("acme#sec-sec-1-2");
    expect(readSectionLooks({ sectionLooks: { "sec-1": 2, "sec-2": 0, bad: 99 } })).toEqual({ "sec-1": 2 });
    expect(readSectionLook({ sectionLooks: { "sec-1": 2 } }, "sec-1")).toBe(2);
    expect(readSectionLook({}, "sec-1")).toBe(0);
  });

  it("previews one section without mutating the saved site", () => {
    const site = { settings: { generation: { look: 1, sectionLooks: { "sec-1": 2 }, palette: "x" } } };
    const preview = withSectionLook(site, "sec-2", 4);
    expect(preview.settings.generation).toEqual({ look: 1, sectionLooks: { "sec-1": 2, "sec-2": 4 }, palette: "x" });
    expect(site.settings.generation.sectionLooks).toEqual({ "sec-1": 2 });
    expect(withSectionLook(site, "sec-1", 0).settings.generation.sectionLooks).toBeUndefined();
  });

  it("a section reseed rearranges at least one plain layout across looks", () => {
    const seeds = Array.from({ length: MAX_LOOKS }, (_, n) => sectionLookSeed("acme", 0, "sec-1", n));
    const variants = seeds.map((seed) => pickVariant("hero", "sec-1", seed));
    expect(variants.some((v) => v !== variants[0])).toBe(true);
  });

  it("only offers a free reseed on plain sections", () => {
    const has = (s: unknown) => Boolean(s && (s as { composition?: unknown }).composition);
    expect(sectionCanReseed({ composition: {} }, has)).toBe(false);
    expect(sectionCanReseed({}, has)).toBe(true);
  });
});
