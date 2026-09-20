import { describe, expect, it } from "vitest";
import { planWholeSiteUpgrade, factualHeadline } from "./site-upgrade";
import { interpret } from "./interpreter";
import type { AgentContext } from "@/lib/site-agent.server";

function ctx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    business: {
      name: "Bluebird Plumbing",
      industry: "plumbing",
      tagline: null,
      description: null,
      city: "Austin",
      state: "TX",
      serviceArea: null,
      phone: null,
      email: null,
      yearsInBusiness: 12,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      fontPreference: null,
      services: [{ name: "Emergency plumbing", price: null, startingPrice: null }],
      publishedReviewCount: 0,
      photoCount: 0,
      ...overrides.business,
    },
    pages: [
      {
        id: "p1",
        slug: "/",
        title: "Home",
        kind: "home",
        is_visible: true,
        noindex: false,
        seo_title: null,
        seo_description: null,
        sections: [
          {
            id: "s1",
            kind: "hero",
            variant: "default",
            is_visible: true,
            heading: "Welcome",
            subheading: null,
            body: null,
            sort_order: 0,
            components: [],
          },
          {
            id: "s2",
            kind: "services",
            variant: "default",
            is_visible: true,
            heading: "Services",
            subheading: null,
            body: null,
            sort_order: 1,
            components: [],
          },
        ],
      },
    ],
    sectionKinds: ["hero", "services", "reviews", "faq", "cta", "contact"],
    pageKinds: ["home"],
    componentKinds: [],
    ...overrides,
  } as AgentContext;
}

describe("planWholeSiteUpgrade", () => {
  it("installs a theme, backdrop and per-section effects on a wholeSite intent", () => {
    const intent = interpret("redesign my whole website to feel premium", []);
    const plan = planWholeSiteUpgrade(ctx(), intent);
    expect(plan.some((a) => a.type === "set_theme")).toBe(true);
    expect(plan.some((a) => a.type === "set_backdrop")).toBe(true);
    expect(plan.some((a) => a.type === "set_section_effect")).toBe(true);
  });

  it("rewrites a template hero heading from real facts and never invents content", () => {
    const plan = planWholeSiteUpgrade(ctx(), interpret("redesign my whole website", []));
    const rewrite = plan.find(
      (a) => a.type === "set_section_text" && a.sectionId === "s1" && a.field === "heading",
    );
    expect(rewrite).toBeDefined();
    // No fabricated superlatives.
    if (rewrite && rewrite.type === "set_section_text") {
      expect(rewrite.value.toLowerCase()).not.toMatch(/award|#1|best|top-rated|5-star|trusted by/);
    }
  });

  it("preserves an owner-authored hero heading and never overwrites it", () => {
    const context = ctx();
    context.pages[0].sections[0].heading = "Same-day repairs, no callout fee";
    const plan = planWholeSiteUpgrade(context, interpret("redesign my whole website", []));
    const rewrite = plan.find(
      (a) => a.type === "set_section_text" && a.sectionId === "s1" && a.field === "heading",
    );
    expect(rewrite).toBeUndefined();
  });

  it("adds missing high-value sections on the home page but skips reviews when there are none", () => {
    const plan = planWholeSiteUpgrade(ctx(), interpret("rebuild my whole website for conversions", []));
    const added = plan.filter((a) => a.type === "add_section").map((a) => (a as { kind: string }).kind);
    expect(added).toContain("faq");
    expect(added).toContain("cta");
    expect(added).toContain("contact");
    expect(added).not.toContain("reviews");
  });

  it("adds a reviews section when the workspace actually has published reviews", () => {
    const plan = planWholeSiteUpgrade(
      ctx({ business: { publishedReviewCount: 12 } as never }),
      interpret("rebuild my whole website for conversions", []),
    );
    const added = plan.filter((a) => a.type === "add_section").map((a) => (a as { kind: string }).kind);
    expect(added).toContain("reviews");
  });

  it("keeps the visual pass out when the intent asks to keep the current look", () => {
    const plan = planWholeSiteUpgrade(ctx(), interpret("rebuild my whole website for conversions", []), {
      keepLook: true,
    });
    expect(plan.some((a) => a.type === "set_theme")).toBe(false);
    expect(plan.some((a) => a.type === "set_backdrop")).toBe(false);
    expect(plan.some((a) => a.type === "set_section_effect")).toBe(false);
  });

  it("stays inside the action budget", () => {
    const plan = planWholeSiteUpgrade(ctx(), interpret("redesign my whole website", []), { cap: 6 });
    expect(plan.length).toBeLessThanOrEqual(6);
  });

  it("prefers the tagline when it's present", () => {
    const line = factualHeadline(
      ctx({ business: { tagline: "Same-day plumbing across Austin" } as never }),
    );
    expect(line).toBe("Same-day plumbing across Austin");
  });
});
