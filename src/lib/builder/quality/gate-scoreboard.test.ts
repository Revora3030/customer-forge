import { describe, expect, it } from "vitest";
import { NOT_VERIFIED, buildScoreboard, formatGate, recentSitesFromJobs, type ScoreRow } from "./gate-scoreboard";

const row = (org: string, kind: string, score: number | null, passed: boolean | null, at: string, extra: Partial<ScoreRow> = {}): ScoreRow =>
  ({ organization_id: org, event_kind: kind, score, bar: 80, passed, gate_mode: kind === "publish_check" ? "warn" : null, failures: [], created_at: at, ...extra });

const SITES = [{ organizationId: "a", name: "Acme Plumbing", lastBuildAt: "2026-11-04T10:00:00Z" }, { organizationId: "b", name: "Bee Roofing", lastBuildAt: "2026-11-03T10:00:00Z" }, { organizationId: "c", name: null, lastBuildAt: null }];

describe("buildScoreboard", () => {
  it("copies the latest stored build and publish scores and never invents one", () => {
    const b = buildScoreboard({ sites: SITES, rows: [
      row("a", "build_score", 71, false, "2026-11-01T00:00:00Z"),
      row("a", "build_score", 86, true, "2026-11-04T00:00:00Z"),
      row("a", "publish_check", 84, true, "2026-11-04T01:00:00Z"),
      row("b", "publish_check", 62, false, "2026-11-03T00:00:00Z", { failures: [{ criterion: "mobile_390" }, { criterion: "blocker:tap" }, { criterion: "mobile_390" }] }),
      row("c", "gate_attempt", 90, true, "2026-11-03T00:00:00Z"),
    ] });
    const [a, bee, c] = b.sites;
    expect(a?.build?.score).toBe(86);
    expect(a?.publish?.score).toBe(84);
    expect(a?.verdict).toBe("passed");
    expect(bee?.build).toBeNull();
    expect(bee?.verdict).toBe("below_bar");
    expect(bee?.failing).toEqual(["mobile_390", "blocker:tap"]);
    // A gate attempt alone is not a finished score.
    expect(c?.verdict).toBe(NOT_VERIFIED);
    expect(c?.n).toBe(0);
    expect(b.measured).toEqual({ passed: 1, belowBar: 1, notVerified: 1 });
  });

  it("marks every site NOT_VERIFIED when the log cannot be read", () => {
    const b = buildScoreboard({ sites: SITES, rows: null });
    expect(b.logAvailable).toBe(false);
    expect(b.sites.every((s) => s.verdict === NOT_VERIFIED && s.build === null && s.publish === null)).toBe(true);
  });

  it("treats rows without a score or without a recorded pass/fail as unmeasured", () => {
    const b = buildScoreboard({ sites: SITES.slice(0, 1), rows: [row("a", "build_score", null, true, "2026-11-04T00:00:00Z"), row("a", "publish_check", 77, null, "2026-11-04T02:00:00Z")] });
    expect(b.sites[0]?.build).toBeNull();
    expect(b.sites[0]?.publish?.score).toBe(77);
    expect(b.sites[0]?.verdict).toBe(NOT_VERIFIED);
  });

  it("reports unreadable sites separately", () => {
    expect(buildScoreboard({ sites: null, rows: [] }).sitesAvailable).toBe(false);
  });
});

describe("helpers", () => {
  it("formats a stored result or says NOT_VERIFIED", () => {
    expect(formatGate(null)).toBe(NOT_VERIFIED);
    expect(formatGate({ score: 82.4, bar: 80, passed: true, at: "", mode: null })).toBe("82/100 (bar 80)");
  });

  it("lists one recent site per workspace, newest first, capped", () => {
    const sites = recentSitesFromJobs([
      { organization_id: "x", updated_at: "2026-11-01T00:00:00Z" },
      { organization_id: "y", updated_at: "2026-11-03T00:00:00Z" },
      { organization_id: "x", updated_at: "2026-11-04T00:00:00Z" },
      { organization_id: "z", updated_at: "2026-11-02T00:00:00Z" },
    ], new Map([["x", "Xeno"]]), 2);
    expect(sites).toEqual([{ organizationId: "x", name: "Xeno", lastBuildAt: "2026-11-04T00:00:00Z" }, { organizationId: "y", name: null, lastBuildAt: "2026-11-03T00:00:00Z" }]);
    expect(recentSitesFromJobs(null, null)).toBeNull();
  });
});
