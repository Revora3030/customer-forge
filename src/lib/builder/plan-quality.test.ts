import { describe, expect, test } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import type { DeterministicPlan } from "./deterministic";
import { guardAutonomousPlan } from "./plan-quality";

const context = {
  business: {
    name: "Example Business",
    industry: "cleaning",
    tagline: null,
    description: null,
    city: "Carrboro",
    state: "NC",
    serviceArea: null,
    phone: null,
    email: null,
    yearsInBusiness: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    fontPreference: null,
    services: [],
    publishedReviewCount: 0,
    photoCount: 0,
  },
  pages: [
    {
      id: "page-1",
      slug: "/",
      title: "Home",
      kind: "home",
      is_visible: true,
      noindex: false,
      seo_title: null,
      seo_description: null,
      sections: [
        {
          id: "section-1",
          kind: "hero",
          variant: "default",
          is_visible: true,
          heading: "Welcome",
          subheading: null,
          body: null,
          sort_order: 0,
          components: [
            {
              id: "component-1",
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
  sectionKinds: ["hero"],
  pageKinds: ["home"],
  componentKinds: ["button"],
} as AgentContext;

function plan(actions: unknown[], coverage: DeterministicPlan["coverage"] = "full") {
  return {
    reply: "Ready.",
    summary: "Test plan",
    actions,
    questions: [],
    notes: [],
    coverage,
    trace: [],
    intent: {} as DeterministicPlan["intent"],
    tasks: [],
    requiresExternalReasoning: false,
    externalReason: null,
  } as unknown as DeterministicPlan;
}

describe("guardAutonomousPlan", () => {
  test("keeps valid existing and temporary references", () => {
    const result = guardAutonomousPlan(
      context,
      plan([
        { type: "set_section_text", sectionId: "section-1", field: "heading", value: "Book today" },
        { type: "add_section", pageId: "page-1", kind: "hero", heading: "New", position: 1, ref: "temp_section" },
      ]),
    );

    expect(result.actions).toHaveLength(2);
    expect(result.trace.some((item) => item.includes("quality guard passed"))).toBe(true);
  });

  test("removes duplicate and unresolved actions instead of passing them downstream", () => {
    const duplicate = { type: "set_section_text", sectionId: "section-1", field: "heading", value: "Book today" };
    const result = guardAutonomousPlan(
      context,
      plan([duplicate, duplicate, { type: "set_section_text", sectionId: "missing", field: "heading", value: "Bad" }]),
    );

    expect(result.actions).toHaveLength(1);
    expect(result.coverage).toBe("partial");
    expect(result.notes.some((item) => item.includes("duplicate action"))).toBe(true);
    expect(result.notes.some((item) => item.includes("invalid or unresolved reference"))).toBe(true);
  });
});
