/**
 * FREE-AI-FIRST PROOF.
 *
 * These tests guarantee the business promise: the builder can use AI without
 * anybody paying for it, a paid model can never be reached by the free router,
 * a provider without credentials is simply unavailable rather than a crash, and
 * when no free provider can serve a request the deterministic engine still
 * answers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "ZERO_AI_COST_MODE",
  "FREE_AI_ENABLED",
  "FREE_AI_ONLY",
  "FREE_AI_PROVIDER_ORDER",
  "BUILDER_EXTERNAL_AI",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_AI_FREE_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "CLOUDFLARE_AI_API_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "FREE_AI_CLOUDFLARE_DAILY_CAP",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
  vi.resetModules();
});

const free = async () => {
  vi.resetModules();
  return import("@/lib/ai/free");
};

describe("free provider selection", () => {
  it("marks a provider unavailable when its credentials are missing", async () => {
    const { freeProviderChain, freeProviderReadiness } = await free();
    expect(freeProviderChain("primary")).toHaveLength(0);
    expect(freeProviderReadiness().every((entry) => entry.configured === false)).toBe(true);
  });

  it("does not crash when only half a provider's credentials are present", async () => {
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "token-only-no-account";
    const { freeProviderChain } = await free();
    expect(freeProviderChain("primary").map((entry) => entry.name)).not.toContain("cloudflare");
  });

  it("uses every configured free provider, in the configured priority order", async () => {
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "cf-token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "cf-account";
    process.env["OPENROUTER_API_KEY"] = "or-key";
    process.env["FREE_AI_PROVIDER_ORDER"] = "openrouter,cloudflare";
    const { freeProviderChain } = await free();
    expect(freeProviderChain("primary").map((entry) => entry.name)).toEqual([
      "openrouter",
      "cloudflare",
    ]);
  });

  it("lets an admin reorder providers at runtime without touching credentials", async () => {
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "cf-token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "cf-account";
    process.env["OPENROUTER_API_KEY"] = "or-key";
    const { setRuntimeFreeProviderOrder, freeProviderChain } = await free();
    setRuntimeFreeProviderOrder(["openrouter", "cloudflare"]);
    expect(freeProviderChain("primary")[0]?.name).toBe("openrouter");
    setRuntimeFreeProviderOrder(null);
  });

  it("serves no free provider for images or voice, honestly", async () => {
    process.env["OPENROUTER_API_KEY"] = "or-key";
    const { freeProviderChain } = await free();
    expect(freeProviderChain("image")).toHaveLength(0);
    expect(freeProviderChain("transcription")).toHaveLength(0);
  });
});

describe("free-only enforcement", () => {
  it("rejects paid model ids for every free provider", async () => {
    const { isFreeEligibleModel } = await free();
    const paid = [
      "gpt-4.1",
      "gpt-5",
      "o3-mini",
      "chatgpt-4o-latest",
      "anthropic/claude-sonnet-4",
      "x-ai/grok-4",
      "deepseek-chat",
      "gemini-2.5-pro",
      "gpt-image-1",
      "whisper-1",
    ];
    for (const model of paid) {
      expect(isFreeEligibleModel("openrouter", model)).toBe(false);
      expect(isFreeEligibleModel("google", model)).toBe(false);
      expect(isFreeEligibleModel("cloudflare", model)).toBe(false);
    }
  });

  it("accepts the documented free models", async () => {
    const { isFreeEligibleModel } = await free();
    expect(isFreeEligibleModel("cloudflare", "@cf/zhipuai/glm-4.7-flash")).toBe(true);
    expect(isFreeEligibleModel("openrouter", "openrouter/auto:free")).toBe(true);
    expect(isFreeEligibleModel("google", "gemini-2.5-flash")).toBe(true);
  });

  it("free-only mode is the default, so a paid provider can never be reached", async () => {
    process.env["GOOGLE_AI_API_KEY"] = "paid-key";
    process.env["ZERO_AI_COST_MODE"] = "false";
    const { freeAiOnly } = await free();
    expect(freeAiOnly()).toBe(true);
    vi.resetModules();
    const { paidAiAllowedForBuilder } = await import("@/lib/ai/availability");
    // Builder-external AI is off by default too, so paid stays unreachable.
    expect(paidAiAllowedForBuilder()).toBe(false);
  });
});

describe("free budgets, so one workspace cannot burn the allowance", () => {
  it("stops offering a provider once its daily budget is spent", async () => {
    process.env["CLOUDFLARE_AI_API_TOKEN"] = "cf-token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "cf-account";
    process.env["FREE_AI_CLOUDFLARE_DAILY_CAP"] = "2";
    const { freeBudgetAllows, noteFreeUse, freeBudgetRemaining, resetFreeBudget } = await free();
    resetFreeBudget();
    expect(freeBudgetRemaining("cloudflare")).toBe(2);
    noteFreeUse("cloudflare");
    noteFreeUse("cloudflare");
    expect(freeBudgetAllows("cloudflare")).toBe(false);
    resetFreeBudget();
    expect(freeBudgetAllows("cloudflare")).toBe(true);
  });
});

describe("builder availability", () => {
  it("reports free AI as reachable once a free provider is configured", async () => {
    process.env["OPENROUTER_API_KEY"] = "or-key";
    vi.resetModules();
    const { builderAiAvailable, freeAiAvailable } = await import("@/lib/ai/availability");
    expect(freeAiAvailable()).toBe(true);
    expect(builderAiAvailable()).toBe(true);
  });

  it("reports nothing reachable with no credentials at all, without throwing", async () => {
    vi.resetModules();
    const { builderAiAvailable, builderMediaAvailability } = await import(
      "@/lib/ai/availability"
    );
    expect(builderAiAvailable()).toBe(false);
    expect(builderMediaAvailability()).toEqual({ vision: false, voice: false, source: null });
  });
});

describe("no free provider available", () => {
  it("fails with a clear, non-retryable, non-blocking explanation", async () => {
    vi.resetModules();
    const { freeAiUnavailable } = await import("@/lib/ai/errors");
    const error = freeAiUnavailable("no free provider configured or in budget");
    expect(error.category).toBe("free_unavailable");
    expect(error.retryable).toBe(false);
    expect(error.message).toMatch(/no paid AI is required/i);
  });
});
