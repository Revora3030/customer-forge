/**
 * B13-1 part 2: warn BEFORE the paid cap runs out, and pause (not fail) a
 * build when AI credits run out.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capacityPauseCopy,
  capacityWaitDetail,
  capacityWaitHeadline,
  capacityWaitState,
} from "@/lib/builder/capacity-wait";
import { classifyBuildFailure } from "@/lib/builder/build-failure";
import { capacityVerdict, MAX_CAPACITY_DEFERRALS } from "@/lib/site-engine.worker.server";
import { MICROCENTS_PER_DOLLAR } from "@/lib/ai/luna.server";

const rpc = vi.fn();
const sendFounderAlert = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/founder-alerts.server", () => ({
  sendFounderAlert: (...args: unknown[]) => sendFounderAlert(...args),
}));

import {
  PAID_CAP_WARN_RATIO,
  isNearDailyCap,
  reservePaidSpend,
  resetPaidCapAlertForTests,
} from "@/lib/ai/paid-budget.server";

const CAP = 5 * MICROCENTS_PER_DOLLAR;
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const row = (committed: number) => [
  {
    allowed: true,
    reservation_id: "r1",
    day: "2026-10-31",
    committed_microcents: committed,
    cap_microcents: CAP,
  },
];

describe("threshold warning before the daily paid cap", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
    vi.stubEnv("AI_PAID_DAILY_CAP_USD", "5");
    rpc.mockReset();
    sendFounderAlert.mockReset().mockResolvedValue("sent");
    resetPaidCapAlertForTests();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("warns at 80% of the cap, not before", () => {
    expect(PAID_CAP_WARN_RATIO).toBe(0.8);
    expect(isNearDailyCap(0.79 * CAP, CAP)).toBe(false);
    expect(isNearDailyCap(0.8 * CAP, CAP)).toBe(true);
    expect(isNearDailyCap(NaN, CAP)).toBe(false);
    expect(isNearDailyCap(1, 0)).toBe(false);
  });

  it("stays silent below the threshold", async () => {
    rpc.mockResolvedValue({ data: row(0.5 * CAP), error: null });
    expect(await reservePaidSpend(1000)).not.toBeNull();
    await flush();
    expect(sendFounderAlert).not.toHaveBeenCalled();
  });

  it("sends one email-only warning per day, through the founder-alert path, with an honest message", async () => {
    rpc.mockResolvedValue({ data: row(0.85 * CAP), error: null });
    await reservePaidSpend(1000);
    await reservePaidSpend(1000);
    await reservePaidSpend(1000);
    await flush();
    expect(sendFounderAlert).toHaveBeenCalledTimes(1);
    const alert = sendFounderAlert.mock.calls[0]![1] as {
      kind: string;
      marker: string;
      summary: string;
    };
    expect(alert).toMatchObject({
      kind: "ai_budget_warning",
      marker: "ai-budget-warning:2026-10-31",
    });
    expect(alert.summary).toMatch(/85%/);
    expect(alert.summary).toMatch(/not a reading of the Lovable credit balance/);
  });

  it("a refused (over-cap) reservation uses the existing 'used up' alert, not the warning", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          allowed: false,
          reservation_id: null,
          day: "2026-10-31",
          committed_microcents: CAP,
          cap_microcents: CAP,
        },
      ],
      error: null,
    });
    expect(await reservePaidSpend(1000)).toBeNull();
    await flush();
    const kinds = sendFounderAlert.mock.calls.map((call) => (call[1] as { kind: string }).kind);
    expect(kinds).toEqual(["ai_budget_reached"]);
  });

  it("never sends SMS: the alert path is email-only", () => {
    const source = readFileSync("src/lib/founder-alerts.server.ts", "utf8");
    expect(source).not.toMatch(/sendSms|twilio/i);
  });
});

describe("out of credits pauses the build instead of failing it", () => {
  const NOW = Date.parse("2026-10-31T10:00:00Z");

  it("a 402 is classified credits and is not retryable by the normal path", () => {
    const failure = classifyBuildFailure(new Error("payment required"), 402);
    expect(failure).toMatchObject({ kind: "credits", retryable: false });
  });

  it("the worker treats credits as a forced capacity deferral", () => {
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(worker).toContain(
      'forced: error instanceof AiCapacityParkError || failure.kind === "credits"',
    );
    expect(worker).toContain("capacityPauseCopy(failure.kind, deferral.summary, deferral.retryAt)");
    expect(worker).toContain("failure_kind: pause.failureKind");
  });

  it("a forced deferral parks one 402 (a single call) and stops after the maximum", () => {
    const one = [{ ok: false, error_category: "quota", provider: "lovable" }];
    expect(capacityVerdict(one, 0, NOW)).toBeNull();
    const parked = capacityVerdict(one, 0, NOW, { forced: true });
    expect(parked?.count).toBe(1);
    expect(parked!.retryAt.getTime()).toBeGreaterThan(NOW);
    expect(capacityVerdict(one, MAX_CAPACITY_DEFERRALS, NOW, { forced: true })).toBeNull();
  });

  it("says plainly that the build is paused, not failed, and will resume by itself", () => {
    const retryAt = new Date("2026-10-31T10:15:00Z");
    const copy = capacityPauseCopy(
      "credits",
      "1 of 1 AI calls were rate-limited or timed out",
      retryAt,
    );
    expect(copy.failureKind).toBe("credits");
    expect(copy.waitReason).toMatch(/paused, not failed/);
    expect(copy.waitReason).toMatch(/tries again by itself/);
    expect(copy.waitReason).not.toMatch(/rate-limited/);
    expect(copy.message).toContain("10:15 UTC");
  });

  it("other capacity pauses keep their existing wording and kind", () => {
    const copy = capacityPauseCopy(
      "provider",
      "9 of 12 AI calls were rate-limited or timed out",
      new Date("2026-10-31T10:15:00Z"),
    );
    expect(copy.failureKind).toBe("provider");
    expect(copy.message).toBe(
      "The Lovable AI team is busy or at the spending cap right now (9 of 12 AI calls were rate-limited or timed out). The build will retry automatically at 10:15 UTC.",
    );
  });

  it("the owner sees 'Paused, will resume' for a credits wait and the old headline otherwise", () => {
    const job = {
      status: "queued",
      resumes_at: "2026-10-31T10:15:00Z",
      wait_reason: "x",
      failure_kind: "credits",
    };
    const state = capacityWaitState(job, NOW)!;
    expect(state.kind).toBe("credits");
    expect(capacityWaitHeadline(state, "en-GB", "UTC")).toBe(
      "Paused, will resume — AI credits ran out. Next try about 10:15",
    );
    expect(capacityWaitDetail(state, "en-GB", "UTC")).toContain(
      "Finished work is saved and reused.",
    );
    const busy = capacityWaitState({ ...job, failure_kind: "provider" }, NOW)!;
    expect(capacityWaitHeadline(busy, "en-GB", "UTC")).toBe(
      "Waiting for AI capacity — resumes about 10:15",
    );
  });
});
