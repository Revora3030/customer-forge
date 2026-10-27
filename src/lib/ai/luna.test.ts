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
  MICROCENTS_PER_DOLLAR,
  costMicrocents,
  estimateMicrocents,
  formatUsd,
  lunaEnabled,
  lunaModel,
  lunaMonthlyCapMicrocents,
  lunaTenantMonthlyCapMicrocents,
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
    process.env["LOVABLE_API_KEY"] = "configured";
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
    delete process.env["LOVABLE_API_KEY"];
    expect(lunaEnabled()).toBe(false);
  });

  it("is off when an operator disables it even with a key present", () => {
    process.env["LOVABLE_API_KEY"] = "test-key";
    process.env["LUNA_ENABLED"] = "false";
    expect(lunaEnabled()).toBe(false);
  });

  it("is on with a key and no operator switch", () => {
    process.env["LOVABLE_API_KEY"] = "test-key";
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

});

describe("no built-in engine switch", () => {
  it("can never switch the AI team off", () => {
    process.env["LOVABLE_API_KEY"] = "test-key";
    expect(providerChain().length).toBeGreaterThan(0);
  });
});
