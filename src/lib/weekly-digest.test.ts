import { describe, expect, it } from "vitest";
import { quoteValue, seoFromAudit, seoSection, topLeadSources, weekTrend, weekViews, weeklyDigestSection, type WeeklyDigestExtra } from "./weekly-digest";

const base: WeeklyDigestExtra = { previousLeads: null, topSources: [], quotes: null, views: null, suggestion: null };

describe("weekly digest numbers", () => {
  it("counts only recorded lead sources, most common first, max three", () => {
    const out = topLeadSources([
      { source: "Google" }, { source: "google " }, { source: "Facebook" }, { source: null }, { source: "  " },
      { source: "Referral" }, { source: "Flyer" },
    ]);
    expect(out[0]).toEqual({ source: "google", count: 2 });
    expect(out).toHaveLength(3);
    expect(out.some((s) => s.source === "")).toBe(false);
  });

  it("totals quote lines only for this week's quotes, and says null when nothing is priced", () => {
    const quotes = [{ id: "q1", created_at: "t" }];
    expect(quoteValue(quotes, [{ quote_id: "q1", quantity: 2, unit_price: "50" }, { quote_id: "other", quantity: 1, unit_price: 999 }])).toBe(100);
    expect(quoteValue(quotes, [])).toBeNull();
    expect(quoteValue(quotes, [{ quote_id: "q1", quantity: 1, unit_price: 0 }])).toBeNull();
    expect(quoteValue(quotes, [{ quote_id: "q1", quantity: "x", unit_price: 5 }])).toBeNull();
  });

  it("splits page views by week and counts distinct visitors", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    const day = 86_400_000;
    const at = (d: number) => new Date(now - d * day).toISOString();
    const out = weekViews(
      [
        { session_id: "a", created_at: at(1) }, { session_id: "a", created_at: at(2) }, { session_id: "b", created_at: at(3) },
        { session_id: null, created_at: at(4) }, { session_id: "c", created_at: at(9) }, { session_id: "d", created_at: at(20) },
      ],
      now,
    );
    expect(out).toEqual({ thisWeek: 4, visitors: 2, previous: 1 });
  });

  it("compares with last week only when last week had data", () => {
    expect(weekTrend(5, 3)).toBe("up 2 from last week");
    expect(weekTrend(1, 4)).toBe("down 3 from last week");
    expect(weekTrend(2, 2)).toBe("the same as last week");
    expect(weekTrend(2, 0)).toBeNull();
    expect(weekTrend(2, null)).toBeNull();
  });
});

describe("weekly digest section", () => {
  it("is empty when the extras could not be read", () => {
    expect(weeklyDigestSection(null, 3)).toBe("");
    expect(weeklyDigestSection(undefined, 3)).toBe("");
  });

  it("never invents a number: untracked things say so, absent things are left out", () => {
    const text = weeklyDigestSection({ ...base, views: { thisWeek: 0, visitors: 0, previous: 0 } }, 0);
    expect(text).toContain("Website visits: none recorded this week");
    expect(text).toContain("Form completion rate: not tracked yet");
    expect(text).not.toContain("Quotes");
    expect(text).not.toContain("came from");
    expect(text).not.toContain("up ");
  });

  it("writes real numbers and one suggestion that needs the owner's approval", () => {
    const text = weeklyDigestSection(
      {
        previousLeads: 2,
        topSources: [{ source: "google", count: 3 }],
        quotes: { created: 2, acceptedThisWeek: 1, value: 1250 },
        views: { thisWeek: 40, visitors: 12, previous: 30 },
        suggestion: { title: "Answer 3 waiting leads", body: "They have waited over a day." },
      },
      5,
    );
    expect(text).toContain("up 3 from last week");
    expect(text).toContain("google (3)");
    expect(text).toContain("Quotes made: 2, $1,250 in total");
    expect(text).toContain("Quotes accepted: 1");
    expect(text).toContain("40 from 12 visitors (up 10 from last week)");
    expect(text).toContain("One thing worth doing: Answer 3 waiting leads. They have waited over a day.");
    expect(text).toContain("Nothing happens until you approve it");
  });

  it("omits quote lines when there were no quotes", () => {
    const text = weeklyDigestSection({ ...base, quotes: { created: 0, acceptedThisWeek: 0, value: null } }, 1);
    expect(text).not.toContain("Quotes");
  });
});

describe("B13-7 site search health", () => {
  it("counts only what the saved audit recorded", () => {
    const seo = seoFromAudit({
      reachable: true, p1_count: 1, p2_count: 1, audited_at: "2026-11-04T10:00:00Z",
      findings: [{ check: "title" }, { check: "broken-link" }, { check: "broken-link" }],
    });
    expect(seo).toMatchObject({ missingTitles: 1, brokenLinks: 2, p1: 1, p2: 1 });
    expect(seoFromAudit(null)).toBeNull();
    expect(seoFromAudit({ reachable: true, p1_count: null, p2_count: null, findings: "bad", audited_at: "2026-11-04T10:00:00Z" })).toMatchObject({ missingTitles: 0, brokenLinks: 0, p1: 0 });
  });

  it("says not tracked yet without an audit, and never claims sitemap or speed numbers", () => {
    const none = seoSection(null);
    expect(none).toContain("Site check: not tracked yet");
    expect(none).toContain("Sitemap, indexed pages and page speed: not tracked yet");
    const down = seoSection({ auditedAt: "2026-11-04T10:00:00Z", reachable: false, missingTitles: 0, brokenLinks: 0, p1: 0, p2: 0 });
    expect(down).toContain("did not load");
    expect(down).not.toContain("Broken links");
    const ok = seoSection({ auditedAt: "2026-11-04T10:00:00Z", reachable: true, missingTitles: 1, brokenLinks: 2, p1: 1, p2: 2 });
    expect(ok).toContain("3 issues found");
    expect(ok).toContain("Broken links: 2");
  });
});
