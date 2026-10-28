import { describe, expect, it } from "vitest";
import { pageOfSection, sectionOfTarget, stepTargetOf } from "./step-target";

const S = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";

describe("stepTargetOf", () => {
  it("points section-bound actions at their section", () => {
    for (const type of ["set_section_text", "set_section_visibility", "set_custom_block", "set_composition", "add_component", "reorder_components"])
      expect(stepTargetOf({ type, sectionId: S }), type).toEqual({ sectionId: S });
  });

  it("points component actions at their component, and block styles at whichever they style", () => {
    expect(stepTargetOf({ type: "set_component", componentId: C })).toEqual({ componentId: C });
    expect(stepTargetOf({ type: "generate_component_image", componentId: C })).toEqual({ componentId: C });
    expect(stepTargetOf({ type: "set_block_style", target: "section", targetId: S })).toEqual({ sectionId: S });
    expect(stepTargetOf({ type: "set_block_style", target: "component", targetId: C })).toEqual({ componentId: C });
  });

  it("has no target for a section or page the plan is still creating, or for site-wide changes", () => {
    expect(stepTargetOf({ type: "set_composition", sectionId: "temp_section_1" })).toBeNull();
    expect(stepTargetOf({ type: "add_section", pageId: S })).toBeNull();
    expect(stepTargetOf({ type: "set_theme", patch: {} })).toBeNull();
    expect(stepTargetOf(null)).toBeNull();
    expect(stepTargetOf("nope")).toBeNull();
  });
});

describe("sectionOfTarget", () => {
  const pages = [{ sections: [{ id: S, components: [{ id: C }] }, { id: "other", components: [] }] }];
  it("resolves a component to its section and passes a section through", () => {
    expect(sectionOfTarget({ componentId: C }, pages)).toBe(S);
    expect(sectionOfTarget({ sectionId: "x" }, pages)).toBe("x");
    expect(sectionOfTarget({ componentId: "unknown" }, pages)).toBeNull();
    expect(sectionOfTarget(null, pages)).toBeNull();
  });
});

describe("pageOfSection", () => {
  it("finds the page a section is on", () => {
    const pages = [{ id: "home", sections: [{ id: "a" }] }, { id: "services", sections: [{ id: "b" }, { id: "c" }] }];
    expect(pageOfSection(pages, "c")).toBe("services");
    expect(pageOfSection(pages, "zzz")).toBeNull();
  });
});
