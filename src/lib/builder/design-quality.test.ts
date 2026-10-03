import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditPageDesign,
  auditSectionDesign,
  needsDesignRepair,
} from "@/lib/builder/design-quality";
import type { CompositionTree } from "@/lib/builder/composition-tree";

const tree = (root: CompositionTree["root"]): CompositionTree => ({ version: 1, root });

const strongHero = tree({
  type: "stack",
  style: { paddingY: 96 },
  children: [
    {
      type: "heading",
      level: 1,
      text: "Mobile detailing in Austin",
      style: { size: 56 },
      responsive: { mobile: { size: 34 } },
    },
    {
      type: "text",
      text: "Interior and exterior detailing at your driveway.",
      style: { size: 18, lineHeight: 1.6, maxWidth: 680 },
    },
    { type: "button", text: "Book a detail", href: "/book" },
  ],
});

describe("design quality bar", () => {
  it("passes a well-crafted opening section", () => {
    expect(auditSectionDesign(strongHero, { lead: true })).toEqual([]);
  });

  it("flags an opening section with no headline and no action as critical", () => {
    const weak = tree({
      type: "stack",
      children: [{ type: "text", text: "Welcome to our website, we do great work." }],
    });
    const findings = auditSectionDesign(weak, { lead: true });
    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["lead_missing_h1", "lead_missing_action"]),
    );
    expect(needsDesignRepair(findings)).toBe(true);
  });

  it("flags a small hero headline, tiny body text and cramped line-height", () => {
    const t = tree({
      type: "stack",
      children: [
        { type: "heading", level: 1, text: "Hi", style: { size: 24 } },
        {
          type: "text",
          text: "x".repeat(200),
          style: { size: 12, lineHeight: 1.1, maxWidth: 700 },
        },
        { type: "button", text: "Go", href: "/contact" },
      ],
    });
    const codes = auditSectionDesign(t, { lead: true }).map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "lead_heading_too_small",
        "body_text_too_small",
        "tight_line_height",
      ]),
    );
  });

  it("requires a phone layout for 3+ column grids and caps copy-heavy columns", () => {
    const t = tree({
      type: "grid",
      style: { columns: 6 },
      children: Array.from({ length: 6 }, () => ({
        type: "text" as const,
        text: "y".repeat(200),
        style: { maxWidth: 400 },
      })),
    });
    const codes = auditSectionDesign(t, { lead: false }).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["grid_missing_mobile", "too_many_columns"]));
  });

  it("flags inverted heading hierarchy, long lines and walls of text", () => {
    const t = tree({
      type: "stack",
      children: [
        { type: "heading", level: 2, text: "A", style: { size: 28 } },
        { type: "heading", level: 3, text: "B", style: { size: 32 } },
        { type: "text", text: "z".repeat(950) },
      ],
    });
    const codes = auditSectionDesign(t, { lead: false }).map((f) => f.code);
    expect(codes).toEqual(
      expect.arrayContaining(["heading_scale_flat", "long_line_length", "wall_of_text"]),
    );
  });

  it("never flags working widget sections as thin", () => {
    const t = tree({ type: "stack", children: [{ type: "widget", text: "booking_form" }] });
    expect(auditSectionDesign(t, { lead: false })).toEqual([]);
  });

  it("flags back-to-back sections with identical structure", () => {
    const card = (): CompositionTree =>
      tree({
        type: "grid",
        style: { columns: 3 },
        responsive: { mobile: { columns: 1 } },
        children: [
          { type: "heading", level: 2, text: "One", style: { size: 32 } },
          { type: "text", text: "Two", style: { size: 17 } },
          { type: "text", text: "Three", style: { size: 17 } },
        ],
      });
    const audit = auditPageDesign([
      { id: "a", role: "services", tree: card() },
      { id: "b", role: "process", tree: card() },
    ]);
    expect(audit["b"]?.some((f) => /repeats the exact structure/.test(f.fix))).toBe(true);
  });
});

describe("the bar is enforced in the build and in chat edits", () => {
  const first = readFileSync("src/lib/builder/first-build-compositions.server.ts", "utf8");
  const plan = readFileSync("src/lib/builder/ai-agent-plan.server.ts", "utf8");
  it("sends first-build sections that miss the bar back to Sol before saving", () => {
    expect(first).toMatch(/await repairDesignQuality\(/);
    expect(first.indexOf("await repairDesignQuality(")).toBeLessThan(
      first.indexOf("await saveTree("),
    );
    expect(first).toMatch(/Measurable craft bar, checked automatically/);
  });
  it("never lets the team round make craft worse", () => {
    expect(first).toMatch(/if \(worse && designed\.has\(section\.id\)\) best\.set/);
  });
  it("polishes chat-edit layouts that miss the bar, only accepting better validated trees", () => {
    expect(plan).toMatch(/polishing the design/);
    expect(plan).toMatch(
      /auditSectionDesign\(checked\.tree, \{ lead: firstSection \}\)\.length < entry\.findings\.length/,
    );
  });
});

describe("stock AI phrasing", () => {
  it("is flagged in layout text so Sol rewrites it", () => {
    const t = tree({
      type: "stack",
      style: { paddingY: 96 },
      children: [
        { type: "heading", level: 2, text: "Elevate your driveway", style: { size: 40 } },
        {
          type: "text",
          text: "Our dedicated team of professionals delivers top-notch care.",
          style: { size: 17 },
        },
      ],
    });
    const finding = auditSectionDesign(t, { lead: false }).find((f) => f.code === "stock_phrasing");
    expect(finding?.fix).toMatch(/elevate your/);
    expect(finding?.fix).toMatch(/top-notch/);
  });
});
