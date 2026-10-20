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
      id: "11111111-1111-4111-8111-111111111111",
      sections: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", components: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }] },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", components: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }] },
      ],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      sections: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", components: [] }],
    },
  ],
};

describe("selectionScopeFromInstruction", () => {
  it("reads the pointed-at block id from a selection prefix", () => {
    const instruction = 'On the "Hero" block (id sec-hero): make the photo warmer';
    expect(selectionScopeFromInstruction(instruction, context)).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
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
      { scope: { breadth: "section", sectionIds: ["AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"], pageIds: [] } },
      context,
    );
    expect(scope).toEqual({ breadth: "section", sectionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], pageIds: [] });
  });

  it("returns null for a narrow scope whose ids do not exist", () => {
    expect(
      declaredScopeFromProposal({ scope: { breadth: "style", sectionIds: ["ffffffff-ffff-4fff-8fff-ffffffffffff"], pageIds: [] } }, context),
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
      { type: "set_block_style", target: "section", targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", device: "mobile", patch: { bgColor: "#112233" } },
      { type: "set_composition", sectionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", tree: { version: 1 } },
      { type: "set_section_text", sectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", field: "heading", value: "New heading" },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });
    expect(result.actions).toHaveLength(2);
    expect(result.actions.map((a) => (a as Record<string, unknown>)["type"])).toEqual([
      "set_block_style",
      "set_section_text",
    ]);
    expect(result.notes[0]).toMatch(/outside the requested block or page/);
  });

  it("resolves component targets back to their section", () => {
    const actions = [
      { type: "set_component", componentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", patch: { alt: "Shop front" } },
      { type: "delete_component", componentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });
    expect(result.actions).toHaveLength(1);
    expect((result.actions[0] as Record<string, unknown>)["type"]).toBe("set_component");
  });

  it("drops org-wide and new-page actions from a scoped edit", () => {
    const actions = [
      { type: "set_theme", patch: { primary_color: "#000000" } },
      { type: "add_page", ref: "temp_page_1", kind: "standard", title: "Blog", slug: "blog" },
      { type: "set_block_style", target: "section", targetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", device: "desktop", patch: { gap: "24" } },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });
    expect(result.actions).toHaveLength(1);
  });

  it("keeps temp refs and unknown ids — they cannot be proven out of scope", () => {
    const actions = [
      { type: "add_component", sectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ref: "temp_component_1", kind: "button" },
      { type: "set_block_style", target: "component", targetId: "temp_component_1", device: "mobile", patch: { radius: "8" } },
      { type: "set_component", componentId: "comp-unknown", patch: { label: "x" } },
    ];
    const result = applyEditScope(actions, context, { sectionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });
    expect(result.actions).toHaveLength(3);
    expect(result.notes).toHaveLength(0);
  });

  it("a page scope allows that page's sections but not other pages", () => {
    const actions = [
      { type: "set_section_text", sectionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", field: "heading", value: "Our story" },
      { type: "set_section_text", sectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", field: "heading", value: "Home" },
      { type: "set_page", pageId: "22222222-2222-4222-8222-222222222222", patch: { title: "About us" } },
    ];
    const result = applyEditScope(actions, context, { pageIds: ["22222222-2222-4222-8222-222222222222"] });
    expect(result.actions).toHaveLength(2);
  });

  it("fails open when enforcement would remove the entire plan", () => {
    const actions = [{ type: "set_theme", patch: { primary_color: "#000000" } }];
    const result = applyEditScope(actions, context, { sectionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] });
    expect(result.actions).toHaveLength(1);
    expect(result.notes[0]).toMatch(/scope check was skipped/);
  });
});
