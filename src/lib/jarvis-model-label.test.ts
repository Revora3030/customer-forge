import { describe, expect, it } from "vitest";
import { answeringModel, formatModelLabel } from "./jarvis-model-label";
import { resolveModelConfig } from "./ai/config";

describe("Jarvis model label", () => {
  it("formats recorded Lovable models", () => {
    expect(formatModelLabel("anthropic/claude-sonnet-4-6", "lovable")).toBe("Claude Sonnet 4.6 · Lovable");
    expect(formatModelLabel("openai/gpt-6-sol", "lovable")).toBe("GPT-6 Sol · Lovable");
  });
  it("shows nothing when no model was recorded", () => {
    expect(answeringModel([])).toBeNull();
    expect(answeringModel([{ model: null, provider: null, status: "ok" }])).toBeNull();
  });
  it("uses the last successful call and marks free fallbacks as backup", () => {
    expect(answeringModel([
      { model: "openai/gpt-6-sol", provider: "lovable", status: "failed" },
      { model: "qwen-3", provider: "groq", status: "ok" },
    ])).toEqual({ label: "Qwen 3 · groq", backup: true });
    expect(answeringModel([{ model: "openai/gpt-6-sol", provider: "lovable", status: "ok" }])?.backup).toBe(false);
  });
});

describe("Jarvis conversation roster", () => {
  it("leads with strong Lovable models and includes Claude", () => {
    const roster = resolveModelConfig({ LOVABLE_API_KEY: "x" } as never).lovable.conversation.split(",");
    expect(roster[0]).toBe("openai/gpt-6.1-sol");
    expect(roster).toContain("anthropic/claude-sonnet-5");
    expect(roster.length).toBeGreaterThanOrEqual(8);
  });
});
