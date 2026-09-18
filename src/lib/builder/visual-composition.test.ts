import type { AgentContext } from "@/lib/site-agent.server";
import { compileVisualComposition, visualCompositionSummary } from "./visual-composition";

const context = {
  pages: [
    {
      id: "home",
      kind: "home",
      title: "Home",
      slug: "",
      is_visible: true,
      noindex: false,
      sections: [
        { id: "hero", kind: "hero", sort_order: 0, heading: "Welcome", subheading: null, body: null, components: [] },
        { id: "services", kind: "services", sort_order: 1, heading: "Services", subheading: null, body: null, components: [] },
        { id: "reviews", kind: "reviews", sort_order: 2, heading: "Reviews", subheading: null, body: null, components: [] },
      ],
    },
  ],
} as unknown as AgentContext;

describe("visual composition intelligence", () => {
  it("turns premium intent into bounded native visual actions", () => {
    const actions = compileVisualComposition(context, "make the site premium and polished", ["premium"], 2, 8);
    expect(actions).toHaveLength(3);
    expect(actions.every((action) => action.type === "set_section_visual")).toBe(true);
    expect(new Set(actions.map((action) => action.type + ":" + action.sectionId)).size).toBe(actions.length);
    expect(visualCompositionSummary(actions)).toContain("3 existing sections");
  });

  it("does nothing for unrelated requests", () => {
    expect(compileVisualComposition(context, "change my phone number", [], 0)).toEqual([]);
  });

  it("prioritizes hero before supporting sections", () => {
    const actions = compileVisualComposition(context, "redesign the visual layout", ["modern"], 1, 2);
    expect(actions.map((action) => action.type === "set_section_visual" ? action.sectionId : "")).toEqual(["hero", "services"]);
  });
});
