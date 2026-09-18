import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { designQualitySummary, scoreDesignQuality } from "./design-quality";

const context = {
  business: {},
  pages: [
    {
      id: "home",
      kind: "home",
      title: "Home",
      slug: "",
      is_visible: true,
      noindex: false,
      sections: [
        { id: "hero", kind: "hero", sort_order: 0, heading: "Welcome", subheading: "Grow", body: "Real content", components: [{ kind: "button", link_url: "/contact" }] },
        { id: "services", kind: "services", sort_order: 1, heading: "Services", subheading: null, body: "Our services", components: [] },
        { id: "gallery", kind: "gallery", sort_order: 2, heading: "Our Work", subheading: null, body: null, components: [{ kind: "image" }] },
      ],
    },
  ],
} as unknown as AgentContext;

describe("design quality scoring", () => {
  it("returns deterministic observable dimensions", () => {
    const first = scoreDesignQuality(context);
    const second = scoreDesignQuality(context);
    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(0);
    expect(first.score).toBeLessThanOrEqual(100);
    expect(first.dimensions.structure).toBeGreaterThanOrEqual(80);
    expect(first.dimensions.hierarchy).toBe(100);
    expect(first.dimensions.conversion).toBeGreaterThan(0);
    expect(designQualitySummary(first)).toContain("Deterministic design-quality scan:");
  });
});
