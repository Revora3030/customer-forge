import { describe, expect, it } from "vitest";
import {
  JARVIS_MODE_EXPLAINERS,
  isJarvisModeId,
  modeExplainerLine,
  type JarvisModeId,
} from "./jarvis-mode-explainers";

describe("jarvis mode explainers (JC-40)", () => {
  it("covers Brief, Balanced, and Deep with non-empty does lines", () => {
    const ids: JarvisModeId[] = ["brief", "balanced", "deep"];
    expect(Object.keys(JARVIS_MODE_EXPLAINERS).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(JARVIS_MODE_EXPLAINERS[id].label.length).toBeGreaterThan(0);
      expect(JARVIS_MODE_EXPLAINERS[id].does.length).toBeGreaterThan(10);
      expect(modeExplainerLine(id)).toBe(JARVIS_MODE_EXPLAINERS[id].does);
    }
  });

  it("appends measured credits only when provided", () => {
    expect(modeExplainerLine("brief")).toBe(JARVIS_MODE_EXPLAINERS.brief.does);
    expect(modeExplainerLine("brief", null)).toBe(JARVIS_MODE_EXPLAINERS.brief.does);
    expect(modeExplainerLine("brief", "  ")).toBe(JARVIS_MODE_EXPLAINERS.brief.does);
    expect(modeExplainerLine("deep", "Uses ~3 credits last turn.")).toBe(
      `${JARVIS_MODE_EXPLAINERS.deep.does} Uses ~3 credits last turn.`,
    );
  });

  it("never invents a dollar or credit figure in the default lines", () => {
    for (const explainer of Object.values(JARVIS_MODE_EXPLAINERS)) {
      expect(explainer.does.toLowerCase()).not.toMatch(/\$|credit|usd|cost/);
    }
  });

  it("recognises mode ids", () => {
    expect(isJarvisModeId("brief")).toBe(true);
    expect(isJarvisModeId("balanced")).toBe(true);
    expect(isJarvisModeId("deep")).toBe(true);
    expect(isJarvisModeId("auto")).toBe(false);
    expect(isJarvisModeId(null)).toBe(false);
  });
});
