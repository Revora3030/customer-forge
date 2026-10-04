import { describe, expect, it } from "vitest";
import { paletteProblems } from "@/lib/builder/palette-guard";

describe("palette guard", () => {
  it("rejects the flat grey look from generated sites", () => {
    expect(paletteProblems({ primary: "#111111", secondary: "#bdbdbd", accent: "#e5e5e5" }).length).toBeGreaterThan(0);
  });

  it("rejects plain white with a black action and no brand hue", () => {
    expect(paletteProblems({ primary: "#000000", secondary: "#ffffff", accent: "#f2f2f2" }).length).toBeGreaterThan(0);
  });

  it("accepts a deliberate branded palette", () => {
    expect(paletteProblems({ primary: "#e8a317", secondary: "#0f1b2d", accent: "#1f3a5f" })).toEqual([]);
    expect(paletteProblems({ primary: "#c2410c", secondary: "#f6efe4", accent: "#3f2a1d" })).toEqual([]);
  });
});
