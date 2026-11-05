import { describe, expect, it } from "vitest";
import { cleanLook, lookCanChange, lookSeed, MAX_LOOKS, nextLook, readSiteLook, withLook } from "@/lib/builder/site-look";
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
