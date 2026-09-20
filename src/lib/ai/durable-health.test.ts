/**
 * The shared (cross-worker) free-AI usage and health state.
 *
 * What matters here is not the database call itself but the promises around it:
 * it may only ever add caution, an unreachable store must never break a build,
 * and the counters must be read against today's date.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  durableBudgetExhausted,
  durableBudgetRemaining,
  durableProviderResting,
  durableRuntimeFor,
  durableRuntimeSnapshot,
  noteDurableFreeUse,
  noteDurableProviderResult,
  refreshDurableRuntime,
  resetDurableRuntimeCache,
} from "@/lib/ai/durable-health.server";

describe("shared free-AI usage and health state", () => {
  beforeEach(() => {
    resetDurableRuntimeCache();
  });

  it("knows nothing until something is recorded, and treats that as permissive", () => {
    expect(durableRuntimeSnapshot()).toEqual([]);
    expect(durableRuntimeFor("groq")).toBeNull();
    expect(durableProviderResting("groq")).toBe(false);
    expect(durableBudgetExhausted("groq", 100)).toBe(false);
    expect(durableBudgetRemaining("groq", 100)).toBeNull();
  });

  it("records without throwing, whether or not the shared store answers", async () => {
    // A real provider name is never used here: the test must not spend or skew
    // a live free allowance. Both outcomes are acceptable — a number when the
    // shared store answered, null when it could not be reached.
    const probe = "vitest-probe";
    await expect(refreshDurableRuntime(true)).resolves.toBeInstanceOf(Map);
    const remaining = await noteDurableFreeUse(probe, 100_000);
    expect(remaining === null || typeof remaining === "number").toBe(true);
    const result = await noteDurableProviderResult({ provider: probe, ok: true, latencyMs: 12 });
    expect(result === null || result.provider === probe).toBe(true);
    // Unknown or unreachable state must never block a free call.
    expect(durableBudgetExhausted("groq", 100)).toBe(false);
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
  });
});
