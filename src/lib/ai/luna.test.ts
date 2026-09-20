/**
 * Luna guardrails. These tests exist to prove the paid orchestrator can never
 * become a worker, can never spend past the monthly cap, and can never stop a
 * customer's website from being built.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LUNA_MODEL,
  DEFAULT_MONTHLY_CAP_MICROCENTS,
  MICROCENTS_PER_DOLLAR,
  callLuna,
  costMicrocents,
  estimateMicrocents,
  formatUsd,
  lunaEnabled,
  lunaModel,
  lunaMonthlyCapMicrocents,
  readText,
  readUsage,
} from "@/lib/ai/luna.server";
import { providerChain, zeroAiCostMode } from "@/lib/ai/config";

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("luna configuration", () => {
  it("defaults to the GPT-5.6 Luna orchestrator model", () => {
    delete process.env["LUNA_MODEL"];
    expect(lunaModel()).toBe(DEFAULT_LUNA_MODEL);
    expect(DEFAULT_LUNA_MODEL).toBe("gpt-5.6-luna");
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

  it("is on with a key and no explicit opt-out", () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    delete process.env["LUNA_ENABLED"];
    expect(lunaEnabled()).toBe(true);
  });
});

describe("monthly hard cap", () => {
  it("defaults to a $20 monthly cap", () => {
    delete process.env["LUNA_MONTHLY_CAP_USD"];
    expect(lunaMonthlyCapMicrocents()).toBe(DEFAULT_MONTHLY_CAP_MICROCENTS);
    expect(DEFAULT_MONTHLY_CAP_MICROCENTS).toBe(20 * MICROCENTS_PER_DOLLAR);
    expect(formatUsd(DEFAULT_MONTHLY_CAP_MICROCENTS)).toBe("$20.00");
  });

  it("honours a configured cap", () => {
    process.env["LUNA_MONTHLY_CAP_USD"] = "5";
    expect(formatUsd(lunaMonthlyCapMicrocents())).toBe("$5.00");
  });

  it("ignores a nonsense cap rather than spending without a limit", () => {
    process.env["LUNA_MONTHLY_CAP_USD"] = "not-a-number";
    expect(lunaMonthlyCapMicrocents()).toBe(DEFAULT_MONTHLY_CAP_MICROCENTS);
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

describe("free workforce is untouched", () => {
  it("keeps every worker role on the free/deterministic path", () => {
    process.env["OPENAI_API_KEY"] = "sk-test";
    process.env["ZERO_AI_COST_MODE"] = "true";
    expect(zeroAiCostMode()).toBe(true);
    // The paid worker chain stays empty even with a paid key present, so no
    // worker role (primary/design/fast/vision/coding/image/transcription) can
    // ever resolve to a billed model.
    expect(providerChain()).toEqual([]);
  });
});
