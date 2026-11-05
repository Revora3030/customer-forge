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

import { CAP_WARN_RATIO, METRICS_ROW_LIMIT, capLevel, metricExplainer } from "./ai-city-metrics";

const spendAt = (settledUsd: number, openUsd = 0, capUsd = 5) => ({ settledUsd, openUsd, capUsd, day: "2026-11-05" });
const full = (paidSpend: ReturnType<typeof spendAt> | null, success = buildSuccess(rows)) => ({ checkedAt: "", queuedBuilds: 1, success, failuresByCause: failuresByCause(rows), paidSpend });

describe("paid AI budget gauge (JC-23)", () => {
  it("is quiet below the warning share and warns at 80 percent, counting open reservations", () => {
    expect(CAP_WARN_RATIO).toBe(0.8);
    expect(capLevel(spendAt(3.9))?.level).toBe("ok");
    expect(capLevel(spendAt(4))).toMatchObject({ level: "warn" });
    expect(capLevel(spendAt(3, 1))?.level).toBe("warn");
    expect(capLevel(spendAt(4.5))?.label).toContain("90%");
  });
  it("says full at or over the cap", () => {
    expect(capLevel(spendAt(5))?.level).toBe("full");
    expect(capLevel(spendAt(4, 2))?.label).toMatch(/pauses until midnight UTC/);
  });
  it("shows no level when spend or cap is unknown, and a zero cap is not full", () => {
    expect(capLevel(null)).toBeNull();
    expect(capLevel(undefined)).toBeNull();
    expect(capLevel(spendAt(1, 0, 0))).toBeNull();
    expect(capLevel(spendAt(Number.NaN))).toBeNull();
  });
  it("renders the warning as text, not colour alone, and nothing when comfortably under", () => {
    const warn = renderToStaticMarkup(createElement(CityMetrics, { metrics: full(spendAt(4.2)) }));
    expect(warn).toContain('data-cap-level="warn"');
    expect(warn).toContain("84% of the daily cap used");
    expect(renderToStaticMarkup(createElement(CityMetrics, { metrics: full(spendAt(5)) }))).toContain('data-cap-level="full"');
    expect(renderToStaticMarkup(createElement(CityMetrics, { metrics: full(spendAt(1)) }))).not.toContain("data-cap-level");
    expect(renderToStaticMarkup(createElement(CityMetrics, { metrics: undefined, error: true }))).not.toContain("data-cap-level");
  });
});

describe("stats explain themselves (JC-51)", () => {
  it("gives every stat a how-this-is-measured note, even when nothing was read", () => {
    const html = renderToStaticMarkup(createElement(CityMetrics, { metrics: undefined, error: true }));
    expect(html.match(/How this is measured/g)?.length).toBe(4);
    expect(html).toContain("generation jobs whose status is queued");
    expect(html).toContain("It is not the Lovable credit balance");
  });
  it("states the window, what is left out, and the sample size meaning", () => {
    const text = metricExplainer("success", full(null));
    expect(text).toContain("last 7 days");
    expect(text).toContain("Cancelled");
    expect(text).toContain("N is the number");
    expect(metricExplainer("failures", full(null))).toContain("unrecorded");
  });
  it("flags a capped read as a floor", () => {
    const big = { rate: 0.5, succeeded: 5000, failed: 5000, n: METRICS_ROW_LIMIT, windowDays: 7 };
    expect(metricExplainer("success", full(null, big))).toContain("floor");
    expect(metricExplainer("success", full(null))).not.toContain("floor");
  });
});
