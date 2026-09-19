import { describe, expect, it } from "vitest";
import { guardBuilderPlan } from "./elite-plan-guard";
import { auditEliteBuilderQuality } from "./elite-quality";
import type { AgentContext } from "@/lib/site-agent.server";
import type { AgentAction } from "@/lib/site-agent";

const context: AgentContext = {
  business: {
    name: "Acme",
    industry: "home services",
    tagline: "Reliable service",
    description: "Local service business",
    city: "Carrboro",
    state: "NC",
    serviceArea: "Carrboro",
    phone: null,
    email: null,
    yearsInBusiness: null,
    primaryColor: "#111111",
    secondaryColor: "#222222",
    accentColor: "#d4af37",
    fontPreference: null,
    services: [{ name: "Service", price: null, startingPrice: null }],
    publishedReviewCount: 0,
    photoCount: 0,
  },
  pages: [
    {
      id: "page-home",
      slug: "",
      title: "Home",
      kind: "home",
      is_visible: true,
      noindex: false,
      seo_title: "Acme",
      seo_description: "Reliable local service.",
      sections: [
        {
          id: "section-hero",
          kind: "hero",
          variant: "default",
          is_visible: true,
          heading: "Reliable service",
          subheading: "Local help",
          body: "Call today.",
          sort_order: 0,
          components: [
            {
              id: "button-1",
              kind: "button",
              label: "Book",
              body: null,
              link_label: "Book",
              link_url: "/contact",
              sort_order: 0,
            },
          ],
        },
      ],
    },
  ],
  sectionKinds: ["hero", "contact"],
  pageKinds: ["home", "custom"],
  componentKinds: ["button"],
};

describe("elite builder guard", () => {
  it("drops invalid ids, deduplicates actions, and preserves temp page references", () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "section-hero", field: "heading", value: "A" },
      { type: "set_section_text", sectionId: "section-hero", field: "heading", value: "A" },
      { type: "set_section_text", sectionId: "missing", field: "heading", value: "bad" },
      { type: "add_page", kind: "custom", title: "About", slug: "about", ref: "temp_about" },
      { type: "set_page", pageId: "temp_about", patch: { title: "About" } },
    ];

    const result = guardBuilderPlan(context, actions, 60);
    expect(result.actions).toHaveLength(3);
    expect(result.duplicates).toBe(1);
    expect(result.unsafe).toBe(1);
  });
});

describe("elite builder quality", () => {
  it("produces bounded, deterministic scores", () => {
    const actions: AgentAction[] = [
      { type: "set_theme", patch: { accent_color: "#d4af37" } },
      { type: "set_section_effect", sectionId: "section-hero", effect: "rise" },
    ];
    const a = auditEliteBuilderQuality(context, actions, "make the site premium");
    const b = auditEliteBuilderQuality(context, actions, "make the site premium");
    expect(a).toEqual(b);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.findings.length).toBeLessThanOrEqual(24);
  });
});
