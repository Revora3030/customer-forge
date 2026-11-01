/**
 * The router applies the retry policy: 402 is never retried and later calls
 * are refused before a request leaves; 5xx is retried with backoff; every
 * failure writes one structured, secret-free log line. HTTP, telemetry and
 * the paid ledger are stubbed (no network, no database).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment, useFakeProviderKey } from "./provider-test-environment";

const recordAiEvent = vi.fn(async () => undefined);
vi.mock("@/lib/ai/telemetry.server", () => ({
  recordAiEvent: (...args: unknown[]) => recordAiEvent(...(args as [])),
  recordTeamStep: vi.fn(async () => undefined),
  checkAiLimits: vi.fn(async () => ({ allowed: true })),
}));

const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("router retry policy", () => {
  const saved = { ...process.env };
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    isolateProviderEnvironment();
    vi.resetModules();
    recordAiEvent.mockClear();
    vi.doMock("@/lib/ai/paid-budget.server", () => ({
      reservePaidSpend: async (estimate: number) => ({ id: "res-1", day: "unit-test", estimate }),
      reservePaidSpendDetailed: async (estimate: number) => ({ reservation: { id: "res-1", day: "unit-test", estimate }, refusal: null }),
      paidDailyCapUsd: () => 10,
      secondsUntilPaidCapReset: () => 3600,
      settlePaidSpend: async () => true,
      routerEstimate: () => 5_000,
      routerActual: () => 1,
    }));
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    useFakeProviderKey();
    process.env["AI_LOVABLE_MODEL_PRIMARY"] = "openai/gpt-6.1-sol";
    process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "2";
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { resetProviderBackoff } = await import("@/lib/ai/provider-backoff");
    resetProviderBackoff();
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    vi.doUnmock("@/lib/ai/paid-budget.server");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function call() {
    const { generateText } = await import("@/lib/ai/router.server");
    return generateText({ task: "test.retry", organizationId: "org-1", userId: null }, { messages: [{ role: "user", content: "secret brief" }] });
  }

  const lines = () =>
    [...warn.mock.calls, ...error.mock.calls]
      .map(([first]) => String(first))
      .filter((line) => line.startsWith("[ai-call] "))
      .map((line) => JSON.parse(line.slice("[ai-call] ".length)) as Record<string, unknown>);

  it("never retries a 402, and refuses the next call before a request leaves", async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Not enough credits sk-test-abcdefgh12345" } }), { status: 402 }));
    vi.stubGlobal("fetch", fetchStub);
    await expect(call()).rejects.toMatchObject({ status: 402, category: "quota" });
    const sentFirst = fetchStub.mock.calls.length;
    expect(sentFirst).toBe(1);
    await expect(call()).rejects.toMatchObject({ status: 402, category: "quota", detail: "credit_cooldown" });
    expect(fetchStub.mock.calls.length).toBe(sentFirst);
    const logged = lines();
    expect(logged[0]).toMatchObject({ event: "ai_call_failed", status: 402, errorClass: "credits", action: "skip_provider", attempt: 1, sent: true, provider: "lovable" });
    expect(logged.at(-1)).toMatchObject({ status: 402, errorClass: "credits", sent: false });
    const raw = [...warn.mock.calls, ...error.mock.calls].map(([first]) => String(first)).join("\n");
    expect(raw).not.toContain("sk-test");
    expect(raw).not.toContain("secret brief");
    // The refused call still leaves a quota row, so the build can name the cause.
    expect(recordAiEvent).toHaveBeenCalledWith(expect.objectContaining({ ok: false, errorCategory: "quota", errorDetail: "credit_cooldown", latencyMs: 0 }));
  });

  it("retries a 5xx once with backoff, then answers", async () => {
    const fetchStub = vi.fn().mockResolvedValueOnce(new Response("upstream down", { status: 503 })).mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchStub);
    const result = await call();
    expect(result.text).toBe("answer");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(lines()[0]).toMatchObject({ status: 503, errorClass: "transient", action: "retry", attempt: 1, maxAttempts: 2 });
    expect(Number(lines()[0]!["retryInMs"])).toBeGreaterThanOrEqual(250);
  });

  it("does not retry a 400 against the same model", async () => {
    process.env["AI_LOVABLE_MODEL_FALLBACKS"] = "";
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchStub);
    await expect(call()).rejects.toMatchObject({ category: "invalid_request" });
    const perModel = new Map<string, number>();
    for (const line of lines()) perModel.set(String(line["model"]), (perModel.get(String(line["model"])) ?? 0) + 1);
    expect([...perModel.values()].every((count) => count === 1)).toBe(true);
    expect(lines().every((line) => line["action"] !== "retry")).toBe(true);
  });
});
