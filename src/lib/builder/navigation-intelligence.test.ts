import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { compileNavigationRepairs, findNavigationRepairs } from "./navigation-intelligence";

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
        id: "home-hero", kind: "hero", variant: "default", is_visible: true, heading: "Elite auto detailing",
        subheading: null, body: null, sort_order: 0,
        components: [{ id: "home-book", kind: "button", label: "Book now", body: null, link_label: "Book now", link_url: "/contact", sort_order: 0 }],
      }],
    },
    {
      id: "services", slug: "services", title: "Detailing Services", kind: "services", is_visible: true, noindex: false, seo_title: null, seo_description: null,
      sections: [{
        id: "services-section", kind: "services", variant: "default", is_visible: true, heading: "Detailing services",
        subheading: null, body: "Exterior and interior detailing.", sort_order: 0, components: [],
      }],
    },
    {
      id: "contact", slug: "contact", title: "Contact", kind: "contact", is_visible: true, noindex: false, seo_title: null, seo_description: null,
      sections: [{
        id: "contact-section", kind: "contact", variant: "default", is_visible: true, heading: "Contact us",
        subheading: null, body: null, sort_order: 0, components: [],
      }],
    },
  ],
} satisfies AgentContext;

describe("navigation intelligence", () => {
  it("finds an orphan page and selects an existing contextual source", () => {
    const repairs = findNavigationRepairs(context, "fix the navigation and connect my pages");
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      sourcePageId: "home",
      targetPageId: "services",
      targetUrl: "/services",
      label: "Detailing Services",
    });
  });

  it("does nothing for unrelated requests", () => {
    expect(findNavigationRepairs(context, "rewrite the hero")).toEqual([]);
  });

  it("compiles only native safe link actions", () => {
    const result = compileNavigationRepairs(context, "repair orphan links", 2);
    expect(result.actions).toEqual([
      {
        type: "add_component",
        sectionId: "home-hero",
        kind: "link",
        label: "Detailing Services",
        link_url: "/services",
        link_label: "Detailing Services",
      },
    ]);
  });
});
