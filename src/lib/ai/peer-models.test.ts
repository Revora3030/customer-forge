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

describe("Astra owns its verification and advisory lanes", () => {
  it("routes funnel, consistency and industry work to GPT-6 Astra", () => {
    for (const purpose of ["funnel_verification", "site_consistency_audit", "industry_gap_analysis"] as const) {
      expect(PEER_PURPOSE_MODELS[purpose]?.model).toBe("gpt-6-astra");
      expect(purposeTier(purpose)).toBe("terra");
    }
  });

  it("keeps Astra's verification lanes out of Sol's hands on hard builds", () => {
    for (const purpose of ["funnel_verification", "site_consistency_audit"] as const) {
      expect(
        selectTier({ purpose, complexity: "high", available: ["sol", "terra", "luna"] }).tier,
      ).toBe("terra");
    }
  });

  it("puts all three on the build review panel", () => {
    const full = panelFor("full").map((r) => r.purpose);
    expect(full).toContain("funnel_verification");
    expect(full).toContain("site_consistency_audit");
    expect(full).toContain("industry_gap_analysis");
    const light = panelFor("light").map((r) => r.purpose);
    expect(light).toContain("funnel_verification");
    expect(light).toContain("site_consistency_audit");
  });
});
