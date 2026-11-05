import { describe, expect, it } from "vitest";
import { fallbackSectionComposition } from "@/lib/builder/fallback-sections";
import { auditSectionDesign } from "@/lib/builder/design-quality";

const section = { id: "00000000-0000-4000-8000-000000000001", kind: "values", heading: "Our Values", components: [] };

describe("fallback section with only a heading", () => {
  it("adds the real ways to reach the business instead of shipping a bare heading", () => {
    const tree = fallbackSectionComposition(section, { facts: { businessName: "Test Co", phone: "8135550123" }, enquiryHref: "/contact" });
    expect(auditSectionDesign(tree, { lead: false, role: "values" }).map((f) => f.code)).not.toContain("section_too_thin");
    expect(JSON.stringify(tree.root)).toContain("tel:8135550123");
  });

  it("uses only the owner's facts (no invented copy)", () => {
    const tree = fallbackSectionComposition(section, { facts: { businessName: "Test Co", city: "Tampa", region: "FL" }, enquiryHref: "/contact" });
    const text = JSON.stringify(tree.root);
    expect(text).toContain("Tampa");
    expect(text).toContain("/contact");
    expect(auditSectionDesign(tree, { lead: false, role: "values" }).map((f) => f.code)).not.toContain("section_too_thin");
  });
});

describe("a run of heading-only fallback sections", () => {
  it("does not repeat the section above's structure", async () => {
    const { auditPageDesign } = await import("@/lib/builder/design-quality");
    const options = { facts: { businessName: "Test Co" }, enquiryHref: "/contact" };
    const story = fallbackSectionComposition({ id: "00000000-0000-4000-8000-000000000002", kind: "story", heading: "About Test Co", components: [] }, { ...options, lead: true });
    const values = fallbackSectionComposition(section, options);
    const audit = auditPageDesign([
      { id: "story", role: "story", tree: story },
      { id: "values", role: "values", tree: values },
    ]);
    expect((audit["values"] ?? []).map((f) => f.code)).not.toContain("section_too_thin");
  });
});
