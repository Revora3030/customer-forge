import { describe, expect, it } from "vitest";
import { coveredRequestDimensions, normalizeBuilderInstruction } from "./request-coverage";

describe("builder request coverage", () => {
  it("treats front as font in a visual styling request", () => {
    const normalized = normalizeBuilderInstruction("Change front and background color");
    expect(normalized).toContain("font/fonts");
    expect(normalized).toContain("not foreground colour");
  });

  it("does not rewrite unrelated uses of front", () => {
    expect(normalizeBuilderInstruction("Add our storefront address")).toBe("Add our storefront address");
  });

  it("does not report font coverage for a colour-only theme action", () => {
    const coverage = coveredRequestDimensions("Change front and background color", [
      {
        type: "set_theme",
        patch: { primary_color: "#111111", secondary_color: "#eeeeee" },
      },
    ]);
    expect(coverage).toEqual([
      { label: "font change", covered: false },
      { label: "color change", covered: true },
    ]);
  });
});