import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Generate sections from business text", () => {
  it("uses the approved full-build pipeline instead of a separate section template", () => {
    const hooks = readFileSync(new URL("./site-engine.hooks.ts", import.meta.url), "utf8");
    const wizard = readFileSync(
      new URL("../components/app/BuilderWizard.tsx", import.meta.url),
      "utf8",
    );

    const start = hooks.indexOf("export function useGenerateSectionsFromText");
    const end = hooks.indexOf("export function useAiCopyEdit", start);
    const flow = hooks.slice(start, end);

    expect(flow).toContain("analyzeSiteBrief");
    expect(flow).toContain("saveSiteBrief");
    expect(flow).toContain("approved: true");
    expect(flow).toContain("runSiteGeneration");
    expect(wizard).toContain("Generate sections from my text");
    expect(wizard).toContain("await saveProfile.mutateAsync");
    expect(wizard).toContain("Sol plans · Terra reviews · images and copy follow");
  });
});