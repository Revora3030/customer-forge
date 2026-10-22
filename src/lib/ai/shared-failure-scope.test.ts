/**
 * SHARED-CIRCUIT SCOPE PROOF (production evidence 2026-10-21).
 *
 *  - A rate limit or timeout from one request (in production: build review
 *    storms) used to rest the WHOLE provider on the shared circuit, cutting
 *    Jarvis and chat off from every model of that provider. It now rests only
 *    the model that answered it; quota and rejected keys stay provider-wide.
 *  - A 404 "model missing" only reordered the in-process reputation map, so a
 *    dead model was retried forever. It is now persisted model-scoped.
 *  - A paid account out of quota was remembered per worker only, so every
 *    fresh worker tried it first. The shared record now demotes it everywhere.
 *  - Cloudflare's "daily free allocation" (4006) is classified as quota.
 *
 * Drives the real router with stubbed HTTP, stubbed spend reservations and an
 * in-memory runtime store (AGENTS.md: shared isolation helper, no ledger or
 * telemetry writes, no provider calls from ambient credentials).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";

vi.mock("@/lib/ai/paid-budget.server", () => ({
  reservePaidSpend: vi.fn(async () => ({ day: "test", estimate: 1 })),
  settlePaidSpend: vi.fn(async () => undefined),
  routerEstimate: () => 1,
  routerActual: () => 1,
}));

vi.mock("@/lib/ai/telemetry.server", () => ({
  recordAiEvent: vi.fn(async () => undefined),
  recordTeamStep: vi.fn(async () => undefined),
  checkAiLimits: vi.fn(async () => ({ allowed: true })),
}));

const store = vi.hoisted(() => ({
  snapshotRows: [] as Record<string, unknown>[],
  results: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn === "ai_runtime_snapshot") return { data: store.snapshotRows, error: null };
      if (fn === "ai_note_provider_result") {
        store.results.push(args);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  },
}));

type Handler = (url: string) => Response;

function stubFetch(handler: Handler) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    const url = String(input);
    if (!url.includes("/chat/completions"))
      return new Response(JSON.stringify({ data: [], result: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    calls.push(url);
    return handler(url);
  }));
  return calls;
}

const ok = (text: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const caller = { task: "builder.converse", userId: null, organizationId: null } as const;

function configureTwoFreeProviders() {
  vi.stubEnv("BUILDER_EXTERNAL_AI_ALLOWED", "true");
  vi.stubEnv("CLOUDFLARE_AI_API_TOKEN", "cf-token");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "cf-account");
  vi.stubEnv("OPENROUTER_API_KEY", "or-key");
  vi.stubEnv("FREE_AI_PROVIDER_ORDER", "cloudflare,openrouter");
  vi.stubEnv("AI_MAX_ATTEMPTS_PER_PROVIDER", "1");
}

async function load() {
  vi.resetModules();
  const router = await import("@/lib/ai/router.server");
  router.resetAiRuntimeStatus();
  (await import("@/lib/ai/free")).resetFreeBudget();
  (await import("@/lib/ai/free-models.server")).resetFreeModelDiscovery();
  (await import("@/lib/ai/provider-backoff")).resetProviderBackoff();
  const durable = await import("@/lib/ai/durable-health.server");
  durable.resetDurableRuntimeCache();
  return { router, durable };
}

const failures = () => store.results.filter((args) => args["_ok"] === false);

beforeEach(() => {
  isolateProviderEnvironment();
  store.snapshotRows = [];
  store.results = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("rate limits and timeouts rest one model, never the provider", () => {
  it("records a free rate limit under the model's own key", async () => {
    configureTwoFreeProviders();
    stubFetch((url) => (url.includes("cloudflare") ? new Response("slow down", { status: 429 }) : ok("covered")));
    const { router, durable } = await load();
    const result = await router.generateText(caller, { messages: [{ role: "user", content: "hi" }] });
    expect(result.provider).toBe("openrouter");
    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]!["_provider"]).toBe(durable.durableModelKey("rest", "cloudflare", "@cf/openai/gpt-oss-120b"));
    expect(failures()[0]!["_rate_limited"]).toBe(true);
    expect(failures().some((args) => args["_provider"] === "cloudflare")).toBe(false);
  }, 30_000);

  it("keeps a spent quota provider-wide, resting after one strike", async () => {
    configureTwoFreeProviders();
    stubFetch((url) =>
      url.includes("cloudflare")
        ? new Response('{"errors":[{"message":"insufficient_quota"}]}', { status: 429 })
        : ok("covered"),
    );
    const { router } = await load();
    await router.generateText(caller, { messages: [{ role: "user", content: "hi" }] });
    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]).toMatchObject({ _provider: "cloudflare", _failure_threshold: 1 });
  }, 30_000);

  it("persists a 404 model-missing answer under a model-scoped key", async () => {
    configureTwoFreeProviders();
    stubFetch((url) =>
      url.includes("cloudflare") ? new Response('{"error":"No such model"}', { status: 404 }) : ok("covered"),
    );
    const { router, durable } = await load();
    await router.generateText(caller, { messages: [{ role: "user", content: "hi" }] });
    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]).toMatchObject({
      _provider: durable.durableModelKey("gone", "cloudflare", "@cf/openai/gpt-oss-120b"),
      _failure_threshold: durable.MODEL_GONE_STRIKES,
    });
  }, 30_000);

  it("skips a model resting on the shared circuit and lets the provider's turn pass to the next team member", async () => {
    configureTwoFreeProviders();
    const { durable } = await load();
    store.snapshotRows = [
      {
        provider: durable.durableModelKey("gone", "cloudflare", "@cf/openai/gpt-oss-120b"),
        day: new Date().toISOString().slice(0, 10),
        used: 0,
        failures: 0,
        open_until: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    ];
    const calls = stubFetch(() => ok("covered"));
    const { router } = await load();
    const result = await router.generateText(caller, { messages: [{ role: "user", content: "hi" }] });
    expect(result.provider).toBe("openrouter");
    expect(calls.some((url) => url.includes("cloudflare"))).toBe(false);
  }, 30_000);
});

describe("paid account demotion is shared across workers", () => {
  function configurePaidAndFree() {
    configureTwoFreeProviders();
    vi.stubEnv("OPENAI_API_KEY", "test-paid-key");
    vi.stubEnv("OPENAI_FREE_TIER_SHARING", "false");
    vi.stubEnv("FREE_AI_ONLY", "false");
  }

  it("records a paid quota refusal in the shared runtime table", async () => {
    configurePaidAndFree();
    stubFetch((url) =>
      new URL(url).hostname === "api.openai.com"
        ? new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 })
        : ok("free team answered"),
    );
    const { router } = await load();
    const result = await router.generateText({ task: "admin.jarvis", userId: "owner" }, {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("free team answered");
    await vi.waitFor(() => expect(failures().some((args) => args["_provider"] === "paid:openai")).toBe(true));
    expect(failures().find((args) => args["_provider"] === "paid:openai")).toMatchObject({ _failure_threshold: 1 });
  }, 30_000);

  it("a fresh worker tries the free team before a paid account another worker saw refuse", async () => {
    configurePaidAndFree();
    store.snapshotRows = [
      {
        provider: "paid:openai",
        day: new Date().toISOString().slice(0, 10),
        used: 0,
        failures: 0,
        open_until: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    ];
    const calls = stubFetch(() => ok("free team answered"));
    const { router } = await load();
    const result = await router.generateText({ task: "admin.jarvis", userId: "owner" }, {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.text).toBe("free team answered");
    expect(calls.some((url) => new URL(url).hostname === "api.openai.com")).toBe(false);
  }, 30_000);
});

describe("failure classification", () => {
  it("classifies Cloudflare's daily free allocation (4006) as quota", async () => {
    const { providerHttpError } = await import("@/lib/ai/providers/shared");
    const body = JSON.stringify({
      errors: [{ message: "AiError: You have used up your daily free allocation of 10,000 neurons, please upgrade to Cloudflare's Workers Paid plan", code: 4006 }],
      success: false,
    });
    const error = await providerHttpError("cloudflare", new Response(body, { status: 429 }));
    expect(error.category).toBe("quota");
    const bare = await providerHttpError("cloudflare", new Response('{"errors":[{"code": 4006}]}', { status: 429 }));
    expect(bare.category).toBe("quota");
    const { accountRestFor, sharedFailureScope } = await import("@/lib/ai/router.server");
    expect(sharedFailureScope(error)).toBe("provider");
    // Rests until the next UTC midnight, not a 60-second cooldown.
    expect(accountRestFor(error.category, Date.UTC(2026, 9, 21, 18, 0, 0)).cooldownSeconds).toBe(6 * 3600);
  });

  it("keeps an ordinary rate limit as rate_limited", async () => {
    const { providerHttpError } = await import("@/lib/ai/providers/shared");
    const error = await providerHttpError("cloudflare", new Response('{"errors":[{"code":3040,"message":"Capacity temporarily exceeded"}]}', { status: 429 }));
    expect(error.category).toBe("rate_limited");
  });

  it("treats a licence-gated model as model-unavailable, not a provider outage", async () => {
    const { providerHttpError, modelUnavailableError } = await import("@/lib/ai/providers/shared");
    const { sharedFailureScope } = await import("@/lib/ai/router.server");
    const error = await providerHttpError(
      "cloudflare",
      new Response('{"errors":[{"message":"5016: Prior to using this model, you must submit the prompt \'agree\'."}]}', { status: 403 }),
    );
    expect(error.category).toBe("policy");
    expect(modelUnavailableError(error)).toBe(true);
    expect(sharedFailureScope(error)).toBe("model_gone");
    const plainPolicy = await providerHttpError("cloudflare", new Response("forbidden", { status: 403 }));
    expect(sharedFailureScope(plainPolicy)).toBeNull();
  });

  it("never shares a single bad answer", async () => {
    const { RevoraAiError } = await import("@/lib/ai/errors");
    const { sharedFailureScope } = await import("@/lib/ai/router.server");
    expect(sharedFailureScope(new RevoraAiError(502, "garbled", { category: "bad_response" }))).toBeNull();
    expect(sharedFailureScope(new RevoraAiError(408, "slow", { category: "timeout" }))).toBe("model_rest");
    expect(sharedFailureScope(new RevoraAiError(401, "key", { category: "unauthorized" }))).toBe("provider");
  });
});
