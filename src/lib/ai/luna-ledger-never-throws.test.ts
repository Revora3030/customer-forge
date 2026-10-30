/**
 * The paid thinker lane is documented "never throws": a ledger or usage-log
 * outage must fail closed (no paid call) or be logged, never escape as an
 * exception that turns a successful paid answer into a failed build step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = { rpcThrows: true, insertThrows: true, rpcCalls: [] as string[] };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string) => {
      state.rpcCalls.push(name);
      if (state.rpcThrows) throw new Error("connection reset");
      if (name === "luna_budget_reserve_tenant")
        return { data: [{ allowed: true, spent_microcents: 0, cap_microcents: 1, calls: 0, tenant_spent_microcents: 0, tenant_cap_microcents: 1 }], error: null };
      if (name === "ai_paid_budget_reserve_tracked") return { data: [{ allowed: false, reservation_id: null, day: "2026-10-30" }], error: null };
      return { data: null, error: null };
    },
    from: () => ({
      insert: async () => {
        if (state.insertThrows) throw new Error("insert timeout");
        return { error: { message: "rls" } };
      },
    }),
  },
}));

beforeEach(() => {
  state.rpcThrows = true;
  state.insertThrows = true;
  state.rpcCalls = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-role");
  vi.stubEnv("AI_PAID_DAILY_CAP_USD", "10");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Luna ledger calls never throw", () => {
  it("an unreachable monthly ledger refuses paid work instead of throwing", async () => {
    const { reserveBudget } = await import("@/lib/ai/luna.server");
    await expect(reserveBudget(1_000, null)).resolves.toBeNull();
  });

  it("a failed monthly release after a daily-cap refusal still reports the refusal", async () => {
    state.rpcThrows = false;
    const { reserveBudget } = await import("@/lib/ai/luna.server");
    const realRpc = (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as { rpc: (n: string) => Promise<unknown> };
    const original = realRpc.rpc;
    realRpc.rpc = async (name: string) => {
      if (name === "luna_budget_settle_tenant") throw new Error("release failed");
      return original(name);
    };
    try {
      const reservation = await reserveBudget(1_000, null);
      expect(reservation).toMatchObject({ allowed: false, dailyCapped: true, paid: null });
    } finally {
      realRpc.rpc = original;
    }
  });

  it("settle and usage logging swallow storage failures", async () => {
    const { recordUsage, settleBudget } = await import("@/lib/ai/luna.server");
    await expect(settleBudget(null, 1_000, 500, null)).resolves.toBeUndefined();
    const row = { organizationId: null, purpose: "creative_direction" as never, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, cost: 1, outcome: "succeeded" as const, reason: null };
    await expect(recordUsage(row)).resolves.toBeUndefined();
    state.insertThrows = false;
    await expect(recordUsage(row)).resolves.toBeUndefined();
  });
});
