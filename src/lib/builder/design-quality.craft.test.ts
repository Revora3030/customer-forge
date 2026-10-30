import { describe, expect, it } from "vitest";
import type { CompositionNode, CompositionTree } from "./composition-tree";
import { auditPageCraft, auditPageDesign, hasCentrepiece, needsDesignRepair, wordOverlap } from "./design-quality";

const tree = (root: CompositionNode): CompositionTree => ({ version: 1, root });
const h = (text: string, level: 1 | 2 | 3 = 2): CompositionNode => ({ type: "heading", level, text });
const t = (text: string): CompositionNode => ({ type: "text", text });
const img = (mediaRef: string): CompositionNode => ({ type: "media", mediaRef, alt: "work" });
const codes = (found: { finding: { code: string } }[]) => found.map((f) => f.finding.code);

describe("page craft gates (2026-10-30 Oak City audit)", () => {
  it("flags service cards that carry a title but no words", () => {
    const cards: CompositionNode = {
      type: "grid",
      style: { columns: 3 },
      children: ["Drain cleaning", "Water heaters", "Leak repair"].map((name, i) => ({ type: "card", children: [img(`m${i}`), h(name, 3)] })),
    };
    const out = auditPageCraft([{ id: "svc", role: "services", tree: tree({ type: "stack", children: [h("What we handle"), cards] }) }]);
    expect(codes(out)).toContain("card_missing_body");
  });

  it("passes cards that each carry a supporting line", () => {
    const cards: CompositionNode = {
      type: "grid",
      children: ["Drain cleaning", "Water heaters"].map((name) => ({ type: "card", children: [h(name, 3), t("Cleared and camera-checked the same visit.")] })),
    };
    expect(codes(auditPageCraft([{ id: "svc", role: "services", tree: tree(cards) }]))).not.toContain("card_missing_body");
  });

  it("does not treat a heading column beside a text column as bare cards", () => {
    const split: CompositionNode = { type: "grid", children: [{ type: "stack", children: [h("Our story")] }, { type: "stack", children: [t("Started on one van and still answer the phone ourselves.")] }] };
    expect(codes(auditPageCraft([{ id: "a", role: "about", tree: tree(split) }]))).not.toContain("card_missing_body");
  });

  it("flags a button whose label is a section heading, and a section that is only a button", () => {
    const sections = [
      { id: "svc", role: "services", tree: tree({ type: "stack", children: [h("What we handle"), t("Drains, water heaters and leaks around town.")] }) },
      { id: "cta", role: "cta", tree: tree({ type: "row", children: [img("pipe"), { type: "button", text: "What we handle", href: "/services" }] }) },
    ];
    const found = codes(auditPageCraft(sections));
    expect(found).toContain("action_label_is_heading");
    expect(found).toContain("orphan_action");
    const orphan = auditPageCraft(sections).find((f) => f.finding.code === "orphan_action")!;
    expect(needsDesignRepair([orphan.finding])).toBe(true);
  });

  it("flags one picture reused across sections but not within one section", () => {
    const found = auditPageCraft([
      { id: "hero", role: "hero", tree: tree({ type: "stack", children: [img("pipes"), h("Plumbing", 1)] }) },
      { id: "about", role: "about", tree: tree({ type: "stack", children: [img("pipes"), img("pipes"), h("About")] }) },
    ]);
    expect(found.filter((f) => f.finding.code === "duplicate_media")).toHaveLength(1);
    expect(found[0]!.sectionId).toBe("about");
  });

  it("flags the same message paraphrased in a later section", () => {
    expect(wordOverlap("Oak City Plumbing focuses on three core services in Raleigh", "Oak City Plumbing focuses on three core services for Raleigh homes")).toBeGreaterThanOrEqual(0.75);
    const found = auditPageCraft([
      { id: "a", role: "hero", tree: tree(t("Oak City Plumbing focuses on three core services: drain cleaning, water heaters and leak repair in Raleigh.")) },
      { id: "b", role: "about", tree: tree(t("Oak City Plumbing focuses on three core services — drain cleaning, water heaters, leak repair — around Raleigh.")) },
      { id: "c", role: "faq", tree: tree(t("We text a photo of the problem and the fix before any work starts at your home.")) },
    ]);
    expect(found.filter((f) => f.finding.code === "near_duplicate_text").map((f) => f.sectionId)).toEqual(["b"]);
  });

  it("flags a home page where every section sits on one background", () => {
    const plain = (id: string) => ({ id, role: "content", tree: tree({ type: "stack", style: { background: "#101010" }, children: [h(`Heading ${id}`), t(`Body copy for section ${id} with enough words.`)] }) });
    const flat = auditPageCraft([plain("1"), plain("2"), plain("3"), plain("4")], { home: true });
    expect(codes(flat)).toContain("flat_section_rhythm");
    const varied = [plain("1"), plain("2"), { ...plain("3"), tree: tree({ type: "stack", style: { background: "#f4efe6" }, children: [h("Light band")] }) }, plain("4")];
    expect(codes(auditPageCraft(varied, { home: true }))).not.toContain("flat_section_rhythm");
  });
});

describe("interactive centrepiece", () => {
  it("does not let a FAQ accordion or tabs stand in for the centrepiece", () => {
    const faq = tree({ type: "faq_accordion", faqItems: [{ question: "Do you do weekends?", answer: "Yes." }] } as CompositionNode);
    expect(hasCentrepiece(faq)).toBe(false);
    const audit = auditPageDesign([{ id: "hero", role: "hero", tree: tree(h("Plumbing", 1)) }, { id: "faq", role: "faq", tree: faq }], { home: true });
    expect(audit["faq"]?.some((f) => f.code === "page_missing_interactive")).toBe(true);
  });

  it("accepts a real estimator widget or a dial", () => {
    expect(hasCentrepiece(tree({ type: "widget", text: "service_estimator" }))).toBe(true);
    expect(hasCentrepiece(tree({ type: "widget", text: "enquiry_form" }))).toBe(false);
    expect(hasCentrepiece(tree({ type: "dial_selector", text: "Pick a pipe" } as CompositionNode))).toBe(true);
  });
});
