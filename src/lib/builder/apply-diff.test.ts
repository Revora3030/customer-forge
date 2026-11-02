import { describe, expect, it } from "vitest";
import { diffApplied, diffJson, diffLook, diffToText, groupRows } from "./apply-diff";
import type { FullComponent, FullPage, FullSection, FullSnapshot } from "@/lib/site-restore";

const comp = (over: Partial<FullComponent> = {}): FullComponent => ({
  id: "c1", section_id: "s1", kind: "button", label: "Call", body: null, link_label: null,
  link_url: "tel:1", media_url: null, settings: {}, sort_order: 0, is_visible: true, ...over,
});
const sec = (over: Partial<FullSection> = {}): FullSection => ({
  id: "s1", page_id: "p1", kind: "hero", variant: "a", heading: "Old headline", subheading: null,
  body: null, settings: { style: { color: "#111" } }, sort_order: 0, is_visible: true, components: [comp()], ...over,
});
const page = (over: Partial<FullPage> = {}): FullPage => ({
  id: "p1", slug: "home", title: "Home", kind: "home", seo_title: "T", seo_description: null,
  seo_canonical: null, og_title: null, og_description: null, og_image_url: null, noindex: false,
  sort_order: 0, is_visible: true, sections: [sec()], ...over,
});
const snap = (...pages: FullPage[]): FullSnapshot => ({ format: 1, takenAt: "", pages });

describe("diffApplied", () => {
  it("is empty when nothing differs", () => {
    expect(diffApplied(snap(page()), snap(page()))).toEqual([]);
  });

  it("returns nothing without both sides (never invents a diff)", () => {
    expect(diffApplied(null, snap(page()))).toEqual([]);
    expect(diffApplied(snap(page()), null)).toEqual([]);
  });

  it("reports a changed headline, a JSON setting and a button label", () => {
    const after = snap(
      page({
        seo_title: "New T",
        sections: [
          sec({
            heading: "New headline",
            settings: { style: { color: "#222" } },
            components: [comp({ label: "Call now" })],
          }),
        ],
      }),
    );
    const rows = diffApplied(snap(page()), after);
    const find = (field: string) => rows.find((r) => r.field === field);
    expect(find("heading")).toMatchObject({ before: "Old headline", after: "New headline", change: "changed", format: "text" });
    expect(find("settings.style.color")).toMatchObject({ before: "#111", after: "#222", format: "json" });
    expect(find("label")).toMatchObject({ before: "Call", after: "Call now" });
    expect(find("search title")).toMatchObject({ before: "T", after: "New T" });
    expect(rows).toHaveLength(4);
  });

  it("reports added and removed sections and pages", () => {
    const rows = diffApplied(
      snap(page(), page({ id: "p2", slug: "gone", title: "Gone", sections: [] })),
      snap(page({ sections: [sec(), sec({ id: "s2", heading: "FAQ", kind: "faq", components: [] })] })),
    );
    expect(rows.map((r) => `${r.change}:${r.field}`).sort()).toEqual(["added:section", "removed:page"]);
  });
});

describe("diffJson / diffLook", () => {
  it("flattens leaves and marks added/removed/changed", () => {
    const rows = diffJson("x", { a: 1, b: { c: "x" } }, { a: 2, b: {}, d: [1] });
    expect(rows.map((r) => `${r.change}:${r.field}`).sort()).toEqual(
      ["added:b", "added:d[0]", "changed:a", "removed:b.c"].sort(),
    );
  });

  it("shows custom CSS verbatim", () => {
    const rows = diffLook({ customCss: "a{color:red}" }, { customCss: "a{color:blue}" });
    expect(rows).toEqual([
      { where: "Site look", field: "customCss", before: "a{color:red}", after: "a{color:blue}", change: "changed", format: "json" },
    ]);
  });
});

describe("copy text", () => {
  it("writes - before / + after under each location", () => {
    const rows = diffApplied(snap(page()), snap(page({ sections: [sec({ heading: "New" })] })));
    const text = diffToText(rows);
    expect(text).toContain("  heading (changed)");
    expect(text).toContain("  - Old headline");
    expect(text).toContain("  + New");
    expect(groupRows(rows)).toHaveLength(1);
  });
});
