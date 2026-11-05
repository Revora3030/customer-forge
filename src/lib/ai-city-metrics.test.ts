import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildSuccess, failuresByCause, formatRate, paidSpend } from "./ai-city-metrics";
import { CityMetrics } from "@/components/admin/city/CityMetrics";

const rows = [
  { status: "completed", failure_kind: null }, { status: "completed", failure_kind: null }, { status: "completed", failure_kind: null },
  { status: "failed", failure_kind: "credits" }, { status: "failed", failure_kind: "credits" }, { status: "failed", failure_kind: "timeout" }, { status: "failed", failure_kind: null },
  { status: "cancelled", failure_kind: null },
];

describe("ai city metrics", () => {
  it("rates finished builds only and reports N", () => {
    const s = buildSuccess(rows)!;
    expect(s).toMatchObject({ succeeded: 3, failed: 4, n: 7 });
    expect(formatRate(s)).toBe("42.9% (N=7)");
  });
  it("is not measured with no finished builds or an unreadable source", () => {
    expect(buildSuccess([])).toBeNull();
    expect(buildSuccess(null)).toBeNull();
    expect(formatRate(null)).toBe("not measured yet");
    expect(failuresByCause(null)).toBeNull();
    expect(paidSpend(null, 1, 1, "d")).toBeNull();
  });
  it("groups failures by recorded cause without guessing", () => {
    expect(failuresByCause(rows)).toEqual([{ cause: "credits", count: 2 }, { cause: "timeout", count: 1 }, { cause: "unrecorded", count: 1 }]);
  });
  it("splits settled spend from open reservations", () => {
    expect(paidSpend([{ actual_microcents: 150, estimate_microcents: 300, settled_at: "x" }, { actual_microcents: null, estimate_microcents: 50, settled_at: null }], 500, 100, "2026-11-05")).toEqual({ settledUsd: 1.5, openUsd: 0.5, capUsd: 5, day: "2026-11-05" });
  });
  it("renders not measured yet when nothing was read", () => {
    const html = renderToStaticMarkup(createElement(CityMetrics, { metrics: undefined, error: true }));
    expect(html.match(/not measured yet/g)?.length).toBe(4);
    expect(html).not.toMatch(/\d+%/);
  });
  it("renders measured values", () => {
    const html = renderToStaticMarkup(createElement(CityMetrics, { metrics: { checkedAt: "", queuedBuilds: 2, success: buildSuccess(rows), failuresByCause: failuresByCause(rows), paidSpend: { settledUsd: 1.5, openUsd: 0, capUsd: 5, day: "2026-11-05" } } }));
    expect(html).toContain("42.9% (N=7)");
    expect(html).toContain("$1.50 of $5.00 cap");
    expect(html).toContain("credits");
  });
});
