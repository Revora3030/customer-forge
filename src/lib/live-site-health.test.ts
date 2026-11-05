import { describe, expect, it } from "vitest";
import { checkOutcomes, healthSummary, HEALTH_STALE_MS } from "./live-site-health";
import type { ProbeResult } from "./site-monitor";

const ok: ProbeResult = { homeStatus: 200, homeError: null, certDaysLeft: 60, certError: null, sitemapStatus: 200, noindex: false };
const status = (p: ProbeResult, spikes: { message: string; today: number }[] | null = []) =>
  Object.fromEntries(checkOutcomes(p, spikes).map((o) => [o.check, o.status]));

describe("checkOutcomes (only what was measured)", () => {
  it("all five pass on a healthy probe", () => {
    expect(Object.values(status(ok))).toEqual(["pass", "pass", "pass", "pass", "pass"]);
  });
  it("an unreadable cert, an unread sitemap and a failed error query are not verified, never passed", () => {
    const s = status({ ...ok, certDaysLeft: null, sitemapStatus: null }, null);
    expect(s).toMatchObject({ https_cert: "not_verified", sitemap_missing: "not_verified", visitor_errors: "not_verified" });
  });
  it("a down site fails, and can't prove sitemap or indexability", () => {
    expect(status({ ...ok, homeStatus: null, homeError: "timeout" })).toMatchObject({ home_down: "fail", sitemap_missing: "not_verified", noindex_live: "not_verified" });
  });
  it("cert expiring soon, noindex, sitemap 404 and spikes fail", () => {
    expect(status({ ...ok, certDaysLeft: 3, noindex: true, sitemapStatus: 404 }, [{ message: "x", today: 9 }])).toMatchObject({
      https_cert: "fail", noindex_live: "fail", sitemap_missing: "fail", visitor_errors: "fail",
    });
  });
});

describe("healthSummary", () => {
  const now = Date.parse("2026-11-05T06:00:00Z");
  const at = new Date(now - 3600_000).toISOString();
  const all = (s: string) => ["home_down", "https_cert", "sitemap_missing", "noindex_live", "visitor_errors"].map((check) => ({ check, status: s, checkedAt: at }));

  it("healthy only when all 5 measured checks passed; the number is a count", () => {
    const h = healthSummary(all("pass"), now);
    expect(h).toMatchObject({ rating: "healthy", passed: 5, total: 5, lastCheckedAt: at });
  });
  it("missing checks are Not verified, not passed, and the site is not called healthy", () => {
    const h = healthSummary(all("pass").slice(0, 3), now);
    expect(h.passed).toBe(3);
    expect(h.rating).toBe("not_checked");
    expect(h.rows.slice(3).every((r) => r.status === "not_verified" && r.checkedAt === null)).toBe(true);
  });
  it("any problem means needs work", () => {
    const rows = all("pass");
    rows[2] = { ...rows[2]!, status: "fail" };
    expect(healthSummary(rows, now)).toMatchObject({ rating: "needs_work", passed: 4 });
  });
  it("stale or unknown results don't count as passes", () => {
    const old = new Date(now - HEALTH_STALE_MS - 1).toISOString();
    const h = healthSummary([...all("pass").slice(1).map((r) => ({ ...r, checkedAt: old })), { check: "home_down", status: "weird", checkedAt: at }], now);
    expect(h).toMatchObject({ rating: "not_checked", passed: 0, lastCheckedAt: null });
  });
  it("nothing measured: no number pretends otherwise", () => {
    expect(healthSummary([], now)).toMatchObject({ rating: "not_checked", passed: 0, lastCheckedAt: null });
  });
});
