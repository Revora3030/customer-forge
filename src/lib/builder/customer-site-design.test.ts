import { describe, expect, it } from "vitest";
import { designTokenClasses, missingComponentTokens, safeDesignTokens } from "@/lib/builder/design-tokens";
import { evaluateDeviceMatrix } from "@/lib/builder/responsive-matrix";

describe("AI component tokens", () => {
  it("reports faq, card and button as missing when not authored", () => {
    expect(missingComponentTokens(safeDesignTokens({ radius: 8 }))).toEqual(["faq", "card", "button"]);
  });
  it("rejects invented style names", () => {
    expect(safeDesignTokens({ faq: "plain-default" })).toBeNull();
  });
  it("emits classes only for authored treatments", () => {
    const tokens = safeDesignTokens({ faq: "boxed", card: "tint", button: "outline" });
    expect(missingComponentTokens(tokens)).toEqual([]);
    expect(designTokenClasses(tokens)).toBe("rv-faq-boxed rv-card-tint rv-button-outline");
  });
});

const site = (hasMedia: boolean) => ({
  navItemCount: 4,
  pages: [{ id: "home", sections: [{ id: "s1", kind: "hero", componentCount: 3, hasMedia }] }],
});

describe("build review", () => {
  it("fails a blank stretch taller than half the screen", () => {
    const checks = evaluateDeviceMatrix(site(true), [
      { width: 390, pageId: "home", scrollWidth: 390, clientWidth: 390, largestBlankGap: 400, viewportHeight: 700 },
    ]);
    expect(checks.find((c) => c.check === "no large empty areas" && c.width === 390)?.verdict).toBe("FAIL");
  });
  it("fails a first page with no main visual", () => {
    const checks = evaluateDeviceMatrix(site(false));
    expect(checks.find((c) => c.check === "opening section has a main visual")?.verdict).toBe("FAIL");
  });
  it("never passes an unmeasured blank-space check", () => {
    const checks = evaluateDeviceMatrix(site(true), [
      { width: 390, pageId: "home", scrollWidth: 390, clientWidth: 390 },
    ]);
    expect(checks.find((c) => c.check === "no large empty areas" && c.width === 390)?.verdict).toBe("NOT_VERIFIED");
  });
});
