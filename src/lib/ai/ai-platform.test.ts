/**
 * Regression tests for Revora's own AI infrastructure.
 *
 * These lock in the properties that matter for independence and safety:
 * no third-party AI gateway is reachable, provider keys never leave the server,
 * a missing key fails closed with one clear sentence, a failing provider is
 * covered by the next one, and no tool call the model asks for escapes the
 * registry's checks.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { AI_NOT_CONFIGURED_MESSAGE } from "@/lib/ai/errors";
import { isAiConfigured, providerChain, providerConfig, aiLimits } from "@/lib/ai/config";
import { createRunBudget, findTool, listTools, runTool } from "@/lib/ai/tools.server";

/* ------------------------- independence from Lovable ----------------------- */

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(ts|tsx)$/.test(path)) files.push(path);
  }
  return files;
}

const SOURCE_FILES = walk("src");
/** Every source file except this test, which necessarily names what it forbids. */
const APP_FILES = SOURCE_FILES.filter((file) => !file.endsWith("ai-platform.test.ts"));

describe("no third-party AI gateway remains", () => {
  it("never references an AI gateway host anywhere in the app", () => {
    const offenders = APP_FILES.filter((file) =>
      readFileSync(file, "utf8").includes("ai.gateway.lovable.dev"),
    );
    expect(offenders).toEqual([]);
  });

  it("reads LOVABLE_API_KEY only for email, Stripe and Google data, never for AI", () => {
    // Email delivery, Stripe, and the Google Search Console / Maps connectors
    // are separate Lovable integrations that never run a model. The capability
    // registry only names the credential so the admin page can show whether a
    // connection exists.
    // integrations/live-credentials.ts only lists the credential NAME so the
    // live email suite can say whether it may run. It never calls a model.
    const allowed = [
      "email",
      "stripe.server.ts",
      "integrations/google.server",
      "integrations/capabilities.ts",
      "integrations/live-credentials.ts",
    ];
    const offenders = APP_FILES.filter((file) => {
      if (!readFileSync(file, "utf8").includes("LOVABLE_API_KEY")) return false;
      return !allowed.some((fragment) => file.includes(fragment));
    });
    expect(offenders).toEqual([]);
  });

  it("keeps provider keys out of anything the browser can load", () => {
    const secretNames = ["GOOGLE_AI_API_KEY", "OPENAI_API_KEY"];
    const offenders = APP_FILES.filter((file) => {
      // Server-only modules and the AI layer itself are allowed to read keys.
      if (file.includes(".server.") || file.startsWith("src/lib/ai/")) return false;
      const body = readFileSync(file, "utf8");
      return secretNames.some((name) => body.includes(name));
    });
    expect(offenders).toEqual([]);
  });

  it("never exposes an AI provider key through a client-visible VITE_ variable", () => {
    const offenders = APP_FILES.filter((file) =>
      /VITE_[A-Z_]*(OPENAI|GOOGLE_AI|AI_API)[A-Z_]*/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------- configuration ----------------------------- */

describe("provider configuration", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    // These suites cover the OPTIONAL enhancement path, so they opt out of
    // zero-cost mode explicitly. Zero-cost mode itself is proven in
    // `zero-cost.test.ts`, which asserts providers stay blocked by default.
    process.env["ZERO_AI_COST_MODE"] = "false";
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    delete process.env["GOOGLE_AI_API_KEY"];
    delete process.env["OPENAI_API_KEY"];
    delete process.env["AI_DEFAULT_PROVIDER"];
    delete process.env["AI_FALLBACK_PROVIDER"];
    // A real free credential may be configured in this environment; these tests
    // describe the unconfigured case, so clear every free provider credential.
    delete process.env["CLOUDFLARE_AI_API_TOKEN"];
    delete process.env["CLOUDFLARE_API_TOKEN"];
    delete process.env["CLOUDFLARE_ACCOUNT_ID"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["GROQ_API_KEY"];
    delete process.env["NVIDIA_NIM_API_KEY"];
    delete process.env["NVIDIA_API_KEY"];
    delete process.env["LLM7_API_KEY"];
    delete process.env["GOOGLE_AI_FREE_API_KEY"];
    delete process.env["GOOGLE_AI_FREE_TIER"];
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("treats Revora AI as unconfigured until Revora owns a key", () => {
    expect(isAiConfigured()).toBe(false);
    expect(providerChain()).toEqual([]);
    expect(providerConfig("google")).toBeNull();
  });

  it("fails closed with one clear message when no provider is configured", async () => {
    // FREE-AI-FIRST: with no free credentials and no paid opt-in the router
    // contacts nobody and reports the free-unavailable state, which callers
    // treat as "use the deterministic engine" rather than an error to retry.
    const { generateText } = await import("@/lib/ai/router.server");
    await expect(
      generateText(
        { task: "test", organizationId: null, userId: null },
        {
          messages: [{ role: "user", content: "hello" }],
        },
      ),
    ).rejects.toMatchObject({ category: "free_unavailable", retryable: false });
    expect(AI_NOT_CONFIGURED_MESSAGE).toContain("Revora AI is not configured");
  }, 20000);

  it("puts the configured default provider first and the fallback second", () => {
    process.env["GOOGLE_AI_API_KEY"] = "test-google";
    process.env["OPENAI_API_KEY"] = "test-openai";
    process.env["AI_DEFAULT_PROVIDER"] = "openai";
    process.env["AI_FALLBACK_PROVIDER"] = "google";
    expect(providerChain().map((entry) => entry.name)).toEqual(["openai", "google"]);
  });

  it("uses a provider that holds a key even when it isn't the configured default", () => {
    process.env["AI_DEFAULT_PROVIDER"] = "openai";
    process.env["GOOGLE_AI_API_KEY"] = "test-google";
    expect(providerChain().map((entry) => entry.name)).toEqual(["google"]);
  });

  it("lets a model be changed by configuration, without a code change", () => {
    process.env["GOOGLE_AI_API_KEY"] = "test-google";
    process.env["AI_GOOGLE_MODEL_FAST"] = "gemini-test-fast";
    expect(providerConfig("google")?.models.fast).toBe("gemini-test-fast");
  });

  it("keeps sane ceilings on cost, size and agent loops", () => {
    const limits = aiLimits();
    expect(limits.perUserDaily).toBeGreaterThan(0);
    expect(limits.maxToolCalls).toBeGreaterThan(0);
    expect(limits.maxAgentIterations).toBeGreaterThan(0);
    expect(limits.requestTimeoutMs).toBeGreaterThan(0);
  });
});

/* ------------------------------ provider fallback -------------------------- */

describe("provider fallback", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env["ZERO_AI_COST_MODE"] = "false";
    process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
    // These tests cover the optional PAID chain, so the free chain is off.
    process.env["FREE_AI_ENABLED"] = "false";
    process.env["FREE_AI_ONLY"] = "false";
    process.env["GOOGLE_AI_API_KEY"] = "test-google";
    process.env["OPENAI_API_KEY"] = "test-openai";
    process.env["AI_DEFAULT_PROVIDER"] = "google";
    process.env["AI_FALLBACK_PROVIDER"] = "openai";
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("covers a failing primary provider with the secondary one", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("generativelanguage"))
          return new Response("upstream down", { status: 503 });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "second provider answered" } }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { task: "test.fallback", organizationId: null, userId: null },
      { messages: [{ role: "user", content: "hello" }] },
    );

    expect(result.text).toBe("second provider answered");
    expect(result.provider).toBe("openai");
    expect(result.fallbackUsed).toBe(true);
    expect(calls.some((url) => url.includes("generativelanguage"))).toBe(true);
    expect(calls.some((url) => url.includes("api.openai.com"))).toBe(true);
    expect(calls.every((url) => !url.includes("lovable"))).toBe(true);
  });

  it("does not shop around after a refused key: it reports the refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad key", { status: 401 })),
    );
    const { generateText } = await import("@/lib/ai/router.server");
    await expect(
      generateText(
        { task: "test.auth", organizationId: null, userId: null },
        {
          messages: [{ role: "user", content: "hello" }],
        },
      ),
    ).rejects.toMatchObject({ name: "RevoraAiError", category: "unauthorized" });
  });

  it("does not deny anonymous callers because usage telemetry cannot be attributed", async () => {
    // Regression: the per-user/per-workspace caps are keyed by identity. An
    // anonymous call has no id to count against, so the limit check must not
    // reach for the usage-tracking store (which may be unconfigured) and deny
    // the request with a misleading rate-limit error.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("generativelanguage"))
          return new Response("upstream down", { status: 503 });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "second provider answered" } }],
            usage: { prompt_tokens: 5, completion_tokens: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const { generateText } = await import("@/lib/ai/router.server");
    const result = await generateText(
      { task: "test.anonymous", organizationId: null, userId: null },
      { messages: [{ role: "user", content: "hello" }] },
    );
    expect(result.text).toBe("second provider answered");
    expect(result.provider).toBe("openai");
  });

  it("refuses an oversized request before paying a provider to refuse it", async () => {
    const { generateText } = await import("@/lib/ai/router.server");
    await expect(
      generateText(
        { task: "test.size", organizationId: null, userId: null },
        {
          messages: [{ role: "user", content: "x".repeat(aiLimits().maxRequestChars + 1) }],
        },
      ),
    ).rejects.toThrow(/too long/i);
  });
});

/* -------------------------------- tool safety ------------------------------ */

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";

function toolContext(overrides: Partial<Parameters<typeof runTool>[0]> = {}) {
  return {
    supabase: {
      from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    },
    userId: "33333333-3333-4333-8333-333333333333",
    organizationId: ORG,
    isSuperAdmin: false,
    ...overrides,
  } as Parameters<typeof runTool>[0];
}

describe("tool registry", () => {
  it("only offers tools that exist, and marks the ones that change data", () => {
    const tools = listTools({ isSuperAdmin: false });
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(findTool(tool.name)).not.toBeNull();
    expect(tools.find((tool) => tool.name === "rollback_changes")?.mutates).toBe(true);
    expect(tools.find((tool) => tool.name === "inspect_website")?.mutates).toBe(false);
  });

  it("refuses a tool the model invented", async () => {
    const result = await runTool(toolContext(), {
      name: "delete_everything",
      arguments: {},
      requestId: "req-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden");
  });

  it("refuses malformed arguments instead of passing them to a query", async () => {
    const result = await runTool(toolContext(), {
      name: "inspect_website",
      arguments: { organizationId: "not-an-id" },
      requestId: "req-2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
  });

  it("refuses another workspace's id, whatever the model asked for", async () => {
    const result = await runTool(toolContext(), {
      name: "inspect_website",
      arguments: { organizationId: OTHER_ORG },
      requestId: "req-3",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("tenant_mismatch");
  });

  it("reads the caller's own workspace successfully", async () => {
    const result = await runTool(toolContext(), {
      name: "inspect_website",
      arguments: { organizationId: ORG },
      requestId: "req-4",
    });
    expect(result.ok).toBe(true);
  });
});

describe("agent run budget", () => {
  it("stops the loop at the configured step limit", () => {
    const budget = createRunBudget();
    const limit = aiLimits().maxAgentIterations;
    for (let i = 0; i < limit; i += 1) expect(budget.nextIteration()).toHaveProperty("iteration");
    expect(budget.nextIteration()).toHaveProperty("stop");
  });

  it("stops the loop at the configured tool limit", () => {
    const budget = createRunBudget();
    const limit = aiLimits().maxToolCalls;
    for (let i = 0; i < limit; i += 1) expect(budget.nextToolCall()).toHaveProperty("call");
    expect(budget.nextToolCall()).toHaveProperty("stop");
  });

  it("stops the loop once the run has taken too long", () => {
    const budget = createRunBudget(Date.now() - (aiLimits().maxAgentRuntimeMs + 1000));
    expect(budget.nextIteration()).toHaveProperty("stop");
    expect(budget.nextToolCall()).toHaveProperty("stop");
  });
});
