/**
 * Daily paid-cap reservations must never leak.
 *
 * Router half: the paid-budget module is stubbed (no ledger writes) and HTTP
 * is stubbed; every reservation the router makes must be settled exactly once:
 * the real cost on success, 0 for a definite rejection or a pre-send failure,
 * and the estimate for a timeout/abort, network error or 5xx (maybe billed).
 *
 * Ledger half: the service-role client is replaced by an in-memory model of
 * ai_paid_budget_reserve_tracked / ai_paid_budget_settle_tracked (same
 * predicate as the migration), so the client's fail-closed handling, settle
 * retry and stale-window arguments are exercised without a database.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";

const MIGRATION = "supabase/migrations/20261021110000_ai_paid_spend_reservations.sql";

vi.mock("@/lib/ai/telemetry.server", () => ({
  recordAiEvent: vi.fn(async () => undefined),
  recordTeamStep: vi.fn(async () => undefined),
  checkAiLimits: vi.fn(async () => ({ allowed: true })),
}));

/* ------------------------------ in-memory ledger ----------------------------- */

type Row = { id: string; day: string; estimate: number; createdAt: number; settledAt: number | null; actual: number | null };
const ledger = {
  now: Date.now(),
  settled: 0,
  rows: [] as Row[],
  failReserve: false,
  failSettleTimes: 0,
  settleCalls: 0,
  reset() {
    this.now = Date.now();
    this.settled = 0;
    this.rows = [];
    this.failReserve = false;
    this.failSettleTimes = 0;
    this.settleCalls = 0;
  },
};
// The SQL takes the day-row lock before reading; a promise chain models it.
let lock: Promise<unknown> = Promise.resolve();
function serialised<T>(work: () => T): Promise<T> {
  const next = lock.then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return work();
  });
  lock = next.catch(() => undefined);
  return next;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (name: string, args: Record<string, unknown>) =>
      serialised(() => {
        if (name === "ai_paid_budget_reserve_tracked") {
          if (ledger.failReserve) return { data: null, error: { message: "connection refused" } };
          const estimate = Number(args["_estimate_microcents"]);
          const cap = Number(args["_cap_microcents"]);
          const staleMs = Math.max(Number(args["_stale_after_seconds"] ?? 900), 600) * 1000;
          const open = ledger.rows
            .filter((row) => row.settledAt === null && row.createdAt > ledger.now - staleMs)
            .reduce((sum, row) => sum + row.estimate, 0);
          if (cap === 0 || ledger.settled + open + estimate > cap)
            return { data: [{ allowed: false, reservation_id: null, day: "2026-10-21" }], error: null };
          const row: Row = { id: `r${ledger.rows.length + 1}`, day: "2026-10-21", estimate, createdAt: ledger.now, settledAt: null, actual: null };
          ledger.rows.push(row);
          return { data: [{ allowed: true, reservation_id: row.id, day: row.day }], error: null };
        }
        if (name === "ai_paid_budget_settle_tracked") {
          ledger.settleCalls += 1;
          if (ledger.failSettleTimes > 0) {
            ledger.failSettleTimes -= 1;
            return { data: null, error: { message: "timeout" } };
          }
          const row = ledger.rows.find((entry) => entry.id === args["_reservation_id"]);
          if (!row || row.settledAt !== null) return { data: false, error: null };
          row.settledAt = ledger.now;
          row.actual = Number(args["_actual_microcents"]);
          ledger.settled += row.actual;
          return { data: true, error: null };
        }
        return { data: null, error: { message: `unknown rpc ${name}` } };
      }),
  },
}));

async function budget() {
  return await import("@/lib/ai/paid-budget.server");
}

describe("paid reservation ledger (client side)", () => {
  beforeEach(() => {
    isolateProviderEnvironment();
    ledger.reset();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-test-service-role");
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "1");
    vi.stubEnv("AI_PAID_RESERVATION_STALE_MINUTES", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reserves a tracked row and settles it to the actual cost exactly once", async () => {
    const { reservePaidSpend, settlePaidSpend } = await budget();
    const reservation = await reservePaidSpend(40_000_000);
    expect(reservation).toMatchObject({ id: "r1", estimate: 40_000_000 });
    expect(await settlePaidSpend(reservation!, 3_000_000)).toBe(true);
    // A duplicate settle is a no-op on the database side.
    await settlePaidSpend(reservation!, 3_000_000);
    expect(ledger.settled).toBe(3_000_000);
    expect(ledger.rows[0]).toMatchObject({ actual: 3_000_000 });
  });

  it("a released reservation frees its budget for the next call", async () => {
    const { reservePaidSpend, settlePaidSpend } = await budget();
    const first = await reservePaidSpend(90_000_000);
    expect(await reservePaidSpend(20_000_000)).toBeNull();
    await settlePaidSpend(first!, 0);
    expect(await reservePaidSpend(20_000_000)).not.toBeNull();
  });

  it("a stale unsettled reservation (dead worker) stops counting toward the cap", async () => {
    const { reservePaidSpend, paidReservationStaleSeconds } = await budget();
    expect(paidReservationStaleSeconds()).toBe(15 * 60);
    expect(await reservePaidSpend(90_000_000)).not.toBeNull();
    expect(await reservePaidSpend(20_000_000)).toBeNull();
    ledger.now += 14 * 60_000;
    expect(await reservePaidSpend(20_000_000)).toBeNull();
    ledger.now += 2 * 60_000;
    expect(await reservePaidSpend(20_000_000)).not.toBeNull();
  });

  it("never lets the stale window drop below ten minutes", async () => {
    const { paidReservationStaleSeconds } = await budget();
    vi.stubEnv("AI_PAID_RESERVATION_STALE_MINUTES", "1");
    expect(paidReservationStaleSeconds()).toBe(600);
    vi.stubEnv("AI_PAID_RESERVATION_STALE_MINUTES", "30");
    expect(paidReservationStaleSeconds()).toBe(1800);
  });

  it("says why a reservation was refused: cap reached, ledger down, paid off or free-only", async () => {
    const { reservePaidSpendDetailed, resetPaidCapAlertForTests } = await budget();
    resetPaidCapAlertForTests();
    expect((await reservePaidSpendDetailed(2_000_000_000)).refusal).toBe("cap_reached");
    ledger.failReserve = true;
    expect((await reservePaidSpendDetailed(1_000)).refusal).toBe("ledger_unavailable");
    ledger.failReserve = false;
    const { withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
    expect((await withAiSpendScope({ freeOnly: true, reason: "demo_workspace" }, () => reservePaidSpendDetailed(1_000))).refusal).toBe("free_only");
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "0");
    expect((await reservePaidSpendDetailed(1_000)).refusal).toBe("cap_zero");
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "1");
    const ok = await reservePaidSpendDetailed(1_000);
    expect(ok.refusal).toBeNull();
    expect(ok.reservation?.id).toBeTruthy();
  });

  it("the cap resets at the next midnight UTC", async () => {
    const { secondsUntilPaidCapReset } = await budget();
    expect(secondsUntilPaidCapReset(Date.parse("2026-10-30T23:00:00Z"))).toBe(3600);
    expect(secondsUntilPaidCapReset(Date.parse("2026-10-30T23:59:59.500Z"))).toBe(60);
  });

  it("fails closed when the ledger errors or throws", async () => {
    const { reservePaidSpend } = await budget();
    ledger.failReserve = true;
    expect(await reservePaidSpend(1_000)).toBeNull();
  });

  it("retries a settle the ledger refused instead of dropping it", async () => {
    const { reservePaidSpend, settlePaidSpend } = await budget();
    const reservation = await reservePaidSpend(10_000_000);
    ledger.failSettleTimes = 2;
    expect(await settlePaidSpend(reservation!, 0)).toBe(true);
    expect(ledger.settleCalls).toBe(3);
    expect(ledger.rows[0]!.settledAt).not.toBeNull();
  });

  it("bills an unknown cost at the estimate, never as free", async () => {
    const { reservePaidSpend, settlePaidSpend } = await budget();
    const reservation = await reservePaidSpend(10_000_000);
    await settlePaidSpend(reservation!, Number.NaN);
    expect(ledger.settled).toBe(10_000_000);
  });

  it("concurrent reservations cannot together exceed the cap", async () => {
    const { reservePaidSpend } = await budget();
    const results = await Promise.all(Array.from({ length: 12 }, () => reservePaidSpend(15_000_000)));
    const granted = results.filter(Boolean).length;
    expect(granted).toBe(6);
    expect(ledger.rows.reduce((sum, row) => sum + row.estimate, 0)).toBeLessThanOrEqual(100_000_000);
  });

  it("free-only spend scopes never reach the ledger", async () => {
    const { reservePaidSpend } = await budget();
    const { withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
    const reserved = await withAiSpendScope({ freeOnly: true, reason: "demo_workspace" }, () => reservePaidSpend(1_000));
    expect(reserved).toBeNull();
    expect(ledger.rows).toHaveLength(0);
  });
});

describe("paid reservation migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("excludes stale open reservations with a time-bounded predicate", () => {
    expect(sql).toContain("AND r.settled_at IS NULL");
    expect(sql).toContain("AND r.created_at > clock_timestamp() - _stale;");
    expect(sql).toContain("IF _cap = 0 OR _settled + _open + _estimate > _cap THEN");
  });

  it("serialises on the day row and settles each reservation once", () => {
    expect(sql).toContain("WHERE b.day = _day\n  FOR UPDATE;");
    expect(sql).toContain("PERFORM 1 FROM public.ai_paid_daily_budget b WHERE b.day = _day FOR UPDATE;");
    expect(sql).toContain("AND r.settled_at IS NULL;\n  IF NOT FOUND THEN\n    RETURN FALSE;");
  });

  it("the legacy reserve counts open tracked reservations under the day row lock", () => {
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.ai_paid_budget_reserve(");
    const legacy = sql.slice(start, sql.indexOf("$$;", start));
    // Signature and return type unchanged, so old workers keep working.
    expect(legacy).toContain("_estimate_microcents BIGINT,\n  _cap_microcents BIGINT\n)");
    expect(legacy).toContain("RETURNS TABLE(allowed BOOLEAN, day DATE, spent_microcents BIGINT, cap_microcents BIGINT)");
    const lock = legacy.indexOf("WHERE b.day = _day\n  FOR UPDATE;");
    const open = legacy.indexOf("FROM public.ai_paid_spend_reservations r");
    const check = legacy.indexOf("IF _cap = 0 OR _settled + _open + _estimate > _cap THEN");
    expect(lock).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(lock);
    expect(check).toBeGreaterThan(open);
    expect(legacy).toContain("AND r.settled_at IS NULL");
    expect(legacy).toContain("AND r.created_at > clock_timestamp() - _stale;");
    expect(legacy).not.toContain("_spent + _estimate > _cap");
  });

  it("refuses the rollout mix that used to overshoot (340 settled + 600 open + 400 legacy > 1000)", () => {
    // The legacy predicate, as the migration now states it.
    const legacyAllows = (settled: number, open: number, estimate: number, cap: number) =>
      !(cap === 0 || settled + open + estimate > cap);
    expect(legacyAllows(340, 600, 400, 1000)).toBe(false);
    expect(legacyAllows(340, 600, 60, 1000)).toBe(true);
  });

  it("is idempotent and re-runnable", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.ai_paid_spend_reservations");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS ai_paid_spend_reservations_open_idx");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS settled_microcents");
    expect(sql).not.toMatch(/CREATE FUNCTION/);
  });

  it("is service-role only", () => {
    expect(sql).toContain("REVOKE ALL ON public.ai_paid_spend_reservations FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ai_paid_budget_reserve_tracked(BIGINT, BIGINT, INTEGER) TO service_role;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ai_paid_budget_settle_tracked(UUID, BIGINT) TO service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.ai_paid_budget_reserve_tracked(BIGINT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) TO service_role;");
    expect(sql).not.toMatch(/GRANT [^;]* TO (?:anon|authenticated|PUBLIC)/);
  });
});

/* ------------------------------- router side -------------------------------- */

describe("router settles every paid reservation", () => {
  const saved = { ...process.env };
  const reserve = vi.fn();
  const settle = vi.fn();
  const refusal = { value: "cap_reached" as "cap_reached" | "ledger_unavailable" };

  beforeEach(() => {
    isolateProviderEnvironment();
    vi.resetModules();
    refusal.value = "cap_reached";
    reserve.mockReset().mockImplementation(async (estimate: number) => ({ id: "res-1", day: "unit-test", estimate }));
    settle.mockReset().mockResolvedValue(true);
    vi.doMock("@/lib/ai/paid-budget.server", () => ({
      reservePaidSpend: reserve,
      reservePaidSpendDetailed: async (estimate: number) => {
        const reservation = await reserve(estimate);
        return reservation ? { reservation, refusal: null } : { reservation: null, refusal: refusal.value };
      },
      paidDailyCapUsd: () => 10,
      secondsUntilPaidCapReset: () => 3600,
      settlePaidSpend: settle,
      routerEstimate: () => 5_000,
      routerActual: (_model: string, input: number | null, output: number | null, fallback: number) =>
        input === null && output === null ? fallback : (input ?? 0) * 10 + (output ?? 0) * 100,
    }));
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    process.env["AI_LOVABLE_MODEL_PRIMARY"] = "openai/gpt-6.1-sol";
    process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "1";
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    vi.doUnmock("@/lib/ai/paid-budget.server");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function call() {
    const { generateText } = await import("@/lib/ai/router.server");
    return generateText({ task: "test.paid-cap", organizationId: null, userId: null }, { messages: [{ role: "user", content: "hello" }] });
  }

  it("settles to the actual cost on success, before the call returns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "paid answer" } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const result = await call();
    expect(result.text).toBe("paid answer");
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), 7 * 10 + 3 * 100);
  });

  it("tells the owner today's AI budget is used up instead of reporting an outage", async () => {
    reserve.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const error = await call().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "RevoraAiError", status: 402, category: "quota", provider: "lovable", retryAfterSeconds: 3600 });
    expect((error as Error).message).toContain("Today's AI budget ($10.00) is used up");
    expect((error as { retryable: boolean }).retryable).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });

  it("names an unreadable spend ledger plainly and keeps it retryable", async () => {
    reserve.mockResolvedValue(null);
    refusal.value = "ledger_unavailable";
    vi.stubGlobal("fetch", vi.fn());
    const error = await call().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "RevoraAiError", category: "provider_unavailable", provider: "lovable" });
    expect((error as Error).message).toContain("couldn't check today's AI budget");
    expect((error as { retryable: boolean }).retryable).toBe(true);
  });

  it("settles a 5xx at the reservation estimate (it may still be billed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 503 })));
    await expect(call()).rejects.toMatchObject({ name: "RevoraAiError" });
    expect(settle).toHaveBeenCalledTimes(reserve.mock.calls.length);
    expect(settle.mock.calls.every(([, actual]) => actual === 5_000)).toBe(true);
  });

  it("settles a timed-out (aborted) call at the estimate, never as free", async () => {
    process.env["AI_REQUEST_TIMEOUT_MS"] = "30";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: unknown, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
          }),
      ),
    );
    await expect(call()).rejects.toMatchObject({ name: "RevoraAiError", category: "timeout" });
    expect(reserve).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledTimes(reserve.mock.calls.length);
    expect(settle.mock.calls.every(([, actual]) => actual === 5_000)).toBe(true);
  });

  it("settles a network error after sending at the estimate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("socket hang up"); }));
    await expect(call()).rejects.toMatchObject({ name: "RevoraAiError" });
    expect(settle).toHaveBeenCalledTimes(reserve.mock.calls.length);
    expect(settle.mock.calls.every(([, actual]) => actual === 5_000)).toBe(true);
  });

  it("releases a definite 429 rejection at 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 })));
    await expect(call()).rejects.toMatchObject({ name: "RevoraAiError", category: "rate_limited" });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), 0);
  });

  it("releases a failure raised before the request left at 0", async () => {
    const fetchStub = vi.fn(async () => new Response("should not be called", { status: 500 }));
    vi.stubGlobal("fetch", fetchStub);
    const { generateText } = await import("@/lib/ai/router.server");
    // The OpenAI adapter refuses a video part while building the request body.
    await expect(
      generateText(
        { task: "test.paid-cap", organizationId: null, userId: null },
        { messages: [{ role: "user", content: [{ type: "text", text: "watch" }, { type: "video", dataUrl: "data:video/mp4;base64,AAAA", mimeType: "video/mp4" }] }] },
      ),
    ).rejects.toBeTruthy();
    expect(fetchStub).not.toHaveBeenCalled();
    expect(reserve).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledTimes(reserve.mock.calls.length);
    expect(settle.mock.calls.every(([, actual]) => actual === 0)).toBe(true);
  });

  it("charges each failure class correctly", async () => {
    const { paidFailureCharge } = await import("@/lib/ai/router.server");
    const { RevoraAiError, notConfigured } = await import("@/lib/ai/errors");
    for (const status of [400, 401, 403, 404, 413, 422, 429])
      expect(paidFailureCharge(new RevoraAiError(status, "rejected"), 5_000)).toBe(0);
    // Raised before the request left: nothing was sent, nothing is billed.
    expect(paidFailureCharge(notConfigured(), 5_000)).toBe(0);
    for (const status of [408, 500, 502, 503, 504])
      expect(paidFailureCharge(new RevoraAiError(status, "unknown outcome"), 5_000)).toBe(5_000);
  });

  it("skips a paid model without calling it when the cap refuses the reservation", async () => {
    reserve.mockResolvedValue(null);
    const fetchStub = vi.fn(async (_input: unknown) => new Response("should not be called", { status: 500 }));
    vi.stubGlobal("fetch", fetchStub);
    await expect(call()).rejects.toBeTruthy();
    expect(settle).not.toHaveBeenCalled();
    expect(fetchStub.mock.calls.some(([url]) => new URL(String(url)).hostname === "api.openai.com")).toBe(false);
  });

  it("free-only builds never reserve paid budget", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    const { withAiSpendScope } = await import("@/lib/ai/spend-scope.server");
    await expect(withAiSpendScope({ freeOnly: true, reason: "demo_workspace" }, () => call())).rejects.toBeTruthy();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("no longer settles fire-and-forget", () => {
    const router = readFileSync("src/lib/ai/router.server.ts", "utf8");
    expect(router).not.toContain("void settlePaidSpend");
    expect(router).toContain("if (paidReservation) await settlePaidSpend(paidReservation, paidActual);");
  });
});
