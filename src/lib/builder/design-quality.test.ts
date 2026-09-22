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
    expect(first.dimensions.hierarchy).toBeLessThan(100);
    expect(first.dimensions.conversion).toBeGreaterThan(0);
    expect(designQualitySummary(first)).toContain("Deterministic design-quality scan:");
  });
  it("does not reward generic filler as meaningful content", () => {
    const result = scoreDesignQuality(context);
    expect(result.dimensions.content).toBeLessThan(100);
  });
  it("penalizes and names a weak secondary page instead of judging home only", () => {
    const weak = structuredClone(context) as AgentContext;
    weak.pages.push({
      id: "about",
      kind: "about",
      title: "About",
      slug: "about",
      is_visible: true,
      noindex: false,
      sections: [{ id: "copy", kind: "copy", sort_order: 0, heading: "A considered approach", subheading: null, body: "Useful business context", components: [] }],
    } as never);
    const result = scoreDesignQuality(weak);
    expect(result.dimensions.structure).toBeLessThan(scoreDesignQuality(context).dimensions.structure);
    expect(result.gaps).toContain("page:about:opening");
  });
});
