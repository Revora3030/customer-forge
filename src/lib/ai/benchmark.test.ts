import { describe, expect, it } from "vitest";

import { benchmarkOrder, scoreBenchmarkRows } from "@/lib/ai/benchmark.server";

function rows(count: number, overrides: Partial<{ ok: boolean; latency_ms: number }> = {}) {
  return Array.from({ length: count }, () => ({
    provider: "groq",
    model: "model-a",
    task: "site.plan",
    ok: overrides.ok ?? true,
    latency_ms: overrides.latency_ms ?? 900,
  }));
}

describe("model benchmarks", () => {
  it("returns nothing when there is no evidence", () => {
    expect(scoreBenchmarkRows([])).toEqual([]);
  });

  it("keeps a thin-evidence model unproven rather than judging it", () => {
    const [entry] = scoreBenchmarkRows(rows(3));
    expect(entry?.verdict).toBe("UNPROVEN");
    expect(entry?.weight).toBe(0);
  });

  it("marks a reliable fast model proven with a weight", () => {
    const [entry] = scoreBenchmarkRows(rows(12, { latency_ms: 600 }));
    expect(entry?.verdict).toBe("PROVEN");
    expect(entry?.reliability).toBe(1);
    expect(entry?.weight).toBeGreaterThan(0.9);
  });

  it("marks a measured-unreliable model degraded", () => {
    const mixed = [...rows(3), ...rows(9, { ok: false })];
    const [entry] = scoreBenchmarkRows(mixed);
    expect(entry?.verdict).toBe("DEGRADED");
    expect(entry?.reliability).toBeLessThan(0.6);
  });

  it("separates the same model per task family", () => {
    const scored = scoreBenchmarkRows([
      ...rows(10),
      ...rows(10).map((row) => ({ ...row, task: "copy.hero" })),
    ]);
    expect(scored).toHaveLength(2);
    expect(new Set(scored.map((entry) => entry.task))).toEqual(
      new Set(["site.plan", "copy.hero"]),
    );
  });

  it("prefers a faster model of equal reliability", () => {
    const scored = scoreBenchmarkRows([
      ...rows(10, { latency_ms: 500 }),
      ...rows(10, { latency_ms: 15_000 }).map((row) => ({ ...row, model: "model-slow" })),
    ]);
    expect(scored[0]?.model).toBe("model-a");
  });

  it("ranks unproven models between proven and degraded", () => {
    const scored = scoreBenchmarkRows([
      ...rows(10, { latency_ms: 500 }),
      ...rows(2).map((row) => ({ ...row, model: "model-new" })),
      ...rows(10, { ok: false }).map((row) => ({ ...row, model: "model-bad" })),
    ]);
    const order = benchmarkOrder(scored, "site.plan").map((entry) => entry.model);
    expect(order).toEqual(["model-a", "model-new", "model-bad"]);
  });

  it("ignores rows with no provider or model", () => {
    const scored = scoreBenchmarkRows([
      { provider: null, model: "x", task: "t", ok: true, latency_ms: 10 },
      { provider: "groq", model: null, task: "t", ok: true, latency_ms: 10 },
    ]);
    expect(scored).toEqual([]);
  });
});
