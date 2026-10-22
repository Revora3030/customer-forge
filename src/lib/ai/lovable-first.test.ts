/**
 * Owner decision 2026-10-22: with LOVABLE_API_KEY set, the Lovable AI Gateway
 * runs every website-build stage and every admin Jarvis task FIRST; the free
 * pool (and Revora's own OpenAI/Google keys) are failover only. Visitor
 * Jarvis (public, unauthenticated) stays free-only and never reaches Lovable.
 *
 * All HTTP is stubbed, the provider environment is isolated, and the spend
 * ledgers (router daily reservation, Luna monthly reservation) are stubbed, so
 * ambient deployment credentials can never make a live call or a ledger write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "@/lib/ai/provider-test-environment";
import type { ModelRole } from "@/lib/ai/config";

const saved = { ...process.env };

type Call = { url: string; body: Record<string, unknown> };

/** Lovable answers (both wire formats); a free provider's chat answers too; anything else 404s. */
function stubProviders(options: { lovableDelayMs?: number } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      let body: Record<string, unknown> = {};
      try {
        body = init?.body && typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      } catch {
        body = {};
      }
      calls.push({ url, body });
      const json = (payload: unknown) =>
        new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("ai.gateway.lovable.dev")) {
        if (options.lovableDelayMs) await new Promise((resolve) => setTimeout(resolve, options.lovableDelayMs));
        if (url.endsWith("/messages"))
          return json({
            content: [{ type: "text", text: '{"answer":"lovable"}' }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1200, output_tokens: 300 },
          });
        return json({
          choices: [{ message: { content: '{"answer":"lovable"}' } }],
          usage: { prompt_tokens: 1200, completion_tokens: 300 },
        });
      }
      if (url.includes("/chat/completions"))
        return json({ choices: [{ message: { content: '{"answer":"free"}' } }], usage: { prompt_tokens: 5, completion_tokens: 2 } });
      return new Response("not stubbed", { status: 404 });
    }),
  );
  return calls;
}

/** Calls that asked a model for an answer (not catalogue discovery). */
const modelCalls = (calls: Call[]) =>
  calls.filter((call) => call.url.endsWith("/chat/completions") || call.url.endsWith("/messages"));

const reserve = vi.fn();
const settle = vi.fn();

beforeEach(() => {
  isolateProviderEnvironment();
  vi.resetModules();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  // Lovable plus a free provider plus Revora's own keys are all configured.
  process.env["LOVABLE_API_KEY"] = "test-lovable";
  process.env["OPENAI_API_KEY"] = "test-openai";
  process.env["GOOGLE_AI_API_KEY"] = "test-google";
  process.env["GROQ_API_KEY"] = "test-groq";
  process.env["FREE_AI_ENABLED"] = "true";
  process.env["FREE_AI_ONLY"] = "false";
  process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
  process.env["AI_MAX_ATTEMPTS_PER_PROVIDER"] = "1";
  reserve.mockReset().mockImplementation(async (estimate: number) => ({ id: "res-1", day: "unit-test", estimate }));
  settle.mockReset().mockResolvedValue(true);
  vi.doMock("@/lib/ai/paid-budget.server", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ai/paid-budget.server")>()),
    reservePaidSpend: reserve,
    settlePaidSpend: settle,
  }));
  vi.doMock("@/lib/ai/telemetry.server", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ai/telemetry.server")>()),
    checkAiLimits: vi.fn(async () => ({ allowed: true as const })),
    recordAiEvent: vi.fn(async () => undefined),
    recordTeamStep: vi.fn(async () => undefined),
  }));
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  vi.doUnmock("@/lib/ai/paid-budget.server");
  vi.doUnmock("@/lib/ai/telemetry.server");
  vi.doUnmock("@/lib/ai/luna.server");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Lovable leads every build role through the router", () => {
  const roles: ModelRole[] = ["primary", "design", "fast", "vision", "coding", "conversation"];

  it.each(roles)("tries lovable first for the %s role, ahead of free and Revora's own keys", async (role) => {
    const calls = stubProviders();
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    const result = await generateStructuredOutput(
      { task: `test.build.${role}`, organizationId: "org-1", userId: null },
      { role, maxOutputTokens: 800, messages: [{ role: "user", content: "design the hero" }] },
    );
    expect(result.provider).toBe("lovable");
    expect(modelCalls(calls)[0]!.url).toContain("ai.gateway.lovable.dev");
  }, 30_000);
});

describe("admin Jarvis runs on Lovable first", () => {
  it("sends the shared conversation request to the gateway before any free model", async () => {
    const calls = stubProviders();
    const { jarvisModelRequest } = await import("@/lib/jarvis-model-request.server");
    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { userId: "owner-1", task: "admin.jarvis" },
      jarvisModelRequest([{ role: "user", content: "status?" }], 600),
    );
    expect(result.provider).toBe("lovable");
    expect(modelCalls(calls)[0]!.url).toContain("ai.gateway.lovable.dev");
  }, 30_000);

  it("no admin Jarvis growth task forces the free-only lane any more", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/lib/prospect-replies.server.ts",
      "src/lib/prospect-outreach.server.ts",
      "src/lib/jarvis-prospecting.functions.ts",
      "src/lib/jarvis-demo-site.server.ts",
    ])
      expect(readFileSync(file, "utf8"), file).not.toContain("freeOnly: true");
  });
});

describe("visitor Jarvis stays free-only", () => {
  it("never calls the Lovable gateway even with its key present", async () => {
    const calls = stubProviders();
    const { generateText } = await import("@/lib/ai/router.server");
    // The exact shape visitor-jarvis.functions.ts sends.
    const result = await generateText(
      { task: "public.visitor_jarvis" },
      {
        role: "conversation",
        freeOnly: true,
        maxOutputTokens: 400,
        temperature: 0.4,
        messages: [{ role: "user", content: "what does it cost?" }],
      },
    );
    expect(result.provider).not.toBe("lovable");
    expect(calls.some((call) => call.url.includes("ai.gateway.lovable.dev"))).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  }, 30_000);

  it("still passes freeOnly from the public handler", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8")).toContain("freeOnly: true");
  });
});

describe("Lovable spend counts against the daily paid cap", () => {
  it("reserves a non-zero estimate before the call and settles a non-zero token-priced cost", async () => {
    stubProviders();
    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { task: "test.build.design", organizationId: "org-1", userId: null },
      { role: "design", maxOutputTokens: 4000, messages: [{ role: "user", content: "x".repeat(8000) }] },
    );
    expect(result.provider).toBe("lovable");
    expect(reserve).toHaveBeenCalledTimes(1);
    const estimate = reserve.mock.calls[0]![0] as number;
    // Claude Opus 5.5 leads design: (8000/4 in × $4 + 4000 out × $20) per 1M.
    const { modelEstimateMicrocents, modelCostMicrocents } = await import("@/lib/ai/model-prices");
    expect(estimate).toBe(modelEstimateMicrocents("anthropic/claude-opus-5-5", 8000, 4000));
    expect(estimate).toBeGreaterThan(0);
    expect(settle).toHaveBeenCalledTimes(1);
    const actual = settle.mock.calls[0]![1] as number;
    expect(actual).toBe(modelCostMicrocents("anthropic/claude-opus-5-5", 1200, 300));
    expect(actual).toBeGreaterThan(0);
  }, 30_000);

  it("prices every Lovable roster model for the cap and for usage reporting", async () => {
    const { providerConfig } = await import("@/lib/ai/config");
    const { estimateCostUsd, knownModelPrice } = await import("@/lib/ai/model-prices");
    const lovable = providerConfig("lovable")!;
    for (const roster of Object.values(lovable.models))
      for (const model of roster.split(",").map((id) => id.trim()).filter(Boolean)) {
        expect(knownModelPrice(model), model).not.toBeNull();
        expect(estimateCostUsd(model, 1000, 1000) ?? 0, model).toBeGreaterThan(0);
      }
  });

  it("the builder's thinker settles the walk at the answering model's estimated price", async () => {
    stubProviders();
    const reserveBudget = vi.fn(async (estimate: number) => ({
      allowed: true, dailyCapped: false, spent: 0, cap: 1, calls: 0, tenantSpent: 0, tenantCap: 1,
      paid: { id: "daily-1", day: "unit-test", estimate },
    }));
    const settleBudget = vi.fn(async () => undefined);
    vi.doMock("@/lib/ai/luna.server", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/ai/luna.server")>()),
      reserveBudget,
      settleBudget,
      recordUsage: vi.fn(async () => undefined),
    }));
    const { callBestThinker } = await import("@/lib/ai/hall-of-fame.server");
    const outcome = await callBestThinker({
      purpose: "creative_direction",
      system: "You are the art director.",
      user: "Direct this site.",
      organizationId: "org-1",
      maxOutputTokens: 900,
    });
    expect(outcome.ok && outcome.lane).toBe("paid");
    expect(outcome.ok && outcome.model).toContain("lovable");
    expect(reserveBudget).toHaveBeenCalledTimes(1);
    expect(reserveBudget.mock.calls[0]![0]).toBeGreaterThan(0);
    // The router must not reserve a second time inside the thinker's walk.
    expect(reserve).not.toHaveBeenCalled();
    expect(settleBudget).toHaveBeenCalledTimes(1);
    const [, , actual] = settleBudget.mock.calls[0]! as unknown as [string, number, number];
    expect(actual).toBeGreaterThan(0);
  }, 30_000);
});

describe("builder thinker stages lead with Lovable", () => {
  it.each(["visual_review", "creative_direction", "design_alternative", "conversion_architecture", "classification", "final_review"])(
    "%s answers on the paid Lovable lane first",
    async (purpose) => {
      const calls = stubProviders();
      vi.doMock("@/lib/ai/luna.server", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@/lib/ai/luna.server")>()),
        reserveBudget: vi.fn(async (estimate: number) => ({
          allowed: true, dailyCapped: false, spent: 0, cap: 1, calls: 0, tenantSpent: 0, tenantCap: 1,
          paid: { id: "daily-1", day: "unit-test", estimate },
        })),
        settleBudget: vi.fn(async () => undefined),
        recordUsage: vi.fn(async () => undefined),
      }));
      const { callBestThinker } = await import("@/lib/ai/hall-of-fame.server");
      const outcome = await callBestThinker({
        purpose: purpose as Parameters<typeof callBestThinker>[0]["purpose"],
        system: "Review.",
        user: "Material.",
        organizationId: "org-1",
        json: true,
      });
      expect(outcome.ok && outcome.lane).toBe("paid");
      expect(modelCalls(calls)[0]!.url).toContain("ai.gateway.lovable.dev");
    },
    30_000,
  );
});

describe("paid-lane timeouts", () => {
  it("visual review gives the Lovable lane a realistic attempt and chain budget", async () => {
    const photo = await import("@/lib/ai/photo-direction.server");
    expect(photo.VISUAL_REVIEW_TIMEOUT_MS).toBe(9_000);
    expect(photo.VISUAL_REVIEW_PAID_TIMEOUT_MS).toBe(60_000);
    expect(photo.VISUAL_REVIEW_CHAIN_MS).toBe(100_000);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/ai/photo-direction.server.ts", "utf8")).toContain(
      "paidTimeoutMs: VISUAL_REVIEW_PAID_TIMEOUT_MS,",
    );
  });

  it("defaults paid attempts to 180s, capped under the 300s worker lease", async () => {
    const { aiLimits, PAID_REQUEST_TIMEOUT_MS_MAX } = await import("@/lib/ai/config");
    expect(aiLimits().paidRequestTimeoutMs).toBe(180_000);
    process.env["AI_PAID_REQUEST_TIMEOUT_MS"] = "900000";
    expect(aiLimits().paidRequestTimeoutMs).toBe(PAID_REQUEST_TIMEOUT_MS_MAX);
    const { LEASE_SECONDS } = await import("@/lib/site-engine.worker.server");
    expect(PAID_REQUEST_TIMEOUT_MS_MAX).toBeLessThan(LEASE_SECONDS * 1000);
  });

  it("a free-lane fail-fast timeout never cuts off a slower Lovable vision answer", async () => {
    const calls = stubProviders({ lovableDelayMs: 80 });
    const { generateStructuredOutput } = await import("@/lib/ai/router.server");
    const result = await generateStructuredOutput(
      { task: "image.visual_review", organizationId: "org-1", userId: null },
      {
        role: "vision",
        json: true,
        maxOutputTokens: 700,
        timeoutMs: 10,
        paidTimeoutMs: 5_000,
        chainDeadlineMs: 10_000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Review the picture." },
              { type: "image", dataUrl: "data:image/png;base64,iVBORw0KGgo=", mimeType: "image/png" },
            ],
          },
        ],
      },
    );
    expect(result.provider).toBe("lovable");
    expect(modelCalls(calls)[0]!.url).toContain("ai.gateway.lovable.dev");
  }, 30_000);

  it("never sends a sampling temperature to Claude on the Messages endpoint", async () => {
    const calls = stubProviders();
    const { generateText } = await import("@/lib/ai/router.server");
    await generateText(
      { task: "test.build.primary", organizationId: "org-1", userId: null },
      { role: "primary", temperature: 0.2, maxOutputTokens: 400, messages: [{ role: "user", content: "write" }] },
    );
    const claude = modelCalls(calls).find((call) => call.url.endsWith("/messages"));
    expect(claude).toBeDefined();
    expect(claude!.body["temperature"]).toBeUndefined();
  }, 30_000);
});

describe("one busy Lovable model does not bench the gateway", () => {
  it("scopes a rate-limit demotion to the model, a quota refusal to the whole account", async () => {
    const backoff = await import("@/lib/ai/provider-backoff");
    backoff.resetProviderBackoff();
    const now = Date.now();
    backoff.noteProviderFailure("lovable", "rate_limited", now, "google/gemini-3.8-flash");
    expect(backoff.providerDegraded("lovable", now, "google/gemini-3.8-flash")).toBe(true);
    expect(backoff.providerDegraded("lovable", now, "anthropic/claude-sonnet-5")).toBe(false);
    const entries = [
      { free: null, config: { name: "lovable" }, model: "google/gemini-3.8-flash" },
      { free: "groq", config: { name: "groq" }, model: "llama" },
      { free: null, config: { name: "lovable" }, model: "anthropic/claude-sonnet-5" },
    ];
    // Only the busy model moves behind the free pool; its roster mates stay.
    expect(backoff.demoteDegradedPaid(entries, now).map((entry) => entry.model)).toEqual([
      "llama",
      "anthropic/claude-sonnet-5",
      "google/gemini-3.8-flash",
    ]);
    backoff.noteProviderFailure("lovable", "quota", now, "anthropic/claude-sonnet-5");
    expect(backoff.providerDegraded("lovable", now, "anthropic/claude-sonnet-5")).toBe(true);
    expect(backoff.providerDegraded("lovable", now)).toBe(true);
    backoff.resetProviderBackoff();
  });
});
