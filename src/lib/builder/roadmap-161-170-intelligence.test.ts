import { describe, expect, it } from "vitest";
import { auditRoadmap161to170, compileRoadmap161to170SafeRepairs } from "./roadmap-161-170-intelligence";
import type { AgentContext } from "@/lib/site-agent.server";

const context: AgentContext = {
  business: {
    name: "Test Co", industry: "Home Services", tagline: "Reliable service", description: "",
    city: "", state: "", serviceArea: "", phone: "", email: "", yearsInBusiness: null,
    primaryColor: "#111111", secondaryColor: "#222222", accentColor: "#333333",
    fontPreference: "", services: [], publishedReviewCount: 0, photoCount: 0,
  },
  pages: [
    {
      id: "home", slug: "", title: "Home", kind: "home", is_visible: true, noindex: false,
      seo_title: "Home", seo_description: "Home services",
      sections: [
        {
          id: "hero", kind: "hero", variant: "default", is_visible: true, heading: "Reliable Service",
          subheading: null, body: "Contact our team today.", sort_order: 0,
          components: [{ id: "cta", kind: "button", label: "Get Started", body: null, link_label: "Get Started", link_url: "/contact", sort_order: 0 }],
        },
        {
          id: "contact", kind: "contact", variant: "default", is_visible: true, heading: "Contact",
          subheading: null, body: "Send us a message.", sort_order: 1,
          components: [],
        },
      ],
    },
  ],
  sectionKinds: ["hero", "contact", "cta", "offer", "pricing", "services"],
  pageKinds: ["home", "custom", "contact"],
  componentKinds: ["button", "text", "image", "form"],
};

describe("roadmap #161-#170 intelligence", () => {
  it("is deterministic, bounded, and covers all ten areas", () => {
    const a = auditRoadmap161to170(context, "audit conversion analytics");
    const b = auditRoadmap161to170(context, "audit conversion analytics");
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(Object.keys(a.areas)).toHaveLength(10);
    expect(a.findings.length).toBeLessThanOrEqual(48);
    expect(a.runtimeRequired).toEqual(["runtimeQa", "visualRegression"]);
  });

  it("creates only native bounded conversion repairs", () => {
    const actions = compileRoadmap161to170SafeRepairs(context, "improve conversion", 4);
    expect(actions).toHaveLength(0);
    expect(actions.every((action) => action.type === "add_component")).toBe(true);
  });
});
