import { describe, expect, it } from "vitest";
import { HELP_ARTICLES, findHelpArticle, helpArticleMarkdown, helpIndexMarkdown, helpArticlePath, matchHelpArticles } from "./help-articles";
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
  it("has a search snippet of about 120-160 chars per article, with only the two real prices", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.metaDescription.length, a.slug).toBeGreaterThanOrEqual(110);
      expect(a.metaDescription.length, a.slug).toBeLessThanOrEqual(160);
      for (const m of a.metaDescription.match(/\$\d[\d,.]*/g) ?? []) expect(["$350", "$100"]).toContain(m);
    }
  });
});

describe("helpArticlePath + matchHelpArticles", () => {
  it("builds the citeable /help path", () => {
    expect(helpArticlePath("billing")).toBe("/help/billing");
  });
  it("matches billing and trial questions to real articles", () => {
    const billing = matchHelpArticles("how does billing work");
    expect(billing[0]?.path).toBe("/help/billing");
    expect(billing[0]?.markdownPath).toBe("/help/billing.md");
    const trial = matchHelpArticles("free trial length");
    expect(trial.some((a) => a.slug === "free-trial")).toBe(true);
  });
  it("returns an empty list when nothing matches", () => {
    expect(matchHelpArticles("zzzz-not-a-topic-qqq")).toEqual([]);
  });
  it("caps results", () => {
    expect(matchHelpArticles("", 3)).toHaveLength(3);
  });
});
