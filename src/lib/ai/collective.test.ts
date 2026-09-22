/**
 * The model collective's routing guarantees.
 *
 * These prove Sol is reachable for master work, Terra genuinely serves the
 * senior-specialist band, Luna keeps the cheap high-volume work, and that no
 * paid tier can ever be selected while the paid lane is off.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  COLLECTIVE_TIERS,
  DEFAULT_COLLECTIVE_MODELS,
  classifyComplexity,
  purposeTier,
  selectTier,
  tierAtLeast,
} from "@/lib/ai/collective";
import {
  availableTiers,
  callCollective,
  collectiveStatus,
  costMicrocents,
  estimateMicrocents,
  tierModel,
} from "@/lib/ai/luna.server";

const saved = { ...process.env };

function enablePaidLane() {
  process.env["OPENAI_API_KEY"] = "sk-test";
  process.env["LUNA_ENABLED"] = "true";
  process.env["ZERO_AI_COST_MODE"] = "false";
  process.env["BUILDER_EXTERNAL_AI_ALLOWED"] = "true";
}

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("tier routing", () => {
  it("sends master work to Sol", () => {
    for (const purpose of [
      "creative_direction",
      "information_architecture",
      "conversion_architecture",
      "visual_review",
      "adversarial_review",
      "quality_review",
      "hard_request",
    ] as const) {
      expect(purposeTier(purpose)).toBe("sol");
      expect(selectTier({ purpose, available: COLLECTIVE_TIERS })).toMatchObject({
        tier: "sol",
        downgraded: false,
      });
    }
  });

  it("gives Terra real work rather than dead configuration", () => {
    for (const purpose of [
      "second_opinion",
      "page_planning",
      "seo_analysis",
      "design_alternative",
      "repair_plan",
      "plan_review",
    ] as const) {
      expect(selectTier({ purpose, available: COLLECTIVE_TIERS }).tier).toBe("terra");
    }
  });

  it("keeps cheap, repetitive work on Luna", () => {
    for (const purpose of [
      "extraction",
      "classification",
      "rewrite",
      "small_edit",
      "metadata",
      "intent",
    ] as const) {
      expect(selectTier({ purpose, available: COLLECTIVE_TIERS }).tier).toBe("luna");
    }
  });

  it("lets complexity promote a task but never demote master work", () => {
    expect(selectTier({ purpose: "rewrite", complexity: "high", available: COLLECTIVE_TIERS }).tier).toBe(
      "sol",
    );
    expect(
      selectTier({ purpose: "creative_direction", complexity: "low", available: COLLECTIVE_TIERS })
        .tier,
    ).toBe("sol");
  });

  it("treats a fresh build and a risky change as master work", () => {
    expect(classifyComplexity({ freshBuild: true })).toBe("high");
    expect(classifyComplexity({ riskyChange: true })).toBe("high");
    expect(classifyComplexity({ pageCount: 5 })).toBe("high");
    expect(classifyComplexity({ pageCount: 2 })).toBe("medium");
    expect(classifyComplexity({})).toBe("low");
  });

  it("degrades gracefully when Sol is unavailable", () => {
    const choice = selectTier({ purpose: "creative_direction", available: ["terra", "luna"] });
    expect(choice).toMatchObject({ tier: "terra", wanted: "sol", downgraded: true });
  });

  it("degrades to Luna when only Luna is left", () => {
    expect(selectTier({ purpose: "creative_direction", available: ["luna"] }).tier).toBe("luna");
  });

  it("steps up only when nothing weaker exists", () => {
    expect(selectTier({ purpose: "metadata", available: ["sol"] })).toMatchObject({
      tier: "sol",
      downgraded: true,
    });
  });

  it("selects nothing at all when no tier is available", () => {
    expect(selectTier({ purpose: "creative_direction", available: [] }).tier).toBeNull();
  });

  it("ranks tiers consistently", () => {
    expect(tierAtLeast("sol", "terra")).toBe(true);
    expect(tierAtLeast("luna", "terra")).toBe(false);
  });
});

describe("credential and opt-in gating", () => {
  it("offers every tier by default when the key is present", () => {
    delete process.env["LUNA_ENABLED"];
    expect(availableTiers()).toEqual(["sol", "terra", "luna"]);
  });

  it("offers no tier when an operator switches the lane off", () => {
    process.env["LUNA_ENABLED"] = "false";
    expect(availableTiers()).toEqual([]);
  });

  it("offers no tier without a key, even when opted in", () => {
    enablePaidLane();
    delete process.env["OPENAI_API_KEY"];
    expect(availableTiers()).toEqual([]);
  });

  it("offers no tier in native-only mode", () => {
    enablePaidLane();
    process.env["ZERO_AI_COST_MODE"] = "true";
    expect(availableTiers()).toEqual([]);
  });

  it("offers all three tiers once an operator opts in", () => {
    enablePaidLane();
    expect(availableTiers()).toEqual(["sol", "terra", "luna"]);
  });

  it("lets one tier be switched off on its own", () => {
    enablePaidLane();
    process.env["SOL_ENABLED"] = "false";
    expect(availableTiers()).toEqual(["terra", "luna"]);
  });

  it("never calls a paid model when the paid lane is off", async () => {
    process.env["LUNA_ENABLED"] = "false";
    const result = await callCollective({
      purpose: "creative_direction",
      system: "s",
      user: "u",
    });
    expect(result).toMatchObject({ ok: false, tier: null, reason: "no_tier_available" });
  });

  it("refuses a tier its operator switched off instead of silently substituting", async () => {
    enablePaidLane();
    process.env["SOL_ENABLED"] = "false";
    const result = await callCollective({
      purpose: "creative_direction",
      system: "s",
      user: "u",
    });
    // Terra takes the work; Sol is never called behind the scenes.
    if (!result.ok) expect(result.tier).toBe("terra");
    else expect(result.tier).toBe("terra");
  });
});

describe("models and cost truthfulness", () => {
  it("defaults each tier to its allowed model", () => {
    for (const tier of COLLECTIVE_TIERS) {
      delete process.env[`${tier.toUpperCase()}_MODEL`];
      expect(tierModel(tier)).toBe(DEFAULT_COLLECTIVE_MODELS[tier]);
    }
    expect(DEFAULT_COLLECTIVE_MODELS).toEqual({
      sol: "gpt-5.6-sol",
      terra: "gpt-5.6-terra",
      luna: "gpt-5.6-luna",
    });
  });

  it("lets an operator repoint a tier without a deploy", () => {
    process.env["SOL_MODEL"] = "gpt-5.4-mini";
    expect(tierModel("sol")).toBe("gpt-5.4-mini");
  });

  it("prices the master tier above the economical tier", () => {
    for (const name of [
      "SOL_PRICE_INPUT_PER_MTOK",
      "SOL_PRICE_OUTPUT_PER_MTOK",
      "LUNA_PRICE_INPUT_PER_MTOK",
      "LUNA_PRICE_OUTPUT_PER_MTOK",
    ])
      delete process.env[name];
    const usage = { inputTokens: 100_000, cachedInputTokens: 0, outputTokens: 10_000 };
    expect(costMicrocents(usage, "sol")).toBeGreaterThan(costMicrocents(usage, "luna"));
    expect(estimateMicrocents(4_000, 1_000, "sol")).toBeGreaterThan(
      estimateMicrocents(4_000, 1_000, "luna"),
    );
  });

  it("reports each tier honestly without revealing anything secret", () => {
    enablePaidLane();
    const status = collectiveStatus();
    expect(status.map((entry) => entry.tier)).toEqual(["sol", "terra", "luna"]);
    expect(status.every((entry) => entry.enabled)).toBe(true);
    expect(JSON.stringify(status)).not.toContain("sk-test");
  });
});
