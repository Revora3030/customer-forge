import { describe, it, expect } from "vitest";
import {
  derivePolishActions,
  runVisualPolish,
  prioritiseImprovements,
  type DesignConsistencyReport,
} from "./visual-polish";

const makeReport = (overrides: Partial<DesignConsistencyReport> = {}): DesignConsistencyReport => ({
  findings: [],
  paletteConsistency: 100,
  typographyConsistency: 100,
  spacingConsistency: 100,
  ctaVisibility: 100,
  overallScore: 100,
  ...overrides,
});

describe("derivePolishActions", () => {
  it("returns no actions for a clean report", () => {
    const actions = derivePolishActions(makeReport(), true);
    expect(actions).toHaveLength(0);
  });

  it("suggests CTA addition when contact page exists", () => {
    const report = makeReport({
      ctaVisibility: 0,
      findings: [
        {
          kind: "cta_prominence",
          severity: "high",
          page: "about",
          section: "sec-1",
          message: "Page has no visible call-to-action — visitors have no next step",
          evidence: "sections: 3, ctas: 0",
        },
      ],
    });
    const actions = derivePolishActions(report, true);
    expect(actions.some((a) => a.scope === "cta")).toBe(true);
  });

  it("does not suggest CTA when no contact page", () => {
    const report = makeReport({
      ctaVisibility: 0,
      findings: [
        {
          kind: "cta_prominence",
          severity: "high",
          page: "about",
          section: "sec-1",
          message: "Page has no visible call-to-action — visitors have no next step",
          evidence: "sections: 3, ctas: 0",
        },
      ],
    });
    const actions = derivePolishActions(report, false);
    expect(actions.some((a) => a.scope === "cta")).toBe(false);
  });

  it("suggests spacing normalisation for inconsistencies", () => {
    const report = makeReport({
      spacingConsistency: 50,
      findings: [
        {
          kind: "spacing_inconsistency",
          severity: "medium",
          page: "home",
          section: "sec-2",
          message: "Section padding (96px) deviates 48px from page median (48px)",
          evidence: "padding.top=96 median=48",
        },
      ],
    });
    const actions = derivePolishActions(report, true);
    expect(actions.some((a) => a.scope === "spacing")).toBe(true);
  });
});

describe("runVisualPolish", () => {
  it("applies safe improvements and reports skipped findings", () => {
    const report = makeReport({
      ctaVisibility: 50,
      findings: [
        {
          kind: "cta_prominence",
          severity: "high",
          page: "about",
          section: "sec-1",
          message: "Page has no visible call-to-action — visitors have no next step",
          evidence: "sections: 3, ctas: 0",
        },
        {
          kind: "palette_drift",
          severity: "medium",
          page: "home",
          section: "sec-2",
          message: "Section uses off-palette colour #FF00FF",
          evidence: "textColor=#FF00FF",
        },
      ],
    });
    const result = runVisualPolish(report, true);
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.skipped.length).toBeGreaterThan(0);
    expect(result.summary).toContain("improvement");
  });

  it("reports zero improvements for a clean report", () => {
    const result = runVisualPolish(makeReport(), true);
    expect(result.improvedCount).toBe(0);
  });
});

describe("prioritiseImprovements", () => {
  it("prioritises missing CTAs as critical", () => {
    const report = makeReport({ ctaVisibility: 50 });
    const polish = runVisualPolish(report, true);
    const items = prioritiseImprovements(report, polish);
    expect(items[0]?.priority).toBe("critical");
    expect(items[0]?.action).toContain("call-to-action");
  });

  it("prioritises typography issues as high", () => {
    const report = makeReport({ typographyConsistency: 80 });
    const polish = runVisualPolish(report, true);
    const items = prioritiseImprovements(report, polish);
    expect(items.some((i) => i.priority === "high" && i.action.includes("Typography"))).toBe(true);
  });
});
