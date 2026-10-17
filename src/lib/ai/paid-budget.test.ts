import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAID_DAILY_CAP_USD, paidDailyCapMicrocents, reservePaidSpend, routerActual, routerEstimate, tierForModel } from "@/lib/ai/paid-budget.server";
import { MICROCENTS_PER_DOLLAR } from "@/lib/ai/luna.server";

afterEach(() => vi.unstubAllEnvs());

describe("daily paid AI cap", () => {
  it("defaults to $5 a day, honours a set value and treats 0 as paid off", async () => {
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "");
    expect(paidDailyCapMicrocents()).toBe(DEFAULT_PAID_DAILY_CAP_USD * MICROCENTS_PER_DOLLAR);
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "12.5");
    expect(paidDailyCapMicrocents()).toBe(1_250_000_000);
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "nonsense");
    expect(paidDailyCapMicrocents()).toBe(DEFAULT_PAID_DAILY_CAP_USD * MICROCENTS_PER_DOLLAR);
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "0");
    expect(paidDailyCapMicrocents()).toBe(0);
    expect(await reservePaidSpend(1000)).toBeNull();
  });

  it("prices unknown paid models as the most expensive tier so the cap binds early", () => {
    expect(tierForModel("gpt-5.6-terra")).toBe("terra");
    expect(tierForModel("gpt-5.4-mini")).toBe("luna");
    expect(tierForModel("gpt-6-sol")).toBe("sol");
    expect(tierForModel("some-new-model")).toBe("sol");
    expect(routerEstimate("gpt-6-sol", 4000)).toBeGreaterThan(routerEstimate("gpt-5.4-mini", 4000));
    expect(routerActual("gpt-6-sol", null, null, 123)).toBe(123);
  });

  it("reserves before every paid router call and settles after, and covers every Luna lane", () => {
    const router = readFileSync("src/lib/ai/router.server.ts", "utf8");
    expect(router).toContain("paidReservation = await reservePaidSpend(routerEstimate(model, limits.maxOutputTokens));");
    expect(router).toContain("if (!paidReservation) continue;");
    expect(router).toContain("if (paidReservation && !paidSettled) void settlePaidSpend(paidReservation, 0);");
    const luna = readFileSync("src/lib/ai/luna.server.ts", "utf8");
    expect(luna).toContain("if (!(await reservePaidSpend(estimate))) {");
    const sql = readFileSync("supabase/migrations/20261017100000_ai_paid_daily_budget.sql", "utf8");
    expect(sql).toContain("IF _cap = 0 OR _spent + _estimate > _cap THEN");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.ai_paid_budget_reserve(BIGINT, BIGINT) TO service_role;");
  });
});
