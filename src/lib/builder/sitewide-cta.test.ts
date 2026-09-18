import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { compileSitewideCtaRepairs, findSitewideCtaRepairs, sitewideCtaSummary } from "./sitewide-cta";

const context = {
  pages: [
    {
      id: "home", kind: "home", title: "Home", slug: "", is_visible: true, noindex: false,
      sections: [
        { id: "home-hero", kind: "hero", sort_order: 0, heading: "Welcome", subheading: null, body: null,
          components: [{ id: "home-btn", kind: "button", label: "Book", body: null, link_label: "Book", link_url: "/book", sort_order: 0 }] },
      ],
    },
    {
      id: "services", kind: "services", title: "Services", slug: "services", is_visible: true, noindex: false,
      sections: [{ id: "services-body", kind: "services", sort_order: 0, heading: "Services", subheading: null, body: null, components: [] }],
    },
    {
      id: "hidden", kind: "custom", title: "Hidden", slug: "hidden", is_visible: false, noindex: false,
      sections: [{ id: "hidden-body", kind: "content", sort_order: 0, heading: "Hidden", subheading: null, body: null, components: [] }],
    },
  ],
} as unknown as AgentContext;

describe("site-wide CTA intelligence", () => {
  it("finds visible pages missing a native CTA", () => {
    const repairs = findSitewideCtaRepairs(context, "improve conversions and booking across the site", "/book", "Book now", 8);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.pageId).toBe("services");
  });

  it("compiles repairs into existing native actions", () => {
    const actions = compileSitewideCtaRepairs(context, "get more leads", "/contact", "Get a quote", 8);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: "add_component", kind: "button", sectionId: "services-body", link_url: "/contact" });
    expect(sitewideCtaSummary(actions)).toContain("1 missing page-level CTA");
  });

  it("does nothing for unrelated requests", () => {
    expect(findSitewideCtaRepairs(context, "change my phone number", "/book", "Book now")).toEqual([]);
  });
});
