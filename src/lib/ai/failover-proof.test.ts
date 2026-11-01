/**
 * B13-1 regression proof for model failover (no new provider, no new retry
 * logic: these pin what the router already does so it cannot quietly regress):
 *  - a 429 / 5xx on model A hands the SAME request to model B;
 *  - a 402 is classified as credits and is NOT retried or walked down the chain;
 *  - the paid budget cap still holds across the fallback;
 *  - the gateway credits stop alerts the super-admin once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";

const MODELS = "openai/gpt-6.1-sol,google/gemini-3.8-flash";

const reserve = vi.fn();
const settle = vi.fn();
const creditsAlert = vi.fn();

type Sent = { model: string; messages: unknown; response_format: unknown };
const sent: Sent[] = [];

function ok(text: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Scripts one HTTP answer per call, in order, and records what each call carried. */
function script(...answers: (() => Response)[]) {
  let call = 0;
  const fetchStub = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Sent;
    sent.push({ model: body.model, messages: body.messages, response_format: body.response_format });
    const answer = answers[Math.min(call, answers.length - 1)]!;
    call += 1;
    return answer();
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

describe("B13-1 model failover proof", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    isolateProviderEnvironment();
    vi.resetModules();
    sent.length = 0;
    reserve.mockReset().mockImplementation(async (estimate: number) => ({ id: `res-${reserve.mock.calls.length}`, day: "unit-test", estimate }));
    settle.mockReset().mockResolvedValue(true);
    creditsAlert.mockReset();
    vi.doMock("@/lib/ai/paid-budget.server", () => ({
      reservePaidSpend: reserve,
      reservePaidSpendDetailed: async (estimate: number) => {
        const reservation = await reserve(estimate);
        return reservation ? { reservation, refusal: null } : { reservation: null, refusal: "cap_reached" };
      },
      paidDailyCapUsd: () => 10,
      secondsUntilPaidCapReset: () => 3600,
      settlePaidSpend: settle,
      routerEstimate: () => 5_000,
      routerActual: (_model: string, input: number | null, output: number | null, fallback: number) =>
        input === null && output === null ? fallback : (input ?? 0) * 10 + (output ?? 0) * 100,
    }));
    vi.doMock("@/lib/ai/gateway-credits-alert.server", async () => {
      const real = await vi.importActual<typeof import("@/lib/ai/gateway-credits-alert.server")>("@/lib/ai/gateway-credits-alert.server");
      return { ...real, noteGatewayCreditsStop: (error: Parameters<typeof real.noteGatewayCreditsStop>[0]) => { if (real.isGatewayCreditsStop(error)) creditsAlert(error.status); } };
    });
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["LOVABLE_API_KEY"] = "test-lovable";
    process.env["AI_LOVABLE_MODEL_PRIMARY"] = MODELS;
    process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "1";
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    vi.doUnmock("@/lib/ai/paid-budget.server");
    vi.doUnmock("@/lib/ai/gateway-credits-alert.server");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function structured() {
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    return generateStructuredOutput(
      { task: "test.failover-proof", organizationId: null, userId: null },
      { messages: [{ role: "system", content: "Reply with JSON {\"headline\": string}." }, { role: "user", content: "Write a headline." }] },
    );
  }

  it.each([
    ["429", () => new Response(JSON.stringify({ error: { message: "slow down" } }), { status: 429 })],
    ["500", () => new Response("upstream error", { status: 500 })],
    ["503", () => new Response("upstream down", { status: 503 })],
  ])("a %s on model A falls back to model B with the same prompt and schema contract", async (_label, failure) => {
    script(failure, () => ok('{"headline":"Fixed fast"}'));
    const result = await structured();
    expect(result.data).toEqual({ headline: "Fixed fast" });
    expect(result.fallbackUsed).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.model).not.toBe(sent[1]!.model);
    expect(result.model).toBe(sent[1]!.model);
    // Same request: identical messages (system prompt included) and JSON response format.
    expect(sent[1]!.messages).toEqual(sent[0]!.messages);
    expect(sent[1]!.response_format).toEqual({ type: "json_object" });
    expect(sent[1]!.response_format).toEqual(sent[0]!.response_format);
  });

  it("a first-choice success does not mark a fallback", async () => {
    script(() => ok('{"headline":"First try"}'));
    const result = await structured();
    expect(result.fallbackUsed).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("a 402 is credits: one request, no retry storm, no walk down the chain, no charge", async () => {
    process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "3";
    const fetchStub = script(() => new Response(JSON.stringify({ error: { message: "Not enough credits" } }), { status: 402 }));
    const error = await structured().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "RevoraAiError", status: 402, category: "quota", provider: "lovable", retryable: false });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    // The refused call is released at 0: a 402 is never billed.
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ id: "res-1" }), 0);
    // The super-admin alert fires for it.
    expect(creditsAlert).toHaveBeenCalledWith(402);
  });

  it("a 429 or 5xx never raises the credits alert", async () => {
    script(() => new Response("busy", { status: 429 }), () => new Response("down", { status: 503 }));
    await structured().catch(() => undefined);
    expect(creditsAlert).not.toHaveBeenCalled();
  });

  it("an out-of-credits body on a 429 is also credits, and also stops after one request", async () => {
    process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "3";
    const fetchStub = script(() => new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 }));
    const error = await structured().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 429, category: "quota", retryable: false });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("the build failure classifier calls a 402 credits (not retryable) and a 429 provider (retryable)", async () => {
    const { classifyBuildFailure } = await import("@/lib/builder/build-failure");
    const { RevoraAiError } = await import("@/lib/ai/errors");
    const credits = classifyBuildFailure(new RevoraAiError(402, "x"), 402);
    expect(credits.kind).toBe("credits");
    expect(credits.retryable).toBe(false);
    const busy = classifyBuildFailure(new RevoraAiError(429, "x"), 429);
    expect(busy.kind).toBe("provider");
    expect(busy.retryable).toBe(true);
  });

  it("the paid cap holds across fallback: each candidate reserves, and a refused reservation sends nothing", async () => {
    reserve.mockImplementationOnce(async (estimate: number) => ({ id: "res-a", day: "unit-test", estimate })).mockResolvedValueOnce(null);
    const fetchStub = script(() => new Response("busy", { status: 429 }));
    const error = await structured().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "RevoraAiError" });
    expect(reserve).toHaveBeenCalledTimes(2);
    // Only model A was ever called; B's refused reservation never reached the gateway.
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledWith(expect.objectContaining({ id: "res-a" }), 0);
  });

  it("with budget for both, a fallback settles A at 0 (rate-limited) and B at its real cost", async () => {
    script(() => new Response("busy", { status: 429 }), () => ok('{"headline":"ok"}'));
    await structured();
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "res-1" }), 0);
    expect(settle).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "res-2" }), 7 * 10 + 3 * 100);
  });
});
