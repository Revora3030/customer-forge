import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("leftover first-build helpers carry no creative authority", () => {
  it("the site agent never derives or saves a design identity from business facts", () => {
    const src = read("src/lib/site-agent.functions.ts");
    expect(src).not.toMatch(/createDesignFingerprint|writeDesignFingerprint/);
    expect(src).toMatch(/family !== "neutral"/);
  });

  it("Sol is not handed pre-picked hero, rhythm, card, CTA or background choices", () => {
    const src = read("src/lib/builder/collective-first-build.server.ts");
    expect(src).not.toMatch(/brief\.(archetype|personality|heroComposition|sectionRhythm|cardLanguage|ctaLanguage|backgroundTreatment)/);
  });

  it("the first-build direction carries no industry page or section recipe", () => {
    const src = read("src/lib/builder/first-build-creative.ts");
    expect(src).not.toMatch(/homeSections|pageSlugs/);
  });
});
