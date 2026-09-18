import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { buildSiteContextGraph, contextGraphSummary, rankPagesForIntent } from "./context-graph";

const context = {
  business: {
    name: "Elite Detail", industry: "auto detailing", tagline: null, description: null,
    city: "Carrboro", state: "NC", serviceArea: "Chapel Hill", phone: null, email: null,
    yearsInBusiness: null, primaryColor: null, secondaryColor: null, accentColor: null,
    fontPreference: null, services: [], publishedReviewCount: 0, photoCount: 0,
  },
  sectionKinds: ["hero", "services", "cta", "contact"],
  pageKinds: ["home", "services", "contact"],
  componentKinds: ["button", "link"],
  pages: [
    {
      id: "home", slug: "", title: "Home", kind: "home", is_visible: true, noindex: false,
      seo_title: null, seo_description: null,
      sections: [{
        id: "hero", kind: "hero", variant: "default", is_visible: true, heading: "Premium detailing",
        subheading: null, body: null, sort_order: 0,
        components: [{ id: "book", kind: "button", label: "Book now", body: null, link_label: "Book now", link_url: "/booking", sort_order: 0 }],
      }],
    },
    {
      id: "services", slug: "services", title: "Services", kind: "services", is_visible: true, noindex: false,
      seo_title: null, seo_description: null,
      sections: [{
        id: "services-section", kind: "services", variant: "default", is_visible: true, heading: "Services",
        subheading: null, body: null, sort_order: 0,
        components: [],
      }],
    },
    {
      id: "booking", slug: "booking", title: "Book an Appointment", kind: "contact", is_visible: true, noindex: false,
      seo_title: null, seo_description: null,
      sections: [{
        id: "booking-section", kind: "contact", variant: "default", is_visible: true, heading: "Book an appointment",
        subheading: null, body: null, sort_order: 0, components: [],
      }],
    },
  ],
} satisfies AgentContext;

describe("site context graph", () => {
  it("connects internal page links and detects orphan pages", () => {
    const graph = buildSiteContextGraph(context);
    expect(graph.edges.some((edge) => edge.from === "home" && edge.to === "booking" && edge.kind === "links_to")).toBe(true);
    expect(graph.orphanPages).toEqual(["services"]);
    expect(graph.conversionPages).toContain("booking");
  });

  it("ranks conversion pages for conversion-oriented requests", () => {
    const ranked = rankPagesForIntent(context, "improve booking conversion");
    expect(ranked[0]?.id).toBe("booking");
  });

  it("produces a compact deterministic summary", () => {
    expect(contextGraphSummary(context)).toBe("3 pages · 7 graph nodes · 12 relationships · 1 orphan pages · 1 conversion pages");
  });
});
