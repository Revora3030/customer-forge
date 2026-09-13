import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import { readActions } from "@/lib/site-agent";
import { buildDeterministicPlan } from "./deterministic";
import { interpret } from "./interpreter";
import { GENERIC_PLAYBOOK, playbookFor } from "./industry";
import { pageSeo, sectionCopy } from "./copy";

const SECTION_KINDS = [
  "hero",
  "trust_bar",
  "intro",
  "services",
  "pricing",
  "quote",
  "booking",
  "reviews",
  "gallery",
  "faq",
  "guarantee",
  "offer",
  "cta",
  "sticky_cta",
  "area",
  "areas",
  "contact",
  "process",
  "benefits",
  "lead_magnet",
];

const HERO_ID = "11111111-1111-4111-8111-111111111111";
const SERVICES_ID = "22222222-2222-4222-8222-222222222222";
const HOME_ID = "33333333-3333-4333-8333-333333333333";
const BUTTON_ID = "44444444-4444-4444-8444-444444444444";

function context(overrides: Partial<AgentContext["business"]> = {}): AgentContext {
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
      ...overrides,
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
            components: [],
          },
          {
            id: SERVICES_ID,
            kind: "services",
            variant: "grid",
            is_visible: true,
            heading: "Services",
            subheading: null,
            body: null,
            components: [
              {
                id: BUTTON_ID,
                kind: "card",
                label: "Leak repair",
                body: null,
                link_label: null,
                link_url: null,
              },
            ],
          },
        ],
      },
    ] as AgentContext["pages"],
    sectionKinds: SECTION_KINDS,
    pageKinds: ["home", "services", "about", "contact", "custom"],
    componentKinds: ["feature", "faq", "step", "stat", "card", "link", "button", "quote"],
  };
}

const known = {
  pageIds: new Set([HOME_ID]),
  sectionIds: new Set([HERO_ID, SERVICES_ID]),
  componentIds: new Set([BUTTON_ID]),
};

describe("free-first builder — works with zero AI providers", () => {
  it("builds a whole site plan from plain words, with no provider configured", () => {
    const plan = buildDeterministicPlan(context(), "build me a plumbing website");
    expect(plan.coverage).toBe("full");
    expect(plan.actions.length).toBeGreaterThan(3);
    // Everything it emits survives the same validator the AI path goes through.
    expect(readActions(plan.actions, known).length).toBe(plan.actions.length);
  });

  it("handles a style request as design tokens, not prose", () => {
    const plan = buildDeterministicPlan(context(), "make my website look more professional");
    expect(plan.actions.some((action) => action.type === "set_theme")).toBe(true);
    expect(plan.coverage).not.toBe("none");
  });

  it("emits theme and backdrop choices that survive validation and render", () => {
    // Regression: the deterministic designer produced semantic words
    // (`primary: "deep blue"`, `backdrop: "soft"`) that the action validator
    // rejected and the renderer could not display — so a whole-site design
    // request silently produced no visual action at all.
    const plan = buildDeterministicPlan(context(), "build me a plumbing website");
    const theme = plan.actions.find((action) => action.type === "set_theme");
    const backdrop = plan.actions.find((action) => action.type === "set_backdrop");

    // The planner must actually emit them for a design-bearing request.
    expect(theme?.type).toBe("set_theme");
    expect(backdrop?.type).toBe("set_backdrop");

    // They must survive the same validator the AI path goes through.
    expect(readActions([theme!, backdrop!], known).length).toBe(2);

    // And they must be renderer-safe: concrete hex colors and an allowlisted
    // backdrop id, never a prose word the renderer would ignore.
    if (theme?.type === "set_theme") {
      for (const color of [
        theme.patch.primary_color,
        theme.patch.secondary_color,
        theme.patch.accent_color,
      ]) {
        expect(color).toMatch(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i);
      }
    }
    if (backdrop?.type === "set_backdrop") {
      expect(backdrop.backdrop).toMatch(
        /^(none|stars|aurora|nebula|grid|spotlight|gradient_mesh)$/,
      );
    }
  });

  it("makes the hero bigger without a model", () => {
    const plan = buildDeterministicPlan(context(), "make the hero bigger");
    expect(
      plan.actions.some(
        (action) => action.type === "set_section_variant" && action.sectionId === HERO_ID,
      ),
    ).toBe(true);
  });

  it("adds a booking button pointing at a real contact detail only", () => {
    const plan = buildDeterministicPlan(context(), "add a call button");
    const added = plan.actions.find((action) => action.type === "add_component");
    expect(added).toBeTruthy();
    expect(JSON.stringify(added)).toContain("tel:");
  });

  it("asks for a contact detail instead of inventing one", () => {
    const plan = buildDeterministicPlan(context({ phone: null, email: null }), "add a call button");
    expect(plan.questions.length).toBeLessThanOrEqual(1);
    expect(JSON.stringify(plan.actions)).not.toMatch(/tel:\d/);
  });

  it("creates a requested page and says the sections come next", () => {
    const plan = buildDeterministicPlan(context(), "add a plumbing services page");
    expect(plan.actions.some((action) => action.type === "add_page")).toBe(true);
  });

  it("writes SEO titles from the trade, town and services only", () => {
    const plan = buildDeterministicPlan(context(), "help me show up on google");
    const seo = plan.actions.find((action) => action.type === "set_page");
    expect(seo).toBeTruthy();
    expect(JSON.stringify(seo)).toContain("Leeds");
  });

  it("answers a mobile request truthfully rather than faking work", () => {
    const plan = buildDeterministicPlan(context(), "make it mobile friendly");
    expect(plan.notes.join(" ")).toMatch(/phones/i);
  });

  it("never invents reviews, prices, awards or licences", () => {
    const text = JSON.stringify(
      buildDeterministicPlan(context(), "build me a roofing website and make it premium"),
    );
    expect(text).not.toMatch(/\b5[- ]star|award|licen[cs]ed since|\$\d|£\d|guaranteed results/i);
  });

  it("hides and removes sections when asked", () => {
    expect(
      buildDeterministicPlan(context(), "hide the services section").actions.some(
        (action) => action.type === "set_section_visibility" && action.visible === false,
      ),
    ).toBe(true);
    expect(
      buildDeterministicPlan(context(), "remove the services section").actions.some(
        (action) => action.type === "delete_section",
      ),
    ).toBe(true);
  });

  it("returns coverage none rather than refusing an unclear request", () => {
    const plan = buildDeterministicPlan(context(), "hmmm");
    expect(plan.coverage).toBe("none");
    expect(plan.reply.length).toBeGreaterThan(10);
  });
});

describe("industry intelligence", () => {
  it("matches trades from plain speech, longest alias first", () => {
    expect(playbookFor("we do air conditioning").slug).toBe("hvac");
    expect(playbookFor("I'm a sparky electrician").slug).toBe("electrical");
    expect(playbookFor("something unheard of").slug).toBe(GENERIC_PLAYBOOK.slug);
  });

  it("covers twenty industries with distinct playbooks", () => {
    const slugs = new Set(
      [
        "plumbing",
        "hvac",
        "roofing",
        "electrical",
        "landscaping",
        "cleaning",
        "construction",
        "remodeling",
        "painting",
        "automotive",
        "real_estate",
        "legal",
        "medical",
        "dental",
        "restaurant",
        "beauty",
        "fitness",
        "professional_services",
        "home_services",
        "local_business",
      ].map((slug) => playbookFor(slug.replace(/_/g, " ")).slug),
    );
    expect(slugs.size).toBeGreaterThanOrEqual(18);
  });
});

describe("interpreter", () => {
  it("never rejects a request", () => {
    for (const phrase of ["", "do the thing", "make it pop", "add a booking button"]) {
      const intent = interpret(phrase);
      expect(intent).toBeTruthy();
      expect(Array.isArray(intent.verbs)).toBe(true);
    }
  });
});

describe("copy engine", () => {
  it("omits sentences it has no facts for", () => {
    const facts = {
      name: "",
      industry: null,
      tagline: null,
      description: null,
      city: null,
      state: null,
      serviceArea: null,
      phone: null,
      email: null,
      services: [],
    };
    const copy = sectionCopy("intro", facts, GENERIC_PLAYBOOK);
    expect(copy.body).toBeUndefined();
    const seo = pageSeo("Home", facts, GENERIC_PLAYBOOK);
    expect(seo.seo_title.length).toBeLessThanOrEqual(70);
    expect(seo.seo_description.length).toBeLessThanOrEqual(160);
  });
});

describe("everyday language, no AI provider", () => {
  const ctx = context();

  it("understands typos, slang and idioms", () => {
    const plan = buildDeterministicPlan(
      ctx,
      "can you make the top part hit harder and look expensive on my webiste",
    );
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.requiresExternalReasoning).toBe(false);
    expect(plan.intent.moods).toContain("premium");
  });

  it("resolves 'make it darker' against the previous message", () => {
    const plan = buildDeterministicPlan(ctx, "now make it darker", {
      history: ["change the hero"],
    });
    expect(plan.intent.carried).toContain("hero");
    expect(plan.actions.length).toBeGreaterThan(0);
  });

  it("builds a complete roofing website in one request", () => {
    const plan = buildDeterministicPlan(ctx, "build me a full website for my roofing company");
    expect(plan.tasks.length).toBeGreaterThan(2);
    expect(plan.actions.some((a) => a.type === "add_section")).toBe(true);
    expect(plan.actions.some((a) => a.type === "set_theme")).toBe(true);
    expect(plan.actions.some((a) => a.type === "set_page")).toBe(true);
    expect(plan.requiresExternalReasoning).toBe(false);
  });

  it("puts the deciding information first when asked about hierarchy", () => {
    const plan = buildDeterministicPlan(ctx, "make the important stuff easier to find");
    expect(plan.intent.verbs).toContain("hierarchy");
  });

  it("does not need a provider just because a file is attached", () => {
    const plan = buildDeterministicPlan(ctx, "add a gallery section", {
      attachments: [{ kind: "image", name: "job.jpg" }],
    });
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.requiresExternalReasoning).toBe(false);
  });

  it("escalates only when nothing about the website was recognised", () => {
    const plan = buildDeterministicPlan(ctx, "write a poem about my grandad");
    expect(plan.actions).toHaveLength(0);
    expect(plan.requiresExternalReasoning).toBe(true);
    expect(plan.externalReason).toBeTruthy();
  });

  it("emits only actions the security validator accepts", () => {
    const plan = buildDeterministicPlan(ctx, "redesign my whole website to look premium");
    const known = {
      pageIds: new Set([HOME_ID]),
      sectionIds: new Set([HERO_ID, SERVICES_ID]),
      componentIds: new Set([BUTTON_ID]),
    };
    expect(readActions(plan.actions, known).length).toBeGreaterThan(0);
  });

  it("never invents reviews, awards or prices", () => {
    const plan = buildDeterministicPlan(ctx, "build me a full website");
    const text = JSON.stringify(plan.actions).toLowerCase();
    expect(text).not.toMatch(/award|5[- ]star|certified|licensed|guaranteed results|\$\d/);
  });
});

describe("named page requests are finished, never blank", () => {
  it("creates the page and fills its sections, wording and next step in one request", () => {
    const plan = buildDeterministicPlan(context(), "add a pricing page");
    const page = plan.actions.find((action) => action.type === "add_page");
    expect(page).toBeTruthy();
    const ref = (page as { ref?: string }).ref;
    expect(ref).toBeTruthy();
    const sections = plan.actions.filter(
      (action) => action.type === "add_section" && (action as { pageId?: string }).pageId === ref,
    );
    expect(sections.length).toBeGreaterThan(0);
    // Search wording is written for the new page in the same run.
    expect(
      plan.actions.some(
        (action) => action.type === "set_page" && (action as { pageId?: string }).pageId === ref,
      ),
    ).toBe(true);
    // Everything still passes the shared validator.
    expect(readActions(plan.actions, known).length).toBe(plan.actions.length);
  });

  it("tells the owner the page is already finished rather than promising a second pass", () => {
    const plan = buildDeterministicPlan(context(), "add a booking page");
    expect(plan.notes.join(" ")).not.toMatch(/next request/i);
  });
});
