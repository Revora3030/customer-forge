import { describe, expect, it } from "vitest";
import { isPlaceholderPalette } from "@/lib/site-theme";

describe("isPlaceholderPalette", () => {
  it("treats pure black + white as no owner brand", () => {
    expect(isPlaceholderPalette({ primaryColor: "#000000", secondaryColor: "#FFFFFF" })).toBe(true);
  });
  it("keeps a real owner colour", () => {
    expect(isPlaceholderPalette({ primaryColor: "#34D399", secondaryColor: "#0E0E10" })).toBe(false);
  });
  it("is false when nothing is saved", () => {
    expect(isPlaceholderPalette({ primaryColor: null, secondaryColor: null })).toBe(false);
  });
});
