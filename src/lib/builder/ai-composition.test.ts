import { describe, expect, it } from "vitest";
import { composeActions, parseProposal } from "@/lib/builder/ai-composition.server";
import { parseAuthoredDirection } from "@/lib/authored-direction";
import type { AgentContext } from "@/lib/site-agent.server";

const AUTHORED = {
  name: "Test authored look",
  mood: "Written by the model under test.",
  bestFor: "Tests",
  primary: "#1f6feb",
  secondary: "#0b1020",
  accent: "#f5c451",
  font: "Fraunces",
  fontNote: "test",
  backdrop: "none",
  heroEffect: "none",
  ctaEffect: "none",
  formEffect: "none",
  bodyEffect: "rise",
};
const direction = parseAuthoredDirection(AUTHORED)!;

function context(overrides?: Partial<AgentContext["business"]>): AgentContext {
  return {
    business: {
      name: "Elite Mobile Cars",
      industry: "mobile car detailing",
      tagline: null,
      description: null,
      city: "Leeds",
      state: null,
      serviceArea: null,
      phone: null,
      email: null,
      yearsInBusiness: null,
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      fontPreference: null,
      services: [{ name: "Full detail", price: null, startingPrice: null }],
      publishedReviewCount: 0,
      photoCount: 0,
      ...overrides,
    },
    pages: [
      {
        id: "page-1",
        title: "Home",
        kind: "home",
        slug: "home",
        is_visible: true,
        sections: [
          {
            id: "s-hero",
            kind: "hero",
            variant: "a",
            is_visible: true,
            heading: "Hi",
            subheading: null,
            body: null,
            sort_order: 0,
            components: [],
          },
          {
            id: "s-cta",
            kind: "cta",
            variant: "a",
            is_visible: true,
            heading: "Book",
            subheading: null,
            body: null,
            sort_order: 1,
            components: [],
          },
          {
            id: "s-services",
            kind: "services",
            variant: "a",
            is_visible: true,
            heading: "Services",
            subheading: null,
            body: null,
            sort_order: 2,
            components: [],
          },
        ],
      },
    ] as unknown as AgentContext["pages"],
    sectionKinds: ["hero", "services", "reviews", "pricing", "gallery", "faq", "cta", "contact"],
    pageKinds: ["home"],
    componentKinds: ["button"],
  } as AgentContext;
}

describe("AI-composed site structure", () => {
  it("rejects an answer that names a page or direction that does not exist", () => {
    expect(
      parseProposal(
        { direction: { name: "x", primary: "red" }, pages: [{ pageId: "page-1", order: ["hero"] }] },
        context(),
      ),
    ).toBeNull();
    expect(
      parseProposal(
        {
          direction: AUTHORED,
          pages: [{ pageId: "ghost-page", order: ["hero", "services", "cta"] }],
        },
        context(),
      ),
    ).toBeNull();
  });

  it("drops sections that would need facts the business has not supplied", () => {
    const parsed = parseProposal(
      {
        direction: AUTHORED,
        pages: [
          {
            pageId: "page-1",
            order: ["hero", "reviews", "pricing", "gallery", "services", "cta"],
          },
        ],
      },
      context(),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.pages[0]!.order).toEqual(["hero", "services", "cta"]);
  });

  it("keeps proof sections when the reviews and photos are real", () => {
    const parsed = parseProposal(
      {
        direction: AUTHORED,
        pages: [{ pageId: "page-1", order: ["hero", "reviews", "gallery", "cta"] }],
      },
      context({ publishedReviewCount: 6, photoCount: 9 }),
    );
    expect(parsed!.pages[0]!.order).toEqual(["hero", "reviews", "gallery", "cta"]);
  });

  it("only reorders real sections and never deletes or hides anything", () => {
    const ctx = context();
    const { actions } = composeActions(
      ctx,
      { direction, pages: [{ pageId: "page-1", order: ["hero", "services", "faq", "cta"] }] },
      40,
    );
    expect(actions.some((action) => action.type === "delete_section")).toBe(false);
    expect(actions.some((action) => action.type === "set_section_visibility")).toBe(false);

    const added = actions.filter((action) => action.type === "add_section");
    expect(added.map((action) => (action as { kind: string }).kind)).toEqual(["faq"]);

    const reorder = actions.find((action) => action.type === "reorder_sections") as
      | { sectionIds: string[] }
      | undefined;
    expect(reorder?.sectionIds).toEqual(["s-hero", "s-services", "s-cta"]);
  });

  it("stays inside the action cap", () => {
    const { actions } = composeActions(
      context(),
      { direction, pages: [{ pageId: "page-1", order: ["hero", "services", "faq", "cta"] }] },
      3,
    );
    expect(actions.length).toBeLessThanOrEqual(3);
  });
});

describe("brand choices the owner made", () => {
  it("uses the owner's colours and font instead of the look's own", async () => {
    const { applyBrandPreference } = await import("@/lib/builder/ai-composition.server");
    const base = direction;
    const result = applyBrandPreference(base, {
      tone: "dark",
      primaryColor: "#123456",
      secondaryColor: null,
      accentColor: "#abcdef",
      font: "Lora",
      directionId: null,
    });
    expect(result.locked).toBe(true);
    expect(result.direction.primary).toBe("#123456");
    expect(result.direction.accent).toBe("#abcdef");
    expect(result.direction.secondary).toBe(base.secondary);
    expect(result.direction.font).toBe("Lora");
    expect(result.direction.fontNote).toContain("you");
  });

  it("leaves the look untouched when nothing was chosen", async () => {
    const { applyBrandPreference } = await import("@/lib/builder/ai-composition.server");
    const base = direction;
    const result = applyBrandPreference(base, null);
    expect(result.locked).toBe(false);
    expect(result.direction).toEqual(base);
  });
});
