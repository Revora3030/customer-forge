import { describe, expect, it } from "vitest";
import {
  applyEditScope,
  declaredScopeFromProposal,
  selectionScopeFromInstruction,
  type EditScopeContext,
} from "./edit-scope";

const context: EditScopeContext = {
  pages: [
    {
      id: "page-home",
      sections: [
        { id: "sec-hero", components: [{ id: "comp-hero-img" }] },
        { id: "sec-services", components: [{ id: "comp-card" }] },
      ],
    },
    {
      id: "page-about",
      sections: [{ id: "sec-story", components: [] }],
    },
  ],
};

describe("selectionScopeFromInstruction", () => {
  it("reads the pointed-at block id from a selection prefix", () => {
    const instruction = 'On the "Hero" block (id sec-hero): make the photo warmer';
    expect(selectionScopeFromInstruction(instruction, context)).toBe("sec-hero");
  });

  it("ignores ids that are not real sections on the live site", () => {
    const instruction = 'On the "Hero" block (id 123e4567-e89b-12d3-a456-426614174000): change it';
    expect(selectionScopeFromInstruction(instruction, context)).toBeNull();
  });

  it("ignores block ids buried deep in the message", () => {
    const instruction = `${"please ".repeat(40)}On the "Hero" block (id sec-hero): change it`;
    expect(selectionScopeFromInstruction(instruction, context)).toBeNull();
  });
});

describe("declaredScopeFromProposal", () => {
  it("accepts a well-formed section scope with real ids", () => {
    const scope = declaredScopeFromProposal(
      { scope: { breadth: "section", sectionIds: ["SEC-HERO"], pageIds: [] } },
      context,
    );
    expect(scope).toEqual({ breadth: "section", sectionIds: ["sec-hero"], pageIds: [] });
  });

  it("returns null for a narrow scope whose ids do not exist", () => {
    expect(
      declaredScopeFromProposal({ scope: { breadth: "style", sectionIds: ["sec-nope"], pageIds: [] } }, context),
    ).toBeNull();
  });

  it("treats a site-wide declaration as a valid, unenforced scope", () => {
    expect(declaredScopeFromProposal({ scope: { breadth: "site" } }, context)).toEqual({
      breadth: "site",
      sectionIds: [],
      pageIds: [],
    });
  });

  it("returns null when scope is missing or malformed", () => {
    expect(declaredScopeFromProposal({ scope: { breadth: "everything" } }, context)).toBeNull();
    expect(declaredScopeFromProposal(null, context)).toBeNull();
    expect(declaredScopeFromProposal({}, context)).toBeNull();
  });
});

describe("applyEditScope", () => {
  it("keeps changes to the scoped section and drops writes to other sections", () => {
    const actions = [
      { type: "set_block_style", target: "section", targetId: "sec-hero", device: "mobile", patch: { bgColor: "#112233" } },
      { type: "set_composition", sectionId: "sec-services", tree: { version: 1 } },
      { type: "set_section_text", sectionId: "sec-hero", field: "heading", value: "New heading" },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["sec-hero"] });
    expect(result.actions).toHaveLength(2);
    expect(result.actions.map((a) => (a as Record<string, unknown>)["type"])).toEqual([
      "set_block_style",
      "set_section_text",
    ]);
    expect(result.notes[0]).toMatch(/outside the requested block or page/);
  });

  it("resolves component targets back to their section", () => {
    const actions = [
      { type: "set_component", componentId: "comp-hero-img", patch: { alt: "Shop front" } },
      { type: "delete_component", componentId: "comp-card" },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["sec-hero"] });
    expect(result.actions).toHaveLength(1);
    expect((result.actions[0] as Record<string, unknown>)["type"]).toBe("set_component");
  });

  it("drops org-wide and new-page actions from a scoped edit", () => {
    const actions = [
      { type: "set_theme", patch: { primary_color: "#000000" } },
      { type: "add_page", ref: "temp_page_1", kind: "standard", title: "Blog", slug: "blog" },
      { type: "set_block_style", target: "section", targetId: "sec-hero", device: "desktop", patch: { gap: "24" } },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["sec-hero"] });
    expect(result.actions).toHaveLength(1);
  });

  it("keeps temp refs and unknown ids — they cannot be proven out of scope", () => {
    const actions = [
      { type: "add_component", sectionId: "sec-hero", ref: "temp_component_1", kind: "button" },
      { type: "set_block_style", target: "component", targetId: "temp_component_1", device: "mobile", patch: { radius: "8" } },
      { type: "set_component", componentId: "comp-unknown", patch: { label: "x" } },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["sec-hero"] });
    expect(result.actions).toHaveLength(3);
    expect(result.notes).toHaveLength(0);
  });

  it("a page scope allows that page's sections but not other pages", () => {
    const actions = [
      { type: "set_section_text", sectionId: "sec-story", field: "heading", value: "Our story" },
      { type: "set_section_text", sectionId: "sec-hero", field: "heading", value: "Home" },
      { type: "set_page", pageId: "page-about", patch: { title: "About us" } },
    ];
    const result = applyEditScope(actions, context, { pageIds: ["page-about"] });
    expect(result.actions).toHaveLength(2);
  });

  it("fails open when enforcement would remove the entire plan", () => {
    const actions = [{ type: "set_theme", patch: { primary_color: "#000000" } }];
    const result = applyEditScope(actions, context, { sectionIds: ["sec-hero"] });
    expect(result.actions).toHaveLength(1);
    expect(result.notes[0]).toMatch(/scope check was skipped/);
  });
});
