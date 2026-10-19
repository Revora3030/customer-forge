import { describe, expect, it } from "vitest";
import { missingColor } from "./collective-first-build.server";
import { blankCreativeBrief } from "./first-build-contract";

describe("missingColor", () => {
  it("flags a brief whose colour direction the AI never wrote", () => {
    expect(missingColor(blankCreativeBrief([]))).toEqual(["color.system", "color.strategy"]);
  });

  it("passes a brief with an AI-authored palette and strategy", () => {
    const brief = blankCreativeBrief([]);
    brief.color = { ...brief.color, system: "deep graphite with brass", strategy: "dark-dominant bands" };
    expect(missingColor(brief)).toEqual([]);
  });
});
