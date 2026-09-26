import { describe, expect, it } from "vitest";
import { evidenceFor, gatherReviewEvidence } from "./review-evidence.server";

const deps = {
  searchWeb: async () => ({ ok: true as const, results: [{ title: "T", snippet: "S", url: "https://x.test", source: { trust: "research" } }] }),
  keywordIdeas: async () => [{ phrase: "car detailing near me", volume: 900 }],
  google: {
    resolveProperty: async () => ({ status: "selected" as const, siteUrl: "sc-domain:a.test" }),
    searchPerformance: async () => ({
      siteUrl: "sc-domain:a.test",
      rows: [{ page: "/", query: "car detailing", clicks: 2, impressions: 40, position: 7.2 }],
      period: { start: "2026-01-01", end: "2026-01-28" },
      previousPeriod: { start: "", end: "" },
      fetchedAt: "",
    }),
    localListings: async () => {
      throw new Error("quota");
    },
  },
} as never;

describe("review evidence", () => {
  it("gathers each source independently and survives failures", async () => {
    const ev = await gatherReviewEvidence({ industry: "detailing", siteUrl: "https://a.test/", businessName: "Elite", city: "X" }, deps);
    expect(ev.industry).toContain("third-party");
    expect(ev.search).toContain('"car detailing"');
    expect(ev.listing).toBeNull();
    expect(ev.keywords).toContain("car detailing near me");
  });

  it("routes evidence only to the matching reviewers", () => {
    const ev = { industry: "I", search: "S", listing: "L", keywords: "K" };
    expect(evidenceFor("industry_fit", ev)).toEqual(["I", "K"]);
    expect(evidenceFor("funnel", ev)).toEqual(["I", "L"]);
    expect(evidenceFor("seo", ev)).toEqual(["S", "K"]);
    expect(evidenceFor("consistency", ev)).toEqual(["L"]);
    expect(evidenceFor("mobile", ev)).toEqual([]);
  });
});
