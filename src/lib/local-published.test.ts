import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Route as LocalStateRoute } from "@/routes/local.$industry.$state";
import { isLocalNoindex, localPageContent, localPath, LOCAL_INDUSTRIES, publishedLocalPaths } from "./local-pages";
import { seoInventory } from "./seo-intent";
import { LOCAL_DOCS, LOCAL_NOINDEX_PATHS } from "./seo-docs";
import { sitemapUrls } from "./site-host.server";
import { US_STATES } from "./us-states";

type Head = {
  meta?: Array<Record<string, string>>;
  links?: Array<Record<string, string>>;
  scripts?: Array<{ children?: string }>;
};
const headFor = (industry: string, state: string): Head => {
  const content = localPageContent(industry, state);
  return (LocalStateRoute as unknown as { options: { head: (a: unknown) => Head } }).options.head({
    match: { context: { content } },
  });
};
const robots = (head: Head) => head.meta?.find((m) => m["name"] === "robots")?.["content"];

const PUBLISHED = [
  "hvac/alabama",
  "hvac/georgia",
  "hvac/north-carolina",
  "hvac/south-carolina",
  "hvac/texas",
  "hvac/florida",
  "plumbing/north-carolina",
  "plumbing/texas",
  "plumbing/florida",
  "plumbing/georgia",
  "roofing/north-carolina",
  "roofing/texas",
  "roofing/florida",
  "landscaping/north-carolina",
  "landscaping/arizona",
  "contractors/north-carolina",
  "contractors/arizona",
  "cleaning/north-carolina",
  "auto-detailing/north-carolina",
  "auto-detailing/texas",
].map((p) => `/local/${p}`);

describe("published local pages", () => {
  it("are exactly the 20 approved pages, each with its own copy", () => {
    expect([...publishedLocalPaths()].sort()).toEqual([...PUBLISHED].sort());
    for (const path of PUBLISHED) {
      const [, , industry, state] = path.split("/");
      const content = localPageContent(industry!, state!)!;
      expect(content.doc, path).toBeDefined();
      expect(content.title.length, path).toBeLessThanOrEqual(60);
      expect(content.description.length, path).toBeLessThanOrEqual(160);
      expect(content.doc!.words, path).toBeGreaterThan(320);
      expect(content.faqs.length, path).toBeGreaterThanOrEqual(3);
    }
  });

  it("carry no unapproved wording or internal notes", () => {
    for (const doc of LOCAL_DOCS) {
      const text = `${doc.title} ${doc.description} ${doc.h1} ${doc.body}`;
      expect(text, doc.path).not.toMatch(/month-to-month|refund|money-back|24\/7|Notes \(not for publishing\)|DRAFT|\{\{/i);
      expect(text, doc.path).not.toMatch(/Business Profile/i);
      expect(text, doc.path).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/);
      expect(text, doc.path).toContain("$350");
      expect(text, doc.path).toContain("$100/month");
      expect(text, doc.path).not.toMatch(/every call|seasonal reminders|every customer|goes out automatically/i);
    }
  });

  it("are indexable with a self-referencing canonical", () => {
    for (const path of PUBLISHED) {
      const [, , industry, state] = path.split("/");
      const head = headFor(industry!, state!);
      expect(robots(head), path).toBeUndefined();
      expect(head.links?.find((l) => l["rel"] === "canonical")?.["href"], path).toMatch(new RegExp(`${path}$`));
    }
  });

  it("FAQPage markup repeats the visible FAQ exactly", () => {
    for (const doc of LOCAL_DOCS) {
      const [, , industry, state] = doc.path.split("/");
      const head = headFor(industry!, state!);
      const faq = head.scripts?.map((s) => JSON.parse(s.children ?? "{}")).find((j) => j["@type"] === "FAQPage");
      expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(doc.faqs.map((f) => f.q));
      for (const f of doc.faqs) expect(doc.body).toContain(f.a);
    }
  });
});

describe("local noindex list", () => {
  const listed = [...LOCAL_NOINDEX_PATHS];

  it("holds 678 distinct generated pages and none of the published pages", () => {
    expect(listed).toHaveLength(678);
    for (const path of PUBLISHED) expect(LOCAL_NOINDEX_PATHS.has(path), path).toBe(false);
    for (const path of listed) {
      const [, , industry, state] = path.split("/");
      expect(localPageContent(industry!, state!), path).not.toBeNull();
    }
  });

  it("marks every listed page noindex,follow and keeps a self-referencing canonical", () => {
    for (const path of listed) {
      const [, , industry, state] = path.split("/");
      const head = headFor(industry!, state!);
      expect(robots(head), path).toBe("noindex,follow");
      expect(head.links?.find((l) => l["rel"] === "canonical")?.["href"], path).toMatch(new RegExp(`${path}$`));
    }
  });

  it("leaves unlisted generated pages as they were (no robots tag)", () => {
    let unlisted = 0;
    for (const industry of LOCAL_INDUSTRIES) {
      for (const state of US_STATES) {
        const path = localPath(industry.slug, state.slug);
        if (LOCAL_NOINDEX_PATHS.has(path) || PUBLISHED.includes(path)) continue;
        unlisted++;
        expect(isLocalNoindex(path)).toBe(false);
        expect(robots(headFor(industry.slug, state.slug)), path).toBeUndefined();
      }
    }
    expect(unlisted).toBe(LOCAL_INDUSTRIES.length * US_STATES.length - 678 - 20);
  });

  it("matches the source list in the SEO drafts", () => {
    const file = readFileSync(new URL("../content/seo/local-noindex.txt", import.meta.url), "utf8");
    expect(file.trim().split("\n")).toHaveLength(678);
  });
});

describe("local pages in the sitemap", () => {
  it("lists only the 20 published local pages, never a noindex page", () => {
    const urls = sitemapUrls(null, "https://revoragrowthsystems.com");
    const locals = urls.map((u) => new URL(u.loc).pathname).filter((p) => /^\/local\/[^/]+\/[^/]+$/.test(p));
    expect([...locals].sort()).toEqual([...PUBLISHED].sort());
    for (const p of locals) expect(LOCAL_NOINDEX_PATHS.has(p)).toBe(false);
  });

  it("keeps the held handyman and junk-removal pages out of the inventory and the sitemap", () => {
    const urls = sitemapUrls(null, "https://revoragrowthsystems.com").map((u) => u.loc);
    const inventory = seoInventory().map((p) => p.path);
    for (const path of [...urls, ...inventory]) expect(path).not.toMatch(/handyman|junk-removal/);
  });
});
