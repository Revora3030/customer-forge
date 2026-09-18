import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { compileVisualComposition, visualCompositionSummary } from "./visual-composition";

const context = {
  pages: [
    { id: "home", kind: "home", title: "Home", slug: "", is_visible: true, noindex: false,
      sections: [
        { id: "hero", kind: "hero", sort_order: 0, heading: "Welcome", subheading: null, body: null, components: [] },
        { id: "services", kind: "services", sort_order: 1, heading: "Services", subheading: null, body: null, components: [] },
        { id: "reviews", kind: "reviews", sort_order: 2, heading: "Reviews", subheading: null, body: null, components: [] },
      ] },
    { id: "about", kind: "about", title: "About", slug: "about", is_visible: true, noindex: false,
      sections: [
        { id: "about-hero", kind: "hero", sort_order: 0, heading: "About", subheading: null, body: null, components: [] },
        { id: "about-services", kind: "services", sort_order: 1, heading: "What We Do", subheading: null, body: null, components: [] },
      ] },
  ],
} as unknown as AgentContext;

describe("visual composition intelligence", () => {
  it("turns premium intent into bounded native visual actions", () => {
    const actions = compileVisualComposition(context, "make the site premium and polished", ["premium"], 2, 8);
    expect(actions).toHaveLength(5);
    const visualActions = actions.filter((action) => action.type === "set_section_visual");
    expect(visualActions).toHaveLength(5);
    expect(new Set(visualActions.map((action) => action.sectionId)).size).toBe(visualActions.length);
    expect(visualCompositionSummary(actions)).toContain("5 existing sections");
  });

  it("does nothing for unrelated requests", () => {
    expect(compileVisualComposition(context, "change my phone number", [], 0)).toEqual([]);
  });

  it("extends coordinated visual composition across pages when consistency is requested", () => {
    const actions = compileVisualComposition(
      context,
      "make every page consistent with the same premium design",
      ["premium"],
      2,
      2,
    );
    const visualActions = actions.filter((action) => action.type === "set_section_visual");
    expect(visualActions).toHaveLength(4);
    expect(new Set(visualActions.map((action) => action.sectionId)).size).toBe(4);
  });

  it("prioritizes hero before supporting sections", () => {
    const actions = compileVisualComposition(context, "redesign the visual layout", ["modern"], 1, 2);
    const visualActions = actions.filter((action) => action.type === "set_section_visual");
    expect(visualActions.map((action) => action.sectionId)).toEqual(["hero", "about-hero"]);
  });
});
