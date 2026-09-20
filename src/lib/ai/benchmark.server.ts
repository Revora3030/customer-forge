/**
 * MODEL BENCHMARK / ROLE WEIGHTS
 * ==============================
 *
 * Which free model is trusted with which specialist role is decided from
 * recorded evidence, never from a hardcoded favourite. This reads the platform's
 * own telemetry (`ai_usage_events`) and derives, per model and per task family,
 * a reliability score, a latency score and a sample count.
 *
 * Rules:
 * - A model with too few samples is UNPROVEN, not "bad": it keeps its normal
 *   place in the pool so it can earn evidence.
 * - No score is invented. When telemetry is unreachable the weights are empty
 *   and callers fall back to their existing ordering.
 * - No prompt text, answer text or credential is read or returned here.
 */

export type BenchmarkVerdict = "PROVEN" | "UNPROVEN" | "DEGRADED" | "NOT_VERIFIED";

export type ModelBenchmark = {
  provider: string;
  model: string;
  task: string;
  samples: number;
  successes: number;
  reliability: number;
  medianLatencyMs: number | null;
  /** 0..1 blend of reliability and latency, only meaningful when PROVEN. */
  weight: number;
  verdict: BenchmarkVerdict;
  evidence: "telemetry" | "none";
};

const MIN_SAMPLES = 8;
const LOOKBACK_DAYS = 14;
const MAX_ROWS = 5000;

type Row = {
  provider: string | null;
  model: string | null;
  task: string | null;
  ok: boolean | null;
  latency_ms: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}

/** Latency score: 1 at 500ms or faster, decaying to 0 by 20s. */
function latencyScore(ms: number | null): number {
  if (ms === null) return 0.5;
  if (ms <= 500) return 1;
  if (ms >= 20_000) return 0;
  return 1 - (ms - 500) / (20_000 - 500);
}

export function scoreBenchmarkRows(rows: Row[]): ModelBenchmark[] {
  const groups = new Map<
    string,
    { provider: string; model: string; task: string; ok: number; total: number; latencies: number[] }
  >();

  for (const row of rows) {
    const provider = row.provider?.trim();
    const model = row.model?.trim();
    if (!provider || !model) continue;
    const task = (row.task ?? "unknown").trim() || "unknown";
    const key = `${provider}::${model}::${task}`;
    const group =
      groups.get(key) ?? { provider, model, task, ok: 0, total: 0, latencies: [] as number[] };
    group.total += 1;
    if (row.ok) {
      group.ok += 1;
      if (typeof row.latency_ms === "number" && row.latency_ms >= 0) {
        group.latencies.push(row.latency_ms);
      }
    }
    groups.set(key, group);
  }

  const out: ModelBenchmark[] = [];
  for (const group of groups.values()) {
    const reliability = group.total > 0 ? group.ok / group.total : 0;
    const latency = median(group.latencies);
    const proven = group.total >= MIN_SAMPLES;
    const degraded = proven && reliability < 0.6;
    out.push({
      provider: group.provider,
      model: group.model,
      task: group.task,
      samples: group.total,
      successes: group.ok,
      reliability: Number(reliability.toFixed(3)),
      medianLatencyMs: latency,
      weight: proven ? Number((reliability * 0.75 + latencyScore(latency) * 0.25).toFixed(3)) : 0,
      verdict: degraded ? "DEGRADED" : proven ? "PROVEN" : "UNPROVEN",
      evidence: "telemetry",
    });
  }

  return out.sort((a, b) => b.weight - a.weight || b.samples - a.samples);
}

/**
 * Reads the last two weeks of recorded calls and derives role weights.
 * Returns an empty list (never throws) when telemetry cannot be read.
 */
export async function modelBenchmarks(): Promise<ModelBenchmark[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("ai_usage_events")
      .select("provider, model, task, ok, latency_ms")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error || !data) return [];
    return scoreBenchmarkRows(data as Row[]);
  } catch {
    return [];
  }
}

/**
 * Ordering hint for one task family: proven-strong models first, unproven kept
 * in the middle so they still get work, measured-weak models last. Models with
 * no evidence are simply absent — callers keep their own order for those.
 */
export function benchmarkOrder(
  benchmarks: ModelBenchmark[],
  task: string,
): { model: string; provider: string; weight: number; verdict: BenchmarkVerdict }[] {
  return benchmarks
    .filter((entry) => entry.task === task)
    .map((entry) => ({
      model: entry.model,
      provider: entry.provider,
      weight: entry.verdict === "UNPROVEN" ? 0.5 : entry.weight,
      verdict: entry.verdict,
    }))
    .sort((a, b) => b.weight - a.weight);
}
