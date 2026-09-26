import { describe, expect, it } from "vitest";
import * as coverage from "./request-coverage";
const { normalizeBuilderInstruction } = coverage;

describe("builder request coverage", () => {
  it("treats front as font in a visual styling request", () => {
    const normalized = normalizeBuilderInstruction("Change front and background color");
    expect(normalized).toContain("font/fonts");
    expect(normalized).toContain("not foreground colour");
  });

  it("does not rewrite unrelated uses of front", () => {
    expect(normalizeBuilderInstruction("Add our storefront address")).toBe("Add our storefront address");
  });

  it("never gates AI plans on keywords in the request", () => {
    expect(Object.keys(coverage)).toEqual(["normalizeBuilderInstruction"]);
  });
});
