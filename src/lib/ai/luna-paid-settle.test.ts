/**
 * The paid Luna lane must never count a possibly billed call as free.
 *
 * HTTP is stubbed, the monthly ledger is an in-memory stub of the service-role
 * client, and the daily paid cap module is mocked, so no provider call or
 * ledger write leaves the test. Every reservation settles exactly once: the
 * real cost on success, 0 for a definite rejection or a failure before the
 * request was sent, and the estimate for a timeout, abort, network error after
 * sending or 5xx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";

const paid = vi.hoisted(() => ({
  reserve: vi.fn(),
  settle: vi.fn(),
  monthlySettles: [] as number[],
}));

vi.mock("@/lib/ai/paid-budget.server", () => ({
  reservePaidSpend: paid.reserve,
  settlePaidSpend: paid.settle,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "luna_budget_reserve_tenant")
        return {
          data: [
            {
              allowed: true,
              spent_microcents: 0,
              cap_microcents: 1_000_000_000,
              calls: 0,
              tenant_spent_microcents: 0,
              tenant_cap_microcents: 1_000_000_000,
            },
          ],
          error: null,
        };
      if (name === "luna_budget_settle_tenant") {
        paid.monthlySettles.push(Number(args["_actual_microcents"]));
        return { data: null, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    },
    from: () => ({ insert: async () => ({ data: null, error: null }) }),
  },
}));

const REQUEST = { purpose: "plan_review", system: "You plan.", user: "Plan a bakery site." } as const;

async function luna() {
  return await import("@/lib/ai/luna.server");
}

function settledAmounts() {
  return paid.settle.mock.calls.map(([, actual]) => actual as number);
}

describe("paid Luna settlement", () => {
  beforeEach(() => {
    isolateProviderEnvironment();
    paid.monthlySettles = [];
    paid.reserve.mockReset().mockImplementation(async (estimate: number) => ({ id: "res-1", day: "unit-test", estimate }));
    paid.settle.mockReset().mockResolvedValue(true);
    vi.stubEnv("OPENAI_API_KEY", "unit-test-openai");
    vi.stubEnv("LUNA_ENABLED", undefined);
    vi.stubEnv("LUNA_BASE_URL", "https://luna.unit.test/v1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function estimateFor() {
    const { estimateMicrocents } = await luna();
    return estimateMicrocents(REQUEST.system.length + REQUEST.user.length, 900, "luna");
  }

  it("settles a timed-out call at the reservation estimate, never as free", async () => {
    vi.stubEnv("LUNA_TIMEOUT_MS", "1000");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: unknown, init?: { signal?: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
          }),
      ),
    );
    const { callLuna } = await luna();
    const result = await callLuna({ ...REQUEST });
    expect(result).toMatchObject({ ok: false, reason: "provider_unavailable" });
    const estimate = await estimateFor();
    expect(estimate).toBeGreaterThan(0);
    expect(settledAmounts()).toEqual([estimate]);
    expect(paid.monthlySettles).toEqual([estimate]);
  });

  it("settles a network error after sending at the estimate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("socket hang up"); }));
    const { callLuna } = await luna();
    await callLuna({ ...REQUEST });
    expect(settledAmounts()).toEqual([await estimateFor()]);
  });

  it("settles a 5xx at the estimate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream down", { status: 503 })));
    const { callLuna } = await luna();
    await callLuna({ ...REQUEST });
    expect(settledAmounts()).toEqual([await estimateFor()]);
  });

  it("releases a definite 429 rejection at 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 })));
    const { callLuna } = await luna();
    const result = await callLuna({ ...REQUEST });
    expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(settledAmounts()).toEqual([0]);
    expect(paid.monthlySettles).toEqual([0]);
  });

  it("releases a call cancelled before the request was sent at 0", async () => {
    const fetchStub = vi.fn(async () => new Response("should not be called", { status: 500 }));
    vi.stubGlobal("fetch", fetchStub);
    const controller = new AbortController();
    controller.abort(new Error("owner cancelled"));
    const { callLuna } = await luna();
    const result = await callLuna({ ...REQUEST, signal: controller.signal });
    expect(result).toMatchObject({ ok: false });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(settledAmounts()).toEqual([0]);
  });

  it("settles a success at the actual cost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "the plan" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 120, completion_tokens: 40 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { callLuna, costMicrocents } = await luna();
    const result = await callLuna({ ...REQUEST });
    expect(result).toMatchObject({ ok: true, text: "the plan" });
    const actual = costMicrocents({ inputTokens: 120, cachedInputTokens: 0, outputTokens: 40 }, "luna");
    expect(settledAmounts()).toEqual([actual]);
    expect(actual).not.toBe(await estimateFor());
  });
});
