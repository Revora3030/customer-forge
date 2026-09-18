import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import {
  compileResponsiveRepairs,
  findResponsiveFindings,
  responsiveSummary,
} from "./responsive-intelligence";

const context = {
  pages: [
    {
      id: "home",
      slug: "home",
      title: "Home",
      kind: "home",
      is_visible: true,
      noindex: false,
      seo_title: "Home",
      seo_description: "Home",
      sections: [
        {
          id: "hero",
          kind: "hero",
          heading: "A very long headline",
          subheading: "Supporting copy",
          body: "x".repeat(800),
          is_visible: true,
          sort_order: 0,
          components: [{ id: "b1", kind: "button", label: "Book", link_url: "/book" }],
        },
        {
          id: "services",
          kind: "services",
          heading: "Services",
          subheading: null,
          body: null,
          is_visible: true,
          sort_order: 1,
          components: Array.from({ length: 9 }, (_, index) => ({
            id: `s${index}`,
            kind: "card",
            label: `Service ${index}`,
            link_url: null,
          })),
        },
      ],
    },
  ],
  business: {} as AgentContext["business"],
  sectionKinds: ["hero", "services"],
} as AgentContext;

describe("responsive intelligence", () => {
  it("finds bounded mobile findings and prioritizes the hero", () => {
    const findings = findResponsiveFindings(context, "make the site mobile responsive");
    expect(findings.length).toBe(2);
    expect(findings[0]?.sectionId).toBe("hero");
    expect(findings[0]?.reasons).toContain("first-screen section");
  });

  it("compiles renderer-safe stacked visual repairs", () => {
    const actions = compileResponsiveRepairs(context, "fix mobile layout", 2);
    expect(actions).toHaveLength(2);
    expect(actions.every((action) => action.type === "set_section_visual")).toBe(true);
    expect(actions[0]?.type === "set_section_visual" && actions[0].patch.layout).toBe("stacked");
  });

  it("is a no-op for unrelated requests", () => {
    expect(findResponsiveFindings(context, "write better copy")).toEqual([]);
    expect(responsiveSummary([])).toContain("no supported mobile refinements");
  });
});
