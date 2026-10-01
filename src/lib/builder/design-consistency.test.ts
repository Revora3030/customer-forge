import { describe, it, expect } from "vitest";
import {
  runDesignConsistencyAudit,
  designConsistencySummary,
  type SectionDesignData,
  type DesignTokenSnapshot,
} from "./design-consistency";

const TOKENS: DesignTokenSnapshot = {
  primaryColor: "#1A1A1A",
  secondaryColor: "#FFD700",
  accentColor: "#00A0E9",
  headingFont: "Inter",
  bodyFont: "Inter",
};

const makeSection = (overrides: Partial<SectionDesignData> = {}): SectionDesignData => ({
  pageSlug: "home",
  sectionId: "sec-1",
  sectionKind: "hero",
  heading: "Welcome",
  headingLevel: 1,
  textColor: "#1A1A1A",
  bgColor: "#FFFFFF",
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: 700,
  padding: { top: 64, right: 48, bottom: 64, left: 48 },
  gap: 24,
  hasCta: true,
  ctaLabel: "Get Started",
  componentCount: 3,
  textLength: 200,
  isVisible: true,
  ...overrides,
});

describe("runDesignConsistencyAudit", () => {
  it("returns a perfect score when there are no issues", () => {
    const sections = [
      makeSection({ sectionId: "s1", headingLevel: 1 }),
      makeSection({ sectionId: "s2", headingLevel: 2 }),
      makeSection({ sectionId: "s3", headingLevel: 2, hasCta: true }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(report.findings.length).toBe(0);
    expect(report.overallScore).toBe(100);
  });

  it("detects palette drift", () => {
    const sections = [
      makeSection({ sectionId: "s1", textColor: "#FF00FF", bgColor: "#00FF00" }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(report.findings.some((f) => f.kind === "palette_drift")).toBe(true);
  });

  it("detects multiple h1 headings on a page", () => {
    const sections = [
      makeSection({ sectionId: "s1", headingLevel: 1 }),
      makeSection({ sectionId: "s2", headingLevel: 1 }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(
      report.findings.some(
        (f) => f.kind === "typography_hierarchy_break" && f.message.includes("h1"),
      ),
    ).toBe(true);
  });

  it("detects skipped heading levels", () => {
    const sections = [
      makeSection({ sectionId: "s1", headingLevel: 1 }),
      makeSection({ sectionId: "s2", headingLevel: 3 }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(
      report.findings.some(
        (f) => f.kind === "typography_hierarchy_break" && f.message.includes("jumps"),
      ),
    ).toBe(true);
  });

  it("detects font inconsistency", () => {
    const sections = [
      makeSection({ sectionId: "s1", fontFamily: "Comic Sans MS" }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(report.findings.some((f) => f.kind === "font_inconsistency")).toBe(true);
  });

  it("detects missing CTAs on pages with multiple sections", () => {
    const sections = [
      makeSection({ sectionId: "s1", hasCta: false, pageSlug: "about" }),
      makeSection({ sectionId: "s2", hasCta: false, pageSlug: "about" }),
      makeSection({ sectionId: "s3", hasCta: false, pageSlug: "about" }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(report.findings.some((f) => f.kind === "cta_prominence")).toBe(true);
    expect(report.ctaVisibility).toBeLessThan(100);
  });

  it("detects buried CTAs", () => {
    const sections = [
      makeSection({ sectionId: "s1", hasCta: false, pageSlug: "p1" }),
      makeSection({ sectionId: "s2", hasCta: false, pageSlug: "p1" }),
      makeSection({ sectionId: "s3", hasCta: false, pageSlug: "p1" }),
      makeSection({ sectionId: "s4", hasCta: false, pageSlug: "p1" }),
      makeSection({ sectionId: "s5", hasCta: true, pageSlug: "p1" }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(
      report.findings.some((f) => f.kind === "cta_prominence" && f.message.includes("buried")),
    ).toBe(true);
  });

  it("detects dense sections", () => {
    const sections = [
      makeSection({ sectionId: "s1", componentCount: 12 }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(report.findings.some((f) => f.kind === "section_density")).toBe(true);
  });

  it("detects sparse sections", () => {
    const sections = [
      makeSection({ sectionId: "s1", componentCount: 0, textLength: 20, heading: "About Us" }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    expect(report.findings.some((f) => f.kind === "visual_balance")).toBe(true);
  });

  it("produces a readable summary", () => {
    const sections = [
      makeSection({ sectionId: "s1", headingLevel: 1 }),
      makeSection({ sectionId: "s2", headingLevel: 1 }),
    ];
    const report = runDesignConsistencyAudit(sections, TOKENS);
    const summary = designConsistencySummary(report);
    expect(summary).toContain("Design consistency:");
    expect(summary).toContain("%");
  });
});
