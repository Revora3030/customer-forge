import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BuildSpendLimitError,
  DEFAULT_BUILD_SPEND_CAP_USD,
  buildSpendCapMicrocents,
  buildSpendLimitMessage,
  overBuildSpendCap,
  readBuildSpendMicrocents,
} from "./build-spend";
import { classifyBuildFailure, describeBuildFailure } from "./build-failure";

const USD = 100_000_000; // microcents per dollar, as in luna.server

describe("one build's spending ceiling", () => {
  it("defaults to about three healthy builds: $6, against ~$1.90 for a good build and $2.41 for the failing one", () => {
    expect(DEFAULT_BUILD_SPEND_CAP_USD).toBe(6);
    expect(buildSpendCapMicrocents({})).toBe(6 * USD);
    // Real figures from the ledger: a completed build and the one that failed three times.
    expect(overBuildSpendCap(1.92 * USD, buildSpendCapMicrocents({}))).toBe(false);
    expect(overBuildSpendCap(2.41 * USD, buildSpendCapMicrocents({}))).toBe(false);
    expect(overBuildSpendCap(3.98 * USD, buildSpendCapMicrocents({}))).toBe(false);
  });

  it("stops at the ceiling, not after it", () => {
    expect(overBuildSpendCap(6 * USD - 1, 6 * USD)).toBe(false);
    expect(overBuildSpendCap(6 * USD, 6 * USD)).toBe(true);
    expect(overBuildSpendCap(9 * USD, 6 * USD)).toBe(true);
  });

  it("can be set, switched off on purpose, and never removed by a typo", () => {
    expect(buildSpendCapMicrocents({ BUILD_SPEND_CAP_USD: "3.5" })).toBe(3.5 * USD);
    expect(buildSpendCapMicrocents({ BUILD_SPEND_CAP_USD: " 10 " })).toBe(10 * USD);
    expect(buildSpendCapMicrocents({ BUILD_SPEND_CAP_USD: "0" })).toBe(0);
    expect(buildSpendCapMicrocents({ BUILD_SPEND_CAP_USD: "off" })).toBe(0);
    // Unreadable or negative values keep the default.
    for (const value of ["abc", "-2", "$5", "NaN", ""]) expect(buildSpendCapMicrocents({ BUILD_SPEND_CAP_USD: value }), value).toBe(6 * USD);
    // A ceiling of 0 means no limit, however much was spent.
    expect(overBuildSpendCap(1_000 * USD, 0)).toBe(false);
  });

  it("says plainly what happened, what it cost, that nothing was published, and that it can be started again", () => {
    const message = buildSpendLimitMessage(6.12 * USD, 6 * USD);
    expect(message).toContain("$6.00");
    expect(message).toContain("$6.12");
    expect(message).toContain("Nothing was published");
    expect(message).toContain("start it again");
    expect(new BuildSpendLimitError(6.12 * USD, 6 * USD).message).toBe(message);
  });

  it("is a failure of its own kind that is never retried", () => {
    const error = new BuildSpendLimitError(6.4 * USD, 6 * USD);
    expect(classifyBuildFailure(error)).toMatchObject({ kind: "budget", retryable: false });
    // Even though the text names pictures or providers elsewhere, the ceiling wins.
    expect(classifyBuildFailure(new Error(`${error.message} The AI providers did not answer in time.`)).kind).toBe("budget");
    const described = describeBuildFailure({ status: "failed", failure_kind: "budget" });
    expect(described?.label).toBe("Spending limit reached");
    expect(described?.message).toContain("Nothing was published");
  });
});

/** The ledger read: from("luna_usage_events").select().eq().gte().order().range(). */
function ledger(rows: unknown[] | null, error: unknown = null) {
  const seen: { table: string; org: string; since: string }[] = [];
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, org: string) => ({
          gte: (_c: string, since: string) => {
            seen.push({ table, org, since });
            return { order: () => ({ range: async (from: number, to: number) => ({ data: rows === null ? null : rows.slice(from, to + 1), error }) }) };
          },
        }),
      }),
    }),
  };
  return { db: db as never, seen };
}

describe("reading what a build has cost", () => {
  it("adds up the workspace's ledger since the build was asked for, text and pictures alike", async () => {
    const fake = ledger([{ cost_microcents: 82_000_000 }, { cost_microcents: "125000000" }, { cost_microcents: null }, { cost_microcents: 3_750_000 }]);
    const spent = await readBuildSpendMicrocents(fake.db, "workspace-a", "2026-10-28T15:44:40.274Z");
    expect(spent).toBe(82_000_000 + 125_000_000 + 3_750_000);
    expect(fake.seen).toEqual([{ table: "luna_usage_events", org: "workspace-a", since: "2026-10-28T15:44:40.274Z" }]);
  });

  it("reads every page of a long ledger", async () => {
    const rows = Array.from({ length: 2_500 }, () => ({ cost_microcents: 1_000 }));
    expect(await readBuildSpendMicrocents(ledger(rows).db, "workspace-a", "2026-10-28T00:00:00Z")).toBe(2_500_000);
  });

  it("returns null when the ledger cannot be read, so the guard never blocks on its own failure", async () => {
    expect(await readBuildSpendMicrocents(ledger(null, { message: "boom" }).db, "workspace-a", "2026-10-28T00:00:00Z")).toBeNull();
  });
});

describe("where the worker checks the ceiling", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");

  it("checks before an attempt, at the costly stage boundaries and after each picture", () => {
    expect(worker).toContain("await assertWithinBuildSpend();\n  noteStage(orgId, runId, WORKER_STAGE_LABELS[\"business\"]");
    expect(worker).toContain("if (SPEND_CHECKED_STEPS.has(key)) await assertWithinBuildSpend();");
    expect(worker).toMatch(/onShotDone: async \(\) => \{\s*await touchLease\(db, job\);\s*await assertWithinBuildSpend\(\);/);
  });

  it("never fails a build at the finish line over the ceiling", () => {
    const steps = /const SPEND_CHECKED_STEPS = new Set\(\[([^\]]*)\]\)/.exec(worker)?.[1] ?? "";
    for (const late of ["layout", "checks", "leads", "ready"]) expect(steps, late).not.toContain(`"${late}"`);
    expect(steps).toContain('"pictures"');
  });
});
