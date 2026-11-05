import { describe, expect, it } from "vitest";
import {
  buildOpsStatsTrends,
  dailyBuckets,
  seriesFromTimestamps,
  sumBuckets,
  trendTotalLabel,
} from "./ops-stats-trends";

const NOW = Date.parse("2026-11-05T12:00:00Z");

describe("dailyBuckets", () => {
  it("places timestamps into rolling day buckets, oldest first", () => {
    const stamps = [
      new Date(NOW - 0.5 * 86_400_000).toISOString(), // today bucket
      new Date(NOW - 1.5 * 86_400_000).toISOString(), // yesterday
      new Date(NOW - 1.6 * 86_400_000).toISOString(), // yesterday again
      new Date(NOW - 10 * 86_400_000).toISOString(), // outside 7d
    ];
    expect(dailyBuckets(stamps, NOW, 7)).toEqual([0, 0, 0, 0, 0, 2, 1]);
  });

  it("ignores invalid or future timestamps", () => {
    expect(dailyBuckets(["nope", new Date(NOW + 60_000).toISOString()], NOW, 3)).toEqual([0, 0, 0]);
  });
});

describe("seriesFromTimestamps", () => {
  it("returns null series when the source was unreadable", () => {
    const series = seriesFromTimestamps("leads", null, NOW);
    expect(series.days7).toBeNull();
    expect(series.n30).toBeNull();
    expect(trendTotalLabel(series.n7, false)).toBe("not measured");
  });

  it("sums N across the window and marks empty measured series as zero, not unreadable", () => {
    const series = seriesFromTimestamps("buildsOk", [], NOW);
    expect(series.days7).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(series.n7).toBe(0);
    expect(sumBuckets(series.days30)).toBe(0);
    expect(trendTotalLabel(0, false)).toBe("0 (N=0)");
  });
});

describe("buildOpsStatsTrends", () => {
  it("builds all five series and preserves a capped floor flag", () => {
    const stamp = new Date(NOW - 2 * 86_400_000).toISOString();
    const trends = buildOpsStatsTrends({
      buildsOk: [stamp, stamp],
      buildsFailed: null,
      leads: [stamp],
      trials: [],
      approvalsWaited: [stamp],
      caps: { buildsOk: true },
      checkedAt: new Date(NOW).toISOString(),
      now: NOW,
    });
    expect(trends.series).toHaveLength(5);
    expect(trends.series.find((s) => s.key === "buildsOk")?.n7).toBe(2);
    expect(trends.series.find((s) => s.key === "buildsOk")?.capped).toBe(true);
    expect(trends.series.find((s) => s.key === "buildsFailed")?.days7).toBeNull();
    expect(trendTotalLabel(2, true)).toBe("2+ (N≥2)");
  });
});
