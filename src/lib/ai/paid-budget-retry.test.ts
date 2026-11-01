import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = { failures: 0, calls: 0, alerts: [] as Array<{ kind: string; marker: string }> };

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string) => {
      if (name !== "ai_paid_budget_reserve_tracked")
        return { data: null, error: { message: "unknown" } };
      state.calls += 1;
      if (state.failures > 0) {
        state.failures -= 1;
        return { data: null, error: { message: "connection reset" } };
      }
      return {
        data: [{ allowed: true, reservation_id: `r${state.calls}`, day: "2026-11-01" }],
        error: null,
      };
    },
  },
}));

vi.mock("@/lib/founder-alerts.server", () => ({
  sendFounderAlert: vi.fn(async (_db: unknown, alert: { kind: string; marker: string }) => {
    state.alerts.push({ kind: alert.kind, marker: alert.marker });
    return "sent";
  }),
}));

describe("paid budget reservation retry", () => {
  beforeEach(() => {
    state.failures = 0;
    state.calls = 0;
    state.alerts = [];
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-role");
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "1");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("retries one transient ledger error and then reserves, with no alert", async () => {
    const { reservePaidSpendDetailed, resetPaidCapAlertForTests } =
      await import("@/lib/ai/paid-budget.server");
    resetPaidCapAlertForTests();
    state.failures = 1;
    const result = await reservePaidSpendDetailed(1_000);
    expect(result.refusal).toBeNull();
    expect(result.reservation?.id).toBe("r2");
    expect(state.calls).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(state.alerts).toEqual([]);
  });

  it("fails closed after two errors and alerts the founder once per hour", async () => {
    const { reservePaidSpendDetailed, resetPaidCapAlertForTests } =
      await import("@/lib/ai/paid-budget.server");
    resetPaidCapAlertForTests();
    state.failures = 4;
    expect((await reservePaidSpendDetailed(1_000)).refusal).toBe("ledger_unavailable");
    expect((await reservePaidSpendDetailed(1_000)).refusal).toBe("ledger_unavailable");
    expect(state.calls).toBe(4);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.kind).toBe("ai_budget_ledger_unavailable");
    expect(state.alerts[0]!.marker).toMatch(/^ai-budget-ledger:\d{4}-\d{2}-\d{2}T\d{2}$/);
  });
});
