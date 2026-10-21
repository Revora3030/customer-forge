import { describe, expect, it } from "vitest";
import { buildPageSpeedUrl, PAGESPEED_TARGET, summarizePageSpeed } from "./jarvis-pagespeed";

describe("Jarvis Lighthouse audit", () => {
  it("only targets the fixed Revora homepage on mobile", () => {
    const u = new URL(buildPageSpeedUrl());
    expect(u.searchParams.get("url")).toBe(PAGESPEED_TARGET);
    expect(u.searchParams.get("strategy")).toBe("mobile");
    expect(u.searchParams.has("key")).toBe(false);
  });

  it("converts scores to 0-100 and keeps missing ones unknown", () => {
    const s = summarizePageSpeed({ lighthouseResult: { categories: { performance: { score: 0.73 }, seo: { score: 1 } }, audits: {
      "largest-contentful-paint": { displayValue: "3.1 s" },
      "unused-js": { title: "Reduce unused JavaScript", displayValue: "Est 200 KiB", score: 0.4, details: { type: "opportunity" } },
    } } });
    expect(s?.scores.performance).toBe(73);
    expect(s?.scores.seo).toBe(100);
    expect(s?.scores.accessibility).toBeNull();
    expect(s?.metrics["largest-contentful-paint"]).toBe("3.1 s");
    expect(s?.topOpportunities).toEqual(["Reduce unused JavaScript (Est 200 KiB)"]);
  });

  it("returns null for an unusable response", () => {
    expect(summarizePageSpeed({ error: "x" })).toBeNull();
  });
});
