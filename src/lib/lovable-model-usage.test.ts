import { describe, expect, it } from "vitest";
import { summarizeModelUsage } from "./lovable-model-usage";

describe("summarizeModelUsage", () => {
  it("counts calls per model and lists unused roster models with zero", () => {
    const out = summarizeModelUsage(
      [
        { model: "anthropic/claude-sonnet-5", task: "builder-thinker.adversarial_review", ok: true, estimated_cost_usd: 0.01 },
        { model: "anthropic/claude-sonnet-5", task: "builder-thinker.adversarial_review", ok: false, estimated_cost_usd: null },
      ],
      ["anthropic/claude-sonnet-5", "google/gemini-4-argon"],
    );
    expect(out[0]).toMatchObject({ model: "anthropic/claude-sonnet-5", calls: 2, ok: 1, failed: 1, costUsd: 0.01, jobs: ["adversarial_review"] });
    expect(out[1]).toMatchObject({ model: "google/gemini-4-argon", calls: 0, costUsd: null });
  });
});
