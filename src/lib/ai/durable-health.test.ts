/**
 * The shared (cross-worker) free-AI usage and health state.
 *
 * What matters here is not the database call itself but the promises around it:
 * it may only ever add caution, an unreachable store must never break a build,
 * and the counters must be read against today's date.
 *
 * ISOLATION: these tests never reach a real database. The service-role client
 * is replaced by an in-memory emulation of the runtime RPCs, and the shared
 * provider environment helper stubs HTTP, so a run with deployment credentials
 * present can no longer write a probe row into production telemetry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";

type Row = {
  provider: string;
  day: string;
  used: number;
  failures: number;
  open_until: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_latency_ms: number | null;
  rate_limited_at: string | null;
};

const db = vi.hoisted(() => ({ rows: new Map<string, Row>(), calls: [] as { fn: string; args: unknown }[] }));

/** Mirrors supabase/migrations/20260920125841 (ai_note_provider_result & co). */
function fakeRpc(fn: string, args: Record<string, unknown> = {}) {
  db.calls.push({ fn, args });
  const today = new Date().toISOString().slice(0, 10);
  const key = String(args["_provider"] ?? "").trim().slice(0, 40);
  const blank = (): Row => ({
    provider: key, day: today, used: 0, failures: 0, open_until: null, last_success_at: null,
    last_failure_at: null, last_latency_ms: null, rate_limited_at: null,
  });
  if (fn === "ai_runtime_snapshot") return { data: [...db.rows.values()], error: null };
  if (fn === "ai_note_free_use") {
    const row = db.rows.get(key) ?? blank();
    row.used = row.day === today ? row.used + 1 : 1;
    row.day = today;
    db.rows.set(key, row);
    const cap = args["_cap"] as number | undefined;
    return { data: cap ? Math.max(0, cap - row.used) : null, error: null };
  }
  if (fn === "ai_note_provider_result") {
    const existing = db.rows.get(key);
    const row = existing ?? blank();
    const ok = args["_ok"] === true;
    const threshold = Math.max(1, Number(args["_failure_threshold"] ?? 3));
    const cooldown = Math.max(1, Math.min(3600, Number(args["_cooldown_seconds"] ?? 60)));
    const now = new Date();
    if (!existing) {
      row.failures = ok ? 0 : 1;
    } else if (ok) {
      row.failures = 0;
      row.open_until = null;
    } else if (row.failures + 1 >= threshold) {
      row.failures = 0;
      row.open_until = new Date(now.getTime() + cooldown * 1000).toISOString();
    } else {
      row.failures += 1;
    }
    if (ok) row.last_success_at = now.toISOString();
    else row.last_failure_at = now.toISOString();
    db.rows.set(key, row);
    return { data: { ...row }, error: null };
  }
  return { data: null, error: { message: `unknown rpc ${fn}` } };
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: async (fn: string, args?: Record<string, unknown>) => fakeRpc(fn, args) },
}));

import {
  durableBudgetExhausted,
  durableBudgetRemaining,
  durableModelKey,
  durableModelResting,
  durablePaidDegraded,
  durablePaidKey,
  durableProviderResting,
  durableRuntimeFor,
  durableRuntimeSnapshot,
  MODEL_GONE_REST_MS,
  noteDurableFreeUse,
  noteDurableModelFailure,
  noteDurableModelSuccess,
  noteDurableProviderResult,
  refreshDurableRuntime,
  resetDurableRuntimeCache,
} from "@/lib/ai/durable-health.server";

describe("shared free-AI usage and health state", () => {
  beforeEach(() => {
    isolateProviderEnvironment();
    db.rows.clear();
    db.calls.length = 0;
    resetDurableRuntimeCache();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("knows nothing until something is recorded, and treats that as permissive", () => {
    expect(durableRuntimeSnapshot()).toEqual([]);
    expect(durableRuntimeFor("groq")).toBeNull();
    expect(durableProviderResting("groq")).toBe(false);
    expect(durableBudgetExhausted("groq", 100)).toBe(false);
    expect(durableBudgetRemaining("groq", 100)).toBeNull();
  });

  it("records through the (emulated) shared store without any HTTP request", async () => {
    const probe = "vitest-probe";
    await expect(refreshDurableRuntime(true)).resolves.toBeInstanceOf(Map);
    await expect(noteDurableFreeUse(probe, 100_000)).resolves.toBe(99_999);
    const result = await noteDurableProviderResult({ provider: probe, ok: true, latencyMs: 12 });
    expect(result?.provider).toBe(probe);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Unknown state must never block a free call (live providers may really be exhausted).
    expect(durableBudgetExhausted("vitest-never-recorded", 100)).toBe(false);
  });

  it("reports a provider with no cap as uncapped, never exhausted", () => {
    expect(durableBudgetRemaining("groq", null)).toBeNull();
    expect(durableBudgetExhausted("groq", null)).toBe(false);
    expect(durableBudgetRemaining("groq", 0)).toBeNull();
  });

  it("collapses concurrent refreshes into one read", async () => {
    const [a, b, c] = await Promise.all([
      refreshDurableRuntime(true),
      refreshDurableRuntime(true),
      refreshDurableRuntime(true),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(db.calls.filter((call) => call.fn === "ai_runtime_snapshot")).toHaveLength(1);
  });
});

describe("model-scoped shared records", () => {
  beforeEach(() => {
    isolateProviderEnvironment();
    db.rows.clear();
    db.calls.length = 0;
    resetDurableRuntimeCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keys fit the 40-character runtime column and differ per model and record", () => {
    const long = "@cf/meta/llama-3.2-11b-vision-instruct-with-a-very-long-suffix";
    const gone = durableModelKey("gone", "cloudflare", long);
    expect(gone.length).toBeLessThanOrEqual(40);
    expect(gone).not.toBe(durableModelKey("rest", "cloudflare", long));
    expect(gone).not.toBe(durableModelKey("gone", "cloudflare", `${long}-2`));
    expect(durableModelKey("gone", "cloudflare", long)).toBe(gone);
    expect(durablePaidKey("openai")).toBe("paid:openai");
  });

  it("skips a model for 24h after 3 consecutive model-missing answers, without resting the provider", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    for (let strike = 1; strike <= 2; strike += 1) {
      await noteDurableModelFailure({ provider: "nvidia", model: "nemotron-4-340b", record: "gone" });
      expect(durableModelResting("nvidia", "nemotron-4-340b")).toBe(false);
    }
    await noteDurableModelFailure({ provider: "nvidia", model: "nemotron-4-340b", record: "gone" });
    expect(durableModelResting("nvidia", "nemotron-4-340b")).toBe(true);
    expect(durableModelResting("nvidia", "meta/llama-3.2-11b-vision-instruct")).toBe(false);
    expect(durableProviderResting("nvidia")).toBe(false);

    // Past the database's one-hour rest the model is still skipped (another worker reads it too)...
    vi.setSystemTime(new Date("2026-10-21T20:00:00Z"));
    resetDurableRuntimeCache();
    await refreshDurableRuntime(true);
    expect(durableModelResting("nvidia", "nemotron-4-340b")).toBe(true);
    // ...and offered again once the 24 hours are over.
    vi.setSystemTime(new Date(Date.parse("2026-10-21T10:00:00Z") + MODEL_GONE_REST_MS + 60_000));
    expect(durableModelResting("nvidia", "nemotron-4-340b")).toBe(false);
  });

  it("a success clears a model's failures, and a clean model costs no extra write", async () => {
    await noteDurableModelFailure({ provider: "mistral", model: "mistral-small-latest", record: "gone" });
    await noteDurableModelFailure({ provider: "mistral", model: "mistral-small-latest", record: "gone" });
    const writesBefore = db.calls.length;
    noteDurableModelSuccess("mistral", "mistral-small-latest");
    await vi.waitFor(() => expect(db.calls.length).toBe(writesBefore + 1));
    expect(db.rows.get(durableModelKey("gone", "mistral", "mistral-small-latest"))?.failures).toBe(0);

    const clean = db.calls.length;
    noteDurableModelSuccess("mistral", "never-failed");
    expect(db.calls.length).toBe(clean);
  });

  it("rests a rate-limited model for a minute after 3 strikes, never the provider", async () => {
    for (let strike = 0; strike < 3; strike += 1)
      await noteDurableModelFailure({ provider: "cerebras", model: "gpt-oss-120b", record: "rest", rateLimited: true });
    expect(durableModelResting("cerebras", "gpt-oss-120b")).toBe(true);
    expect(durableModelResting("cerebras", "qwen-3-235b")).toBe(false);
    expect(durableProviderResting("cerebras")).toBe(false);
  });

  it("shares a paid account's degraded state with every worker", async () => {
    expect(durablePaidDegraded("openai")).toBe(false);
    // As in SQL, the very first row is created closed; the next refusal opens it.
    await noteDurableProviderResult({ provider: durablePaidKey("openai"), ok: false, failureThreshold: 1, cooldownSeconds: 3600 });
    await noteDurableProviderResult({ provider: durablePaidKey("openai"), ok: false, failureThreshold: 1, cooldownSeconds: 3600 });
    // A fresh worker: no local memory, only the shared snapshot.
    resetDurableRuntimeCache();
    await refreshDurableRuntime(true);
    expect(durablePaidDegraded("openai")).toBe(true);
    expect(durableProviderResting("openai")).toBe(false);
  });
});
