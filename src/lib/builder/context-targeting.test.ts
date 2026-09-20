import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/lib/site-agent.server";
import type { BuilderIntent } from "./interpreter";
import { scopeContextForIntent } from "./context-targeting";

const context: AgentContext = {
  business: {
    name: "Example Business",
    industry: null,
    tagline: null,
    description: null,
    city: null,
    state: null,
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
      id: "page-home",
      slug: "/",
      title: "Home",
      kind: "home",
      is_visible: true,
      noindex: false,
      seo_title: null,
      seo_description: null,
      sections: [],
    },
    {
      id: "page-services",
      slug: "/services",
      title: "Services",
      kind: "services",
      is_visible: true,
      noindex: false,
      seo_title: null,
      seo_description: null,
      sections: [],
    },
  ],
  sectionKinds: [],
  pageKinds: ["home", "services"],
  componentKinds: [],
};

const intent = (pageHints: string[], wholeSite = false, everyPage = false): BuilderIntent => ({
  original: "test",
  verbs: ["rewrite"],
  sectionKinds: [],
  operations: [],
  pageHints,
  newPages: [],
  moods: [],
  goals: [],
  constraints: [],
  industry: null,
  wholeSite,
  everyPage,
  keepFacts: true,
  carried: null,
  locationHint: null,
  audienceHint: null,
  visualIntensity: 0,
  unrecognised: [],
});

describe("scopeContextForIntent", () => {
  it("scopes a narrow request to the explicitly named page", () => {
    const result = scopeContextForIntent(context, intent(["services"]));

    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.scoped).toBe(true);
      expect(result.pageId).toBe("page-services");
      expect(result.context.pages).toHaveLength(1);
      expect(result.context.pages[0]?.id).toBe("page-services");
    }
  });

  it("does not fall back to the homepage for an unmatched explicit target", () => {
    const result = scopeContextForIntent(context, intent(["portfolio"]));

    expect(result.matched).toBe(false);
    expect(result.context.pages).toHaveLength(2);
    expect(result.pageId).toBeNull();
  });

  it("keeps the full context for whole-site requests", () => {
    const result = scopeContextForIntent(context, intent(["services"], true));

    expect(result.matched).toBe(true);
    expect(result.scoped).toBe(false);
    expect(result.context.pages).toHaveLength(2);
  });

  it("keeps the full context for every-page requests", () => {
    const result = scopeContextForIntent(context, intent(["services"], false, true));

    expect(result.matched).toBe(true);
    expect(result.scoped).toBe(false);
    expect(result.context.pages).toHaveLength(2);
  });

  it("matches slugs and page titles case-insensitively", () => {
    const bySlug = scopeContextForIntent(context, intent(["/SERVICES"]));
    const byTitle = scopeContextForIntent(context, intent(["Services"]));

    expect(bySlug.matched).toBe(true);
    expect(byTitle.matched).toBe(true);
  });
});

describe("page names that are also ordinary words", () => {
  const pageWords = (text: string) => interpret(text, []).pageHints;

  it("does not read 'about what we do' as the About page", () => {
    expect(pageWords("make the headline clearer about what we do")).not.toContain("about");
  });

  it("does not read 'book more jobs' as the booking page", () => {
    expect(pageWords("help me book more jobs")).not.toContain("book");
  });

  it("still understands an owner naming a page", () => {
    expect(pageWords("rewrite the about page")).toContain("about");
    expect(pageWords("tidy up /booking")).toContain("booking");
    expect(pageWords("fix the about us wording")).toContain("about");
    expect(pageWords("make the home page headline clearer")).toContain("home");
    expect(pageWords("add prices to the services page")).toContain("services");
    expect(pageWords("shorten the faq")).toContain("faq");
  });
});
