import { describe, expect, it } from "vitest";
import { summarizeModelUsage } from "./lovable-model-usage";

describe("summarizeModelUsage", () => {
  it("counts calls per model and lists unused roster models with zero", () => {
    const out = summarizeModelUsage(
      [
        { model: "anthropic/claude-sonnet-5", task: "builder-thinker.adversarial_review", ok: true, estimated_cost_usd: 0.01 },
        { model: "anthropic/claude-sonnet-5", task: "builder-thinker.adversarial_review", ok: false, estimated_cost_usd: null },
      ],
      ["anthropic/claude-sonnet-5", "google/gemini-4-argon"],
    );
    expect(out[0]).toMatchObject({ model: "anthropic/claude-sonnet-5", calls: 2, ok: 1, failed: 1, costUsd: 0.01, jobs: ["adversarial_review"] });
    expect(out[1]).toMatchObject({ model: "google/gemini-4-argon", calls: 0, costUsd: null });
  });
});

import { formatBuildDuration, summarizeBuildCosts } from "./lovable-model-usage";

describe("summarizeBuildCosts (per-build time and cost)", () => {
  const job = { id: "job-1", organization_id: "org-1", status: "completed", started_at: "2026-10-31T10:00:00Z", completed_at: "2026-10-31T10:04:12Z" };
  const ev = (org: string, at: string, cost: number | null, ok = true) => ({ organization_id: org, created_at: at, ok, estimated_cost_usd: cost });

  it("sums only this workspace's calls inside the build window and reports the duration", () => {
    const [row] = summarizeBuildCosts(
      [job],
      [
        ev("org-1", "2026-10-31T10:01:00Z", 0.02),
        ev("org-1", "2026-10-31T10:03:00Z", 0.03, false),
        ev("org-2", "2026-10-31T10:02:00Z", 9),
        ev("org-1", "2026-10-31T09:59:59Z", 9),
        ev("org-1", "2026-10-31T10:04:13Z", 9),
      ],
    )!;
    expect(row).toMatchObject({ jobId: "job-1", durationSeconds: 252, calls: 2, failedCalls: 1 });
    expect(row!.costUsd).toBeCloseTo(0.05, 6);
  });

  it("says cost is unknown (null) when no call recorded one, instead of $0", () => {
    const [row] = summarizeBuildCosts([job], [ev("org-1", "2026-10-31T10:01:00Z", null)]);
    expect(row).toMatchObject({ calls: 1, costUsd: null });
  });

  it("times a running build up to now, and a never-started build as unknown", () => {
    const running = { ...job, status: "processing", completed_at: null };
    const now = Date.parse("2026-10-31T10:01:30Z");
    expect(summarizeBuildCosts([running], [], now)[0]!.durationSeconds).toBe(90);
    expect(summarizeBuildCosts([{ ...job, started_at: null, completed_at: null }], [ev("org-1", "2026-10-31T10:01:00Z", 1)])[0]).toMatchObject({ durationSeconds: null, calls: 0, costUsd: null });
  });

  it("formats durations", () => {
    expect(formatBuildDuration(null)).toBe("—");
    expect(formatBuildDuration(42)).toBe("42 s");
    expect(formatBuildDuration(252)).toBe("4 min 12 s");
    expect(formatBuildDuration(3900)).toBe("1 h 5 min");
  });
});
