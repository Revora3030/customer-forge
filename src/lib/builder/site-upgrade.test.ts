import { describe, expect, it } from "vitest";
import { planWholeSiteUpgrade, factualHeadline } from "./site-upgrade";
import { interpret } from "./interpreter";
import type { AgentContext } from "@/lib/site-agent.server";

function ctx(overrides: { business?: Partial<AgentContext["business"]> } = {}): AgentContext {
  const business: AgentContext["business"] = {
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
  };
  return {
    business,
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
  };
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
    const page = context.pages[0]!;
    page.sections[0]!.heading = "Same-day repairs, no callout fee";
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
      ctx({ business: { publishedReviewCount: 12 } }),
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
    const line = factualHeadline(ctx({ business: { tagline: "Same-day plumbing across Austin" } }));
    expect(line).toBe("Same-day plumbing across Austin");
  });
});

describe("planWholeSiteUpgrade — site-wide passes", () => {
  it("gives every hero a real next step when a phone number exists", () => {
    const actions = planWholeSiteUpgrade(
      ctx({ business: { phone: "(512) 555-0134" } }),
      interpret("redesign my whole website", []),
      { cap: 80 },
    );
    const button = actions.find((a) => a.type === "add_component");
    expect(button).toBeTruthy();
    expect(JSON.stringify(button)).toContain("tel:");
  });

  it("never invents a destination when there is no contact page or phone", () => {
    const actions = planWholeSiteUpgrade(ctx(), interpret("redesign my whole website", []), { cap: 80 });
    expect(actions.some((a) => a.type === "add_component")).toBe(false);
  });

  it("writes search titles only from real facts", () => {
    const actions = planWholeSiteUpgrade(ctx(), interpret("redesign my whole website", []), { cap: 80 });
    const seo = actions.filter((a) => a.type === "set_page");
    expect(seo.length).toBeGreaterThan(0);
    expect(JSON.stringify(seo)).toContain("Bluebird Plumbing");
  });

  it("picks layout variants for the look and skips them when keeping the look", () => {
    const intent = interpret("redesign my whole website", []);
    const withLook = planWholeSiteUpgrade(ctx(), intent, { cap: 80 });
    const keepLook = planWholeSiteUpgrade(ctx(), intent, { cap: 80, keepLook: true });
    expect(withLook.some((a) => a.type === "set_section_variant")).toBe(true);
    expect(keepLook.some((a) => a.type === "set_section_variant")).toBe(false);
  });

  it("respects the action budget", () => {
    const actions = planWholeSiteUpgrade(ctx(), interpret("redesign my whole website", []), { cap: 5 });
    expect(actions.length).toBeLessThanOrEqual(5);
  });

  it("lays out every section and skips that when keeping the look", () => {
    const intent = interpret("redesign my whole website", []);
    const withLook = planWholeSiteUpgrade(ctx(), intent, { cap: 120 });
    const keepLook = planWholeSiteUpgrade(ctx(), intent, { cap: 120, keepLook: true });
    expect(withLook.some((a) => a.type === "set_section_visual")).toBe(true);
    expect(keepLook.some((a) => a.type === "set_section_visual")).toBe(false);
  });

  it("describes every picture using only real details", () => {
    const context = ctx();
    context.pages[0]!.sections[1]!.components.push({
      id: "c1",
      kind: "image",
      label: null,
      body: null,
      link_label: null,
      link_url: null,
      sort_order: 0,
    });
    const actions = planWholeSiteUpgrade(context, interpret("redesign my whole website", []), {
      cap: 120,
    });
    const media = actions.filter((a) => a.type === "set_component_visual");
    expect(media.length).toBeGreaterThan(0);
    expect(JSON.stringify(media)).toContain("Bluebird Plumbing");
  });

  it("puts the wording before the button inside a section", () => {
    const context = ctx();
    context.pages[0]!.sections[1]!.components.push(
      {
        id: "btn",
        kind: "button",
        label: "Call us",
        body: null,
        link_label: "Call us",
        link_url: "tel:+15125550000",
        sort_order: 0,
      },
      {
        id: "txt",
        kind: "text",
        label: "What we do",
        body: "Emergency plumbing across Austin.",
        link_label: null,
        link_url: null,
        sort_order: 1,
      },
    );
    const actions = planWholeSiteUpgrade(context, interpret("redesign my whole website", []), {
      cap: 120,
    });
    const reorder = actions.find((a) => a.type === "reorder_components");
    expect(reorder).toBeDefined();
    expect(reorder && "componentIds" in reorder ? reorder.componentIds : []).toEqual(["txt", "btn"]);
  });
});
