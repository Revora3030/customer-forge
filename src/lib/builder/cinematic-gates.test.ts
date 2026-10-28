import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditPageDesign, auditSectionDesign, hasInteractive, needsDesignRepair } from "./design-quality";
import { MEASURE_SCRIPT, gradeViewport, type ViewportMeasurement } from "./visual";
import { repairBriefFrom } from "@/components/app/visual-check-utils";
import type { CompositionNode, CompositionTree } from "./composition-tree";

const ref = "11111111-1111-4111-8111-111111111111";
const t = (root: CompositionNode): CompositionTree => ({ version: 1, root });
const textHero = t({
  type: "stack",
  style: { paddingY: 96 },
  children: [
    { type: "heading", level: 1, text: "Detailing on the harbour", style: { size: 56 } },
    { type: "button", text: "Book", href: "/book" },
  ],
});
const sceneHero = (extra: Partial<CompositionNode> = {}, slot: CompositionNode[] = []): CompositionTree =>
  t({
    type: "scene",
    children: [
      { type: "media", mediaRef: ref, alt: "Coupe at sunset" },
      { type: "heading", level: 1, text: "Sunset, in red.", style: { size: 64 } },
      { type: "button", text: "Reserve", href: "/book" },
      ...slot,
    ],
    ...extra,
  });
const plain = (text: string): CompositionTree =>
  t({ type: "stack", style: { paddingY: 80 }, children: [{ type: "heading", level: 2, text }, { type: "text", text: "Supplied words about this part of the business." }] });

describe("gate: the opening is a real scene or media hero", () => {
  it("sends a text-only opening back when the section has its own pictures", () => {
    const findings = auditSectionDesign(textHero, { lead: true, mediaAvailable: 1 });
    const finding = findings.find((f) => f.code === "lead_not_scene");
    expect(finding?.severity).toBe("critical");
    expect(needsDesignRepair(findings)).toBe(true);
  });

  it("accepts a scene opening or a full-bleed media hero", () => {
    expect(auditSectionDesign(sceneHero(), { lead: true, mediaAvailable: 1 }).some((f) => f.code === "lead_not_scene")).toBe(false);
    const mediaHero = t({ type: "stack", children: [{ type: "media", mediaRef: ref, alt: "Coupe" }, ...(textHero.root.children ?? [])] });
    expect(auditSectionDesign(mediaHero, { lead: true, mediaAvailable: 1 }).some((f) => f.code === "lead_not_scene")).toBe(false);
  });

  it("does not count a picture tucked inside a card as a hero", () => {
    const tucked = t({ type: "stack", children: [...(textHero.root.children ?? []), { type: "card", children: [{ type: "media", mediaRef: ref, alt: "Coupe" }] }] });
    expect(auditSectionDesign(tucked, { lead: true, mediaAvailable: 1 }).some((f) => f.code === "lead_not_scene")).toBe(true);
  });

  it("asks nothing the AI cannot do: no supplied picture, or unknown availability", () => {
    expect(auditSectionDesign(textHero, { lead: true, mediaAvailable: 0 }).some((f) => f.code === "lead_not_scene")).toBe(false);
    expect(auditSectionDesign(textHero, { lead: true }).some((f) => f.code === "lead_not_scene")).toBe(false);
  });
});

describe("gate: scene text passes contrast over the computed scrim", () => {
  it("flags ink that can never be read on its own scrim colour (critical)", () => {
    const findings = auditSectionDesign(sceneHero({ style: { color: "#ffffff" }, scrim: { color: "#ffffff", opacity: 40 } }), { lead: true, mediaAvailable: 1 });
    const finding = findings.find((f) => f.code === "scene_text_contrast");
    expect(finding?.severity).toBe("critical");
    expect(needsDesignRepair(findings)).toBe(true);
  });

  it("flags a slot colour that fails over the computed scrim", () => {
    const findings = auditSectionDesign(sceneHero({}, [{ type: "text", text: "Muted line", style: { color: "#3a3a3a" } }]), { lead: false });
    expect(findings.find((f) => f.code === "scene_text_contrast")?.path).toBe("root.children[3]");
  });

  it("passes a readable scene", () => {
    expect(auditSectionDesign(sceneHero({ style: { color: "#fff8ef" }, scrim: { color: "#120c08", opacity: 35 } }), { lead: true, mediaAvailable: 1 }).some((f) => f.code === "scene_text_contrast")).toBe(false);
  });
});

describe("gate: at least one interactive primitive per site (on the home page)", () => {
  const page = (second: CompositionTree) => [
    { id: "hero", role: "hero", tree: sceneHero(), mediaAvailable: 1 },
    { id: "services", role: "services", tree: second, mediaAvailable: 0 },
  ];

  it("sends the home page back when it has no interactive centrepiece", () => {
    const audit = auditPageDesign(page(plain("Services")), { home: true });
    const finding = audit["services"]?.find((f) => f.code === "page_missing_interactive");
    expect(finding).toBeDefined();
    expect(needsDesignRepair(audit["services"]!)).toBe(true);
  });

  it("is satisfied by any interactive primitive, and not asked of other pages", () => {
    const row = t({ type: "collection_row", text: "Collection", children: [{ type: "offer_card", text: "Detail", children: [{ type: "button", text: "Book", href: "/book" }] }] });
    expect(hasInteractive(row)).toBe(true);
    expect(auditPageDesign(page(row), { home: true })["services"]?.some((f) => f.code === "page_missing_interactive") ?? false).toBe(false);
    expect(auditPageDesign(page(plain("Services")))["services"]?.some((f) => f.code === "page_missing_interactive") ?? false).toBe(false);
  });

  it("feeds the existing first-build repair round with the home flag and picture counts", () => {
    const source = readFileSync(resolve(__dirname, "first-build-compositions.server.ts"), "utf8");
    expect(source).toMatch(/repairDesignQuality\(\{[^}]*home: isHome/);
    expect(source).toMatch(/needsDesignRepair\(audit\[s\.id\]!\)/);
    expect(source).toMatch(/mediaAvailable: available\(s\)/);
  });
});

describe("gate: offer cards and sticky bars never cover a control at 390px (browser QA)", () => {
  const measured = (width: number, overlayConflicts?: string[]): ViewportMeasurement => ({
    width, scrollWidth: width, overflowing: [], brokenImages: [], clipped: [], smallTargets: [], tinyText: [], unreachable: [],
    navigable: true, ctas: 1, ...(overlayConflicts ? { overlayConflicts } : {}),
  });

  it("grades a conflict P0 on phones and as advice on wide screens", () => {
    expect(gradeViewport(measured(390, ["offer: article.rv-offer covers input#email"])).find((f) => f.key === "overlay_covers_control")?.severity).toBe("p0");
    expect(gradeViewport(measured(1280, ["offer: article.rv-offer covers a.rv-cn-interactive"])).find((f) => f.key === "overlay_covers_control")?.severity).toBe("advice");
    expect(gradeViewport(measured(390, [])).some((f) => f.key === "overlay_covers_control")).toBe(false);
  });

  it("is measured in the real page script for offer cards, sticky bars and fixed bottom bars", () => {
    expect(MEASURE_SCRIPT).toContain("[data-rv-overlay]");
    expect(MEASURE_SCRIPT).toContain("overlayConflicts,");
    expect(MEASURE_SCRIPT).toContain("...fixedBars");
  });

  it("reaches the existing AI repair brief like every other measured finding", () => {
    const findings = gradeViewport(measured(390, ["sticky: div.rv-cn-mobile-sticky-bar covers button.submit"]));
    const brief = repairBriefFrom({ score: 80, passed: false, findings, widths: [390] });
    expect(brief).toContain("sticky: div.rv-cn-mobile-sticky-bar covers button.submit");
  });
});

describe("gate: a home page is not mostly plain stacks and cards", () => {
  const sections = (trees: CompositionTree[]) =>
    trees.map((tree, i) => ({ id: `s${i}`, role: i === 0 ? "hero" : "body", tree, mediaAvailable: i === 0 ? 1 : 0 }));
  const row = t({ type: "collection_row", text: "Collection", children: [{ type: "offer_card", text: "Detail", children: [{ type: "button", text: "Book", href: "/book" }] }] });

  it("sends back a four-section home page whose later sections are all plain", () => {
    const audit = auditPageDesign(sections([sceneHero(), plain("A"), plain("B"), plain("C")]), { home: true });
    const finding = audit["s1"]?.find((f) => f.code === "page_mostly_plain");
    expect(finding).toBeDefined();
    expect(needsDesignRepair(audit["s1"]!)).toBe(true);
  });

  it("passes when most later sections carry a picture, scene or interaction", () => {
    const audit = auditPageDesign(sections([sceneHero(), row, sceneHero(), plain("C")]), { home: true });
    expect(Object.values(audit).flat().some((f) => f.code === "page_mostly_plain")).toBe(false);
  });

  it("asks nothing on other pages, short pages, or when no pictures exist", () => {
    const trees = [sceneHero(), plain("A"), plain("B"), plain("C")];
    expect(Object.values(auditPageDesign(sections(trees))).flat().some((f) => f.code === "page_mostly_plain")).toBe(false);
    expect(Object.values(auditPageDesign(sections(trees.slice(0, 3)), { home: true })).flat().some((f) => f.code === "page_mostly_plain")).toBe(false);
    const noPictures = trees.map((tree, i) => ({ id: `s${i}`, role: "body", tree, mediaAvailable: 0 }));
    expect(Object.values(auditPageDesign(noPictures, { home: true })).flat().some((f) => f.code === "page_mostly_plain")).toBe(false);
  });
});
