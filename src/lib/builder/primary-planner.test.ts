import { describe, expect, it } from "vitest";
import { buildAutonomousPlan } from "./autonomous-brain";

describe("Site Forge primary planner", () => {
  const context = {
    business: {
      name: "Example HVAC",
      industry: "HVAC",
      tagline: "Comfort when you need it",
      description: "Heating and cooling services",
      city: "Carrboro",
      state: "NC",
      serviceArea: "Carrboro and Chapel Hill",
      phone: null,
      email: null,
      yearsInBusiness: null,
      primaryColor: "#111111",
      secondaryColor: "#222222",
      accentColor: "#d4af37",
      fontPreference: null,
      services: [{ name: "AC repair", price: null, startingPrice: null }],
      publishedReviewCount: 0,
      photoCount: 0,
    },
    pages: [
      {
        id: "page-home",
        slug: "/",
        title: "Home",
        kind: "home",
        is_visible: true,
        noindex: false,
        seo_title: null,
        seo_description: null,
        sections: [
          {
            id: "section-hero",
            kind: "hero",
            variant: "default",
            is_visible: true,
            heading: "Heating and cooling services",
            subheading: null,
            body: null,
            sort_order: 0,
            components: [],
          },
        ],
      },
    ],
    sectionKinds: ["hero"],
    pageKinds: ["home"],
    componentKinds: ["button"],
  } as never;

  it("routes a plain-English conversion request through the autonomous planner", () => {
    const plan = buildAutonomousPlan(context, "make my homepage get more calls");

    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.trace.some((entry) => entry.includes("Autonomous Brain"))).toBe(true);
  });

  it("keeps a non-actionable question as a safe zero-action plan", () => {
    const plan = buildAutonomousPlan(context, "what is on my homepage?");

    expect(plan.actions).toEqual([]);
  });
});
