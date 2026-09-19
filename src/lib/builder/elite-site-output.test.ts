import { describe, expect, it } from "vitest";
import { compileEliteSiteOutput } from "./elite-site-output";
import type { AgentContext } from "@/lib/site-agent.server";

const context = {
  business: {
    name: "Northstar Roofing",
    industry: "roofing",
    city: "Raleigh",
    services: [{ name: "Roof Replacement" }, { name: "Roof Repair" }],
  },
  pages: [
    {
      id: "page-1",
      slug: "",
      title: "Home",
      kind: "home",
      is_visible: true,
      noindex: false,
      sections: [
        {
          id: "section-1",
          kind: "hero",
          is_visible: true,
          sort_order: 0,
          components: [{ id: "component-1", kind: "image", label: "Roof replacement" }],
        },
        {
          id: "section-2",
          kind: "services",
          is_visible: true,
          sort_order: 1,
          components: [],
        },
        {
          id: "section-3",
          kind: "cta",
          is_visible: true,
          sort_order: 2,
          components: [],
        },
      ],
    },
  ],
} as unknown as AgentContext;

describe("elite site output compiler", () => {
  it("creates persisted visual actions for a premium website request", () => {
    const result = compileEliteSiteOutput(context, "build a premium modern website", 40);
    expect(result.actions.length).toBeGreaterThan(4);
    expect(result.actions.some((a) => a.type === "set_theme")).toBe(true);
    expect(result.actions.some((a) => a.type === "set_section_visual")).toBe(true);
    expect(result.actions.some((a) => a.type === "set_section_variant")).toBe(true);
    expect(result.actions.some((a) => a.type === "set_component_visual")).toBe(true);
    expect(result.directionId).toBeTruthy();
  });

  it("is deterministic for the same business and request", () => {
    const a = compileEliteSiteOutput(context, "build a premium website", 40);
    const b = compileEliteSiteOutput(context, "build a premium website", 40);
    expect(a).toEqual(b);
  });

  it("does not spend actions on unrelated text requests", () => {
    const result = compileEliteSiteOutput(context, "rewrite the hero headline", 40);
    expect(result.actions).toHaveLength(0);
  });

  it("never exceeds its action budget", () => {
    const result = compileEliteSiteOutput(context, "redesign the entire site", 7);
    expect(result.actions.length).toBeLessThanOrEqual(7);
  });
});
