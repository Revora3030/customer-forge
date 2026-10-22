import { describe, expect, it } from "vitest";
import { scopedPreferredModels, withModelPreference } from "./model-preference-scope.server";
describe("admin model pick scope", () => {
  it("leads with the pick inside the request", () => {
    expect(withModelPreference("anthropic/claude-opus-5-5", () => scopedPreferredModels(["openai/gpt-6-sol"]))).toEqual(["anthropic/claude-opus-5-5", "openai/gpt-6-sol"]);
  });
  it("does not leak outside the request", () => {
    withModelPreference("anthropic/claude-opus-5-5", () => null);
    expect(scopedPreferredModels()).toBeUndefined();
  });
});
