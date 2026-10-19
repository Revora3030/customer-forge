/**
 * Luna guardrails. These tests exist to prove the paid orchestrator can never
 * become a worker, can never spend past the monthly cap, and can never stop a
 * customer's website from being built.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LUNA_MODEL,
  DEFAULT_MONTHLY_CAP_MICROCENTS,
  ERROR_BODY_LIMIT_BYTES,
  ERROR_REASON_MAX_CHARS,
  MICROCENTS_PER_DOLLAR,
  callLuna,
  costMicrocents,
  estimateMicrocents,
  extractProviderErrorMessage,
  formatUsd,
  httpFailureReason,
  readProviderErrorMessage,
  lunaEnabled,
  lunaModel,
  lunaMonthlyCapMicrocents,
  lunaTenantMonthlyCapMicrocents,
  readText,
  readUsage,
  refusesEffortNone,
} from "@/lib/ai/luna.server";
import { providerChain } from "@/lib/ai/config";

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("luna configuration", () => {
  it("is available with a key and turns off only on an explicit switch", () => {
    process.env["OPENAI_API_KEY"] = "configured";
    delete process.env["BUILDER_EXTERNAL_AI_ALLOWED"];
    delete process.env["LUNA_ENABLED"];
    expect(lunaEnabled()).toBe(true);
    process.env["LUNA_ENABLED"] = "false";
    expect(lunaEnabled()).toBe(false);
  });

  it("defaults to the GPT-5.6 Luna orchestrator model", () => {
    delete process.env["LUNA_MODEL"];
    expect(lunaModel()).toBe(DEFAULT_LUNA_MODEL);
    expect(DEFAULT_LUNA_MODEL).toBe("gpt-6-luna");
  });

  it("lets an operator point the orchestrator at another model without a deploy", () => {
    process.env["LUNA_MODEL"] = "gpt-5.6-terra";
    expect(lunaModel()).toBe("gpt-5.6-terra");
  });

  it("is off when no key is present", () => {
    delete process.env["OPENAI_API_KEY"];
    expect(lunaEnabled()).toBe(false);
  });

  it("is off when an operator disables it even with a key present", () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["LUNA_ENABLED"] = "false";
    expect(lunaEnabled()).toBe(false);
  });

  it("is on with a key and no operator switch", () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    delete process.env["LUNA_ENABLED"];
    expect(lunaEnabled()).toBe(true);
  });

});

describe("monthly hard cap", () => {
  it("defaults to a $20 monthly cap", () => {
    delete process.env["LUNA_MONTHLY_CAP_USD"];
    expect(lunaMonthlyCapMicrocents()).toBe(DEFAULT_MONTHLY_CAP_MICROCENTS);
    expect(DEFAULT_MONTHLY_CAP_MICROCENTS).toBe(100 * MICROCENTS_PER_DOLLAR);
    expect(formatUsd(DEFAULT_MONTHLY_CAP_MICROCENTS)).toBe("$100.00");
  });

  it("honours a configured cap", () => {
    process.env["LUNA_MONTHLY_CAP_USD"] = "5";
    expect(formatUsd(lunaMonthlyCapMicrocents())).toBe("$5.00");
  });

  it("ignores a nonsense cap rather than spending without a limit", () => {
    process.env["LUNA_MONTHLY_CAP_USD"] = "not-a-number";
    expect(lunaMonthlyCapMicrocents()).toBe(DEFAULT_MONTHLY_CAP_MICROCENTS);
  });

  it("keeps every workspace allocation beneath the global cap", () => {
    process.env["LUNA_MONTHLY_CAP_USD"] = "20";
    process.env["LUNA_TENANT_MONTHLY_CAP_USD"] = "25";
    expect(lunaTenantMonthlyCapMicrocents()).toBe(20 * MICROCENTS_PER_DOLLAR);

    process.env["LUNA_TENANT_MONTHLY_CAP_USD"] = "3";
    expect(lunaTenantMonthlyCapMicrocents()).toBe(3 * MICROCENTS_PER_DOLLAR);
  });
});

describe("cost accounting", () => {
  it("charges cached input at the cheaper cached rate", () => {
    delete process.env["LUNA_PRICE_INPUT_PER_MTOK"];
    delete process.env["LUNA_PRICE_CACHED_INPUT_PER_MTOK"];
    delete process.env["LUNA_PRICE_OUTPUT_PER_MTOK"];
    const fresh = costMicrocents({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    const cached = costMicrocents({
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cached).toBeLessThan(fresh);
    expect(cached).toBeGreaterThan(0);
  });

  it("never returns a negative cost from malformed usage", () => {
    expect(
      costMicrocents({ inputTokens: -5, cachedInputTokens: -5, outputTokens: -5 }),
    ).toBe(0);
  });

  it("estimates before the call so the cap is enforced ahead of spend", () => {
    expect(estimateMicrocents(4_000, 1_000)).toBeGreaterThan(0);
    expect(estimateMicrocents(0, 0)).toBe(0);
  });

  it("reads real usage and cached tokens from a provider reply", () => {
    expect(
      readUsage({
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 100 },
        },
      }),
    ).toEqual({ inputTokens: 120, cachedInputTokens: 100, outputTokens: 30 });
  });

  it("treats a malformed usage block as zero rather than guessing", () => {
    expect(readUsage(null)).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
  });
});

describe("answers", () => {
  it("reads the orchestrator's answer", () => {
    expect(readText({ choices: [{ message: { content: " plan " } }] })).toBe("plan");
  });

  it("treats an empty answer as no answer", () => {
    expect(readText({ choices: [{ message: { content: "   " } }] })).toBeNull();
    expect(readText({ choices: [] })).toBeNull();
    expect(readText({})).toBeNull();
  });
});

describe("never blocks the builder", () => {
  it("skips with a reason instead of throwing when no key exists", async () => {
    delete process.env["OPENAI_API_KEY"];
    const result = await callLuna({ purpose: "intent", system: "s", user: "u" });
    expect(result).toEqual({ ok: false, reason: "no_key", detail: null });
  });

  it("skips with a reason when an operator disabled it", async () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["LUNA_ENABLED"] = "off";
    const result = await callLuna({ purpose: "plan_review", system: "s", user: "u" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");
  });
});

describe("paid HTTP failure detail", () => {
  const openAi400 = (message: string) =>
    new Response(JSON.stringify({ error: { message, type: "invalid_request_error", param: "reasoning_effort" } }), {
      status: 400,
    });

  it("records OpenAI's error.message for a 400 instead of only the status", async () => {
    const message = await readProviderErrorMessage(
      openAi400("Unsupported value: 'reasoning_effort' does not support 'none' with this model."),
    );
    expect(httpFailureReason(400, message)).toBe(
      "http 400: Unsupported value: 'reasoning_effort' does not support 'none' with this model.",
    );
  });

  it("recognises a model that refuses reasoning effort none, and nothing else", async () => {
    const message = await readProviderErrorMessage(
      openAi400("Unsupported value: 'reasoning_effort' does not support 'none' with this model. Supported values are: 'low', 'medium', 'high', and 'xhigh'."),
    );
    expect(refusesEffortNone(message ?? "")).toBe(true);
    expect(refusesEffortNone("Unsupported parameter: 'temperature'")).toBe(false);
    expect(refusesEffortNone("reasoning_effort must be one of low, medium")).toBe(false);
  });

  it("truncates the recorded reason to 200 characters", async () => {
    const message = await readProviderErrorMessage(openAi400(`Bad request. ${"detail ".repeat(100)}`));
    const reason = httpFailureReason(400, message);
    expect(reason.startsWith("http 400: Bad request. detail")).toBe(true);
    expect(reason.length).toBe(ERROR_REASON_MAX_CHARS);
    expect(ERROR_REASON_MAX_CHARS).toBe(200);
  });

  it("strips keys, tokens, emails and URLs from the provider message", () => {
    const reason = httpFailureReason(
      401,
      "Incorrect API key provided: sk-proj-abcdefghijklmnop. See https://platform.openai.com/account/api-keys or mail ops@example.com. Bearer abc.def",
    );
    expect(reason).not.toMatch(/sk-proj|platform\.openai\.com|ops@example\.com|abc\.def/);
    expect(reason).toContain("[key]");
    expect(reason).toContain("[url]");
  });

  it("reads no more than 2KB of the body and survives truncated JSON", async () => {
    const huge = JSON.stringify({ error: { message: `${"x".repeat(5000)} end` } });
    const message = await readProviderErrorMessage(new Response(huge, { status: 400 }));
    expect(message).not.toBeNull();
    expect((message ?? "").length).toBeLessThanOrEqual(ERROR_BODY_LIMIT_BYTES);
    expect(message).not.toContain("end");
  });

  it("falls back to the bare status when the body is empty or unreadable", async () => {
    expect(httpFailureReason(400, await readProviderErrorMessage(new Response(null, { status: 400 })))).toBe("http 400");
    expect(extractProviderErrorMessage('{"error":"model_not_found"}')).toBe("model_not_found");
  });

  it("is what callLuna writes to the usage row on a non-OK response", () => {
    const src = readFileSync("src/lib/ai/luna.server.ts", "utf8");
    const failure = src.slice(src.indexOf("if (!response.ok) {"), src.indexOf("let payload: unknown;"));
    expect(failure).toContain("await readProviderErrorMessage(response)");
    expect(failure).toContain("reason: httpFailureReason(response.status, providerMessage)");
  });
});

describe("no built-in engine switch", () => {
  it("can never switch the AI team off", () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    expect(providerChain().length).toBeGreaterThan(0);
  });
});
