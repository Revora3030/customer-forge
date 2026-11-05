import { describe, expect, it } from "vitest";
import { HELP_ARTICLES, findHelpArticle, helpArticleMarkdown, helpIndexMarkdown } from "./help-articles";
import { indexablePlatformPaths } from "./seo-intent";

describe("help center", () => {
  it("has unique slugs, a title, description and steps", () => {
    expect(new Set(HELP_ARTICLES.map(a => a.slug)).size).toBe(HELP_ARTICLES.length);
    for (const a of HELP_ARTICLES) { expect(a.title).toBeTruthy(); expect(a.description).toBeTruthy(); expect(a.steps.length).toBeGreaterThan(0); expect(a.verifiedBy.length).toBeGreaterThan(0); }
  });
  it("states pricing exactly", () => {
    const billing = helpArticleMarkdown(findHelpArticle("billing")!);
    expect(billing).toContain("$350 setup");
    expect(billing).toContain("$100/month");
    expect(billing).toContain("first monthly payment is charged 30 days after setup");
    expect(helpArticleMarkdown(findHelpArticle("free-trial")!)).toContain("3 days of full access");
  });
  it("never quotes any other dollar amount", () => {
    for (const a of HELP_ARTICLES) for (const m of helpArticleMarkdown(a).match(/\$\d[\d,.]*/g) ?? []) expect(["$350", "$100"]).toContain(m);
  });
  it("renders a markdown twin and index", () => {
    expect(helpArticleMarkdown(HELP_ARTICLES[0]!)).toMatch(/^# /);
    for (const a of HELP_ARTICLES) expect(helpIndexMarkdown()).toContain(`/help/${a.slug}.md`);
  });
  it("lists every article in the sitemap", () => {
    const paths = indexablePlatformPaths();
    expect(paths).toContain("/help");
    for (const a of HELP_ARTICLES) expect(paths).toContain(`/help/${a.slug}`);
  });
});
