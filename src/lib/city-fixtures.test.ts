import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS, activityFeed, applyAcknowledged, attentionItems, districtCounts, districtFailureSummary, districtState, failedLabel, groupAttention, windowCapped } from "./ai-city";
import { NOT_MEASURED, buildSuccess, failuresByCause, formatRate } from "./ai-city-metrics";
import {
  FIXTURE_NOW as NOW, TEST_FIXTURE_LABEL, TITLE_PREFIX, allFailedSnapshot, allRunningSnapshot, emptySnapshot, hundredFailuresSnapshot, jobOutcomes,
  oneFailureSnapshot, quietSnapshot, truncatedSnapshot, unavailableSnapshot,
} from "./__fixtures__/city-demo-fixtures";

const allSnapshots = { quiet: quietSnapshot, empty: emptySnapshot, one: oneFailureSnapshot, hundred: hundredFailuresSnapshot, truncated: truncatedSnapshot, allFailed: allFailedSnapshot, running: allRunningSnapshot, unavailable: unavailableSnapshot };

describe("JC-64 fixture safety", () => {
  const srcRoot = resolve(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (name !== "node_modules") walk(path); } else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  walk(srcRoot);

  it("is imported only by test files", () => {
    expect(files.length).toBeGreaterThan(100); // the scan really walked src/
    const offenders = files
      .filter((file) => !/\.test\.(ts|tsx)$/.test(file) && !file.includes(`${join("lib", "__fixtures__")}`))
      .filter((file) => readFileSync(file, "utf8").includes("city-demo-fixtures"))
      .map((file) => file.replace(srcRoot, "src"));
    expect(offenders).toEqual([]);
  });

  it("labels every row so a leak is obvious", () => {
    expect(TEST_FIXTURE_LABEL).toBe("TEST FIXTURE");
    for (const [name, build] of Object.entries(allSnapshots)) {
      for (const source of Object.values(build().sources)) {
        for (const row of source.rows) expect(row.title, name).toContain(TITLE_PREFIX);
      }
    }
  });
});

describe("city logic against the fixtures", () => {
  it("all quiet: no attention, no failures, every district idle", () => {
    for (const snapshot of [quietSnapshot(), emptySnapshot()]) {
      expect(attentionItems(snapshot, NOW, 1000)).toEqual([]);
      for (const d of CITY_DISTRICTS) {
        expect(districtState(d.id, snapshot, NOW)).toBe("idle");
        expect(failedLabel(districtFailureSummary(snapshot, d.id, NOW))).toBe("0 failed");
      }
    }
  });

  it("zero rows is empty, not unavailable", () => {
    expect(districtCounts(emptySnapshot(), "factory", NOW)).toEqual({ running: 0, queued: 0, errors: 0, total: 0 });
    expect(districtCounts(undefined, "factory", NOW)).toBeNull();
  });

  it("one failure: singular copy and the district needs attention", () => {
    const snapshot = oneFailureSnapshot();
    expect(failedLabel(districtFailureSummary(snapshot, "factory", NOW))).toBe("1 failed · 1 cause");
    expect(districtState("factory", snapshot, NOW)).toBe("attention");
    expect(districtState("institute", snapshot, NOW)).toBe("idle");
    expect(attentionItems(snapshot, NOW, 1000)).toHaveLength(1);
  });

  it("one hundred failures: exact count, three problems, capped list stays bounded", () => {
    const snapshot = hundredFailuresSnapshot();
    const summary = districtFailureSummary(snapshot, "factory", NOW);
    expect(summary?.count).toBe(100);
    expect(summary?.capped).toBe(false);
    expect(summary?.groups).toHaveLength(3);
    expect(failedLabel(summary)).toBe("100 failed · 3 causes");
    expect(attentionItems(snapshot, NOW)).toHaveLength(30);
    expect(attentionItems(snapshot, NOW, 1000)).toHaveLength(100);
    expect(groupAttention(attentionItems(snapshot, NOW, 1000)).reduce((n, g) => n + g.count, 0)).toBe(100);
  });

  it("truncated feed: shows a plus sign because older failures may exist", () => {
    const snapshot = truncatedSnapshot();
    expect(windowCapped(snapshot.sources["jobs"], NOW)).toBe(true);
    expect(failedLabel(districtFailureSummary(snapshot, "factory", NOW))).toMatch(/^\d+\+ failed/);
    expect(windowCapped(snapshot.sources["events"], NOW)).toBe(false);
  });

  it("all failed: nothing reads as healthy or working", () => {
    const snapshot = allFailedSnapshot();
    for (const d of CITY_DISTRICTS) {
      const state = districtState(d.id, snapshot, NOW);
      expect(state).toBe("attention");
    }
    expect(attentionItems(snapshot, NOW, 1000).every((item) => item.kind === "failed")).toBe(true);
  });

  it("acknowledging everything clears the counts without deleting rows", () => {
    const snapshot = applyAcknowledged(allFailedSnapshot(), { all: NOW, groups: {} })!;
    expect(attentionItems(snapshot, NOW, 1000)).toEqual([]);
    expect(activityFeed(snapshot, { limit: 1000 }).length).toBeGreaterThan(0);
  });

  it("running rows with a fresh heartbeat make districts work", () => {
    const snapshot = allRunningSnapshot();
    for (const d of CITY_DISTRICTS) expect(districtState(d.id, snapshot, NOW)).toBe("working");
    // The same rows with a stale clock stop animating.
    expect(districtState("factory", snapshot, NOW + 60 * 60_000)).toBe("idle");
  });

  it("an unreadable source is unavailable, never healthy", () => {
    const snapshot = unavailableSnapshot();
    expect(districtState("factory", snapshot, NOW)).toBe("unavailable");
    expect(districtState("security", snapshot, NOW)).toBe("idle");
  });
});

describe("metrics against the fixtures", () => {
  it("no finished builds is not measured, not 0%", () => {
    expect(formatRate(buildSuccess(jobOutcomes.none))).toBe(NOT_MEASURED);
    expect(formatRate(buildSuccess(null))).toBe(NOT_MEASURED);
  });
  it("one failed build is 0% of N=1", () => {
    expect(formatRate(buildSuccess(jobOutcomes.oneFailed))).toBe("0% (N=1)");
  });
  it("hundred failures: unrecorded causes are named as such", () => {
    expect(buildSuccess(jobOutcomes.hundredFailed)).toMatchObject({ rate: 0, failed: 100, n: 100 });
    expect(failuresByCause(jobOutcomes.hundredFailed)).toEqual([{ cause: "provider", count: 75 }, { cause: "unrecorded", count: 25 }]);
  });
  it("all quiet is 100% of N=2", () => {
    expect(formatRate(buildSuccess(jobOutcomes.allQuiet))).toBe("100% (N=2)");
    expect(failuresByCause(jobOutcomes.allQuiet)).toEqual([]);
  });
});
