import { describe, expect, it } from "vitest";
import { validateComposition } from "@/lib/builder/composition-tree";
import { repairBriefFrom } from "@/components/app/VisualCheckPanel";

describe("root blocker regressions", () => {
  it("rejects an over-long composition label instead of silently trimming it", () => {
    const result = validateComposition({ version: 1, label: "x".repeat(121), root: { type: "stack", children: [] } });
    expect(result.ok).toBe(false);
  });

  it("builds an AI repair brief from every measured browser finding", () => {
    const brief = repairBriefFrom({
      score: 60,
      passed: false,
      widths: [390],
      findings: [
        { page: "home", detail: "Text overflows at 390px.", fix: "Let it wrap." },
        { page: "services", detail: "Button too small.", fix: "Enlarge it." },
      ] as never,
    });
    expect(brief).toContain("[home] Text overflows at 390px.");
    expect(brief).toContain("[services] Button too small.");
    expect(brief).toContain("Do not remove anything");
  });
});
