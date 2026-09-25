import { describe, expect, it } from "vitest";
import { PEER_PURPOSE_MODELS, purposeTier, selectTier } from "./collective";
import { panelFor } from "@/lib/builder/review-panel.server";

describe("GPT-5.6 Sol and Luna are called during real builds", () => {
  it("routes final review to GPT-5.6 Sol inside the Sol tier", () => {
    expect(PEER_PURPOSE_MODELS.final_review?.model).toBe("gpt-5.6-sol");
    expect(purposeTier("final_review")).toBe("sol");
  });

  it("routes completeness and schema work to GPT-5.6 Luna", () => {
    expect(PEER_PURPOSE_MODELS.completeness_check?.model).toBe("gpt-5.6-luna");
    expect(PEER_PURPOSE_MODELS.schema_markup?.model).toBe("gpt-5.6-luna");
    expect(purposeTier("completeness_check")).toBe("luna");
  });

  it("puts both on the build review panel", () => {
    const full = panelFor("full").map((r) => r.purpose);
    expect(full).toContain("final_review");
    expect(full).toContain("completeness_check");
    expect(panelFor("light").map((r) => r.purpose)).toContain("completeness_check");
  });

  it("never lets complexity turn the senior review into GPT-6 Sol grading itself", () => {
    const pick = selectTier({ purpose: "final_review", complexity: "high", available: ["sol", "terra", "luna"] });
    expect(pick.tier).toBe("sol");
    expect(pick.downgraded).toBe(false);
  });
});
