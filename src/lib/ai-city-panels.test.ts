import { describe, expect, it } from "vitest";
import {
  MEMORY_STALE_DAYS,
  buildGrowthFunnel,
  buildMemoryHealth,
  buildReleaseBoard,
  countLabel,
  errorGroupsLine,
  isStale,
  releaseVerdict,
  staleCutoff,
  summariseFunnelWindow,
} from "./ai-city-panels";

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);

describe("funnel summary (JC-25)", () => {
  it("maps visitors, accounts, trials and paid from the recorded funnel", () => {
    const window = summariseFunnelWindow(
      { days: 7, stages: [
        { key: "visitors", count: 120, rate: null },
        { key: "sessions", count: 150, rate: null },
        { key: "accounts", count: 6, rate: 5 },
        { key: "trials", count: 4, rate: 66.67 },
        { key: "paid", count: 1, rate: 25 },
      ] },
      7,
    );
    expect(window.available).toBe(true);
    expect(window.steps.map((s) => [s.key, s.count])).toEqual([["visitors", 120], ["accounts", 6], ["trials", 4], ["paid", 1]]);
  });

  it("keeps an unreadable stage null, never zero", () => {
    const window = summariseFunnelWindow({ days: 30, stages: [{ key: "visitors", count: null, rate: null }, { key: "accounts", count: 0, rate: null }] }, 30);
    expect(window.steps[0]!.count).toBeNull();
    expect(window.steps[1]!.count).toBe(0);
    expect(window.steps[3]!.count).toBeNull();
    expect(countLabel(null)).toBe("—");
  });

  it("marks a window with no funnel as unavailable", () => {
    expect(summariseFunnelWindow(null, 7).available).toBe(false);
    expect(summariseFunnelWindow({ days: 7, stages: [] }, 7).available).toBe(false);
  });

  it("returns every other count as null when nothing could be read", () => {
    const funnel = buildGrowthFunnel({ funnel7: null, funnel30: null, inboxTotal: null, inboxNeedsReview: null, inboxUnprocessed: null, demosFound: null, demosReady: null, approvals: null, checkedAt: "now" });
    expect(funnel.windows.map((w) => w.available)).toEqual([false, false]);
    expect(funnel.inbox).toEqual({ total: null, needsReview: null, unprocessed: null });
    expect(funnel.waiting).toEqual({ approvals: null, replyDrafts: null });
  });

  it("rejects negative or non-finite counts instead of showing them", () => {
    const funnel = buildGrowthFunnel({ funnel7: null, funnel30: null, inboxTotal: -1, inboxNeedsReview: Number.NaN, inboxUnprocessed: 2, demosFound: 3, demosReady: 1, approvals: 4, checkedAt: "now" });
    expect(funnel.inbox).toEqual({ total: null, needsReview: null, unprocessed: 2 });
    expect(funnel.demos).toEqual({ found: 3, ready: 1 });
    expect(funnel.waiting.approvals).toBe(4);
  });
});

describe("release board (JC-26)", () => {
  const run = (name: string, over: Partial<{ status: string; conclusion: string | null; commit: string | null }> = {}) => ({ name, status: "completed", conclusion: "success", commit: HEAD, url: null, ...over });

  it("passes only a successful run on the exact current commit", () => {
    expect(releaseVerdict(run("x"), HEAD)).toBe("passed");
    expect(releaseVerdict(run("x", { conclusion: "failure" }), HEAD)).toBe("failed");
    expect(releaseVerdict(run("x", { status: "in_progress", conclusion: null }), HEAD)).toBe("running");
    expect(releaseVerdict(run("x", { commit: OLD }), HEAD)).toBe("other_commit");
  });

  it("shows missing evidence as missing, never a pass", () => {
    expect(releaseVerdict(undefined, HEAD)).toBe("missing");
    expect(releaseVerdict(run("x"), null)).toBe("missing");
    const board = buildReleaseBoard({ evidence: null, contracts: null, checkedAt: "now" });
    expect(board.ci.readable).toBe(false);
    expect(board.ci.checks.every((c) => c.verdict === "missing")).toBe(true);
    expect(board.contracts.probed).toBe(false);
    expect(board.tenantIsolation.state).toBe("not_recorded");
  });

  it("binds verdicts to the current commit and lists the three gates", () => {
    const board = buildReleaseBoard({
      evidence: { status: "observed", branchHeadCommit: HEAD, runs: [run("Revora Quality Gate"), run("Revora Security Gate", { commit: OLD }), run("revora browser qa", { conclusion: "failure" })] },
      contracts: [{ table: "a", status: "query_contract_accepted", code: null }, { table: "b", status: "unavailable", code: "42703" }],
      checkedAt: "now",
    });
    expect(board.ci.checks.map((c) => c.verdict)).toEqual(["passed", "other_commit", "failed"]);
    expect(board.contracts).toMatchObject({ probed: true, accepted: 1, failed: 1, failedTables: ["b"] });
  });

  it("does not trust a malformed head commit", () => {
    const board = buildReleaseBoard({ evidence: { status: "observed", branchHeadCommit: "nope", runs: [run("Revora Quality Gate")] }, contracts: [], checkedAt: "now" });
    expect(board.ci.readable).toBe(false);
    expect(board.ci.checks[0]!.verdict).toBe("missing");
  });

  it("only reports a tenant-isolation result when one is recorded", () => {
    expect(buildReleaseBoard({ evidence: null, contracts: [], tenantIsolation: "passed", checkedAt: "now" }).tenantIsolation.state).toBe("passed");
  });

  it("words the error groups honestly", () => {
    expect(errorGroupsLine(null)).toMatch(/unavailable/);
    expect(errorGroupsLine({ count: 0, capped: false, groups: [] })).toMatch(/No open error groups/);
    expect(errorGroupsLine({ count: 100, capped: true, groups: [{ key: "k", label: "boom", count: 100, ageMs: 1 }] })).toBe("1 open error group · 100+ failures in the last 48 hours.");
  });
});

describe("memory health (JC-27)", () => {
  const NOW = Date.parse("2026-11-05T00:00:00Z");

  it("counts a note as stale only after the set age", () => {
    expect(isStale({ updated_at: new Date(NOW - 91 * 86_400_000).toISOString() }, NOW)).toBe(true);
    expect(isStale({ updated_at: new Date(NOW - 89 * 86_400_000).toISOString() }, NOW)).toBe(false);
    expect(isStale({ updated_at: null }, NOW)).toBe(false);
    expect(staleCutoff(NOW)).toBe(new Date(NOW - MEMORY_STALE_DAYS * 86_400_000).toISOString());
  });

  it("never reports contradictions as zero and keeps unreadable counts null", () => {
    const health = buildMemoryHealth({ saved: null, stale: 3, replaced: null, checkedAt: "now" });
    expect(health.saved).toBeNull();
    expect(health.stale).toBeNull();
    expect(health.replaced).toBeNull();
    expect(health.contradictions).toEqual({ recorded: false, flagged: null });
  });

  it("has no Review target until the memory manager exists", () => {
    expect(buildMemoryHealth({ saved: 5, stale: 1, replaced: 0, checkedAt: "now" }).managerRoute).toBeNull();
    expect(buildMemoryHealth({ saved: 5, stale: 1, replaced: 0, checkedAt: "now", managerRoute: "/admin/memory" }).managerRoute).toBe("/admin/memory");
  });
});
