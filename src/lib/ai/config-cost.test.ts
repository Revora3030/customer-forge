import { describe, expect, it } from "vitest";
import { estimateCostUsd, eventCostUsd } from "./config";

describe("cost estimates", () => {
  it("prices a catalogue id the same as its bare id", () => {
    const bare = estimateCostUsd("gemini-3.8-flash", 1_000_000, 0);
    const prefixed = estimateCostUsd("google/gemini-3.8-flash", 1_000_000, 0);
    expect(bare).toBe(0.3);
    expect(prefixed).toBe(bare);
    expect(estimateCostUsd("openai/gpt-5.6-sol", 0, 1_000_000)).toBe(10);
    expect(estimateCostUsd("anthropic/claude-sonnet-5", 1_000_000, 0)).toBe(3);
  });

  it("recomputes a null stored cost from the prefixed model id", () => {
    expect(eventCostUsd({ model: "google/gemini-3.8-flash", input_tokens: 1_000_000, output_tokens: 0, estimated_cost_usd: null })).toBe(0.3);
    expect(eventCostUsd({ model: "google/gemini-3.8-flash", input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 })).toBe(0);
  });

  it("returns null for a model with no published price", () => {
    expect(estimateCostUsd("not-a-model", 100, 100)).toBeNull();
  });
});
