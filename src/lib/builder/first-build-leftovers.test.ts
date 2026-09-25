import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("leftover first-build helpers carry no creative authority", () => {
  it("the site agent never derives or saves a design identity from business facts", () => {
    const src = read("src/lib/site-agent.functions.ts");
    expect(src).not.toMatch(/createAiDesignRecord|writeAiDesignRecord/);
    expect(src).not.toMatch(/hasAuthoredAiDesignRecord|priorDesignRecord|aiDesignRecord/);
  });

  it("Sol is not handed pre-picked hero, rhythm, card, CTA or background choices", () => {
    const src = read("src/lib/builder/collective-first-build.server.ts");
    expect(src).not.toMatch(/brief\.(archetype|personality|heroComposition|sectionRhythm|cardLanguage|ctaLanguage|backgroundTreatment)/);
  });

  it("the first-build contract starts blank and imports no picker", () => {
    const src = read("src/lib/builder/first-build-contract.ts");
    expect(src).not.toMatch(/homeSections|pageSlugs|playbookFor|pickVisualDirection|createAiDesignRecord|pick\(/);
  });
});

describe("no built-in first-build copy writer", () => {
  it("keeps the rule-based copy engine deleted", async () => {
    const { readFileSync } = await import("node:fs");
    const engine = readFileSync("src/lib/site-engine.server.ts", "utf8");
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(engine).not.toMatch(/export function fallbackCopy/);
    expect(worker).not.toMatch(/fallbackCopy/);
    expect(worker).toMatch(/missingAiCopy/);
  });
});
