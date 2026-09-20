/**
 * The single most common owner request is exact wording:
 * "Change my homepage headline to 'X' and make the main button say 'Y'".
 *
 * Before this was wired in, the builder answered "Which part of your website
 * should I change?" and applied nothing. These tests pin the behaviour so it
 * cannot silently regress.
 */
import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { readActions } from "@/lib/site-agent";
import { buildDeterministicPlan } from "./deterministic";

const HOME_ID = "33333333-3333-4333-8333-333333333333";
const HERO_ID = "11111111-1111-4111-8111-111111111111";
const BUTTON_ID = "44444444-4444-4444-8444-444444444444";

const SECTION_KINDS = [
  "hero",
  "intro",
  "services",
  "pricing",
  "reviews",
  "faq",
  "contact",
  "cta",
];

function context(): AgentContext {
  return {
    business: {
      name: "Northside Plumbing",
      industry: "Plumbing",
      tagline: null,
      description: "We fix leaks and install boilers.",
      city: "Leeds",
      state: null,
      serviceArea: null,
      phone: "0113 496 0000",
      email: null,
      yearsInBusiness: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      fontPreference: null,
      services: [{ name: "Leak repair", price: null, startingPrice: null }],
      publishedReviewCount: 0,
      photoCount: 0,
    },
    pages: [
      {
        id: HOME_ID,
        slug: "/",
        title: "Home",
        kind: "home",
        is_visible: true,
        noindex: false,
        seo_title: null,
        seo_description: null,
        sections: [
          {
            id: HERO_ID,
            kind: "hero",
            variant: "center",
            is_visible: true,
            heading: "Welcome",
            subheading: null,
            body: null,
            components: [
              {
                id: BUTTON_ID,
                kind: "button",
                label: "Contact us",
                body: null,
                link_label: "Contact us",
                link_url: "/contact",
              },
            ],
          },
        ],
      },
    ] as AgentContext["pages"],
    sectionKinds: SECTION_KINDS,
    pageKinds: ["home", "services", "about", "contact", "custom"],
    componentKinds: ["feature", "card", "link", "button"],
  };
}

const known = {
  pageIds: new Set([HOME_ID]),
  sectionIds: new Set([HERO_ID]),
  componentIds: new Set([BUTTON_ID]),
};

describe("exact wording requests are applied, not questioned", () => {
  it("changes the headline and the button label in one request", () => {
    const plan = buildDeterministicPlan(
      context(),
      "Change my homepage headline to 'Reliable service, done right' and make the main button say 'Get a free quote'",
    );

    const heading = plan.actions.find(
      (action) => action.type === "set_section_text" && action.field === "heading",
    );
    expect(heading).toMatchObject({
      sectionId: HERO_ID,
      value: "Reliable service, done right",
    });

    const button = plan.actions.find((action) => action.type === "set_component");
    expect(button).toMatchObject({
      componentId: BUTTON_ID,
      patch: { label: "Get a free quote", link_label: "Get a free quote" },
    });

    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.coverage).not.toBe("none");
    // Everything must survive the same validator the executor uses.
    expect(readActions(plan.actions, known).length).toBe(plan.actions.length);
  });

  it("keeps the owner's own words without rewriting them", () => {
    const plan = buildDeterministicPlan(
      context(),
      'Set the hero subheading to "Same-day leak repairs across Leeds"',
    );

    expect(
      plan.actions.find(
        (action) => action.type === "set_section_text" && action.field === "subheading",
      ),
    ).toMatchObject({ value: "Same-day leak repairs across Leeds" });
  });

  it("updates a real contact detail when asked, and never invents one", () => {
    const plan = buildDeterministicPlan(
      context(),
      "Change my phone number to 0113 496 1234",
    );

    expect(plan.actions.find((action) => action.type === "set_business_fact")).toMatchObject({
      field: "phone",
      value: "0113 496 1234",
    });
  });
});
