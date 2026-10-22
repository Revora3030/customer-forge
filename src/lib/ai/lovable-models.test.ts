import { describe, expect, it } from "vitest";
import { parsePickedModel, modelDisplayName } from "./lovable-models";
import { jarvisModelRequest } from "../jarvis-model-request.server";
describe("admin model picker", () => {
  it("ignores ids outside the roster", () => {
    expect(parsePickedModel("evil/model")).toBeNull();
  });
  it("puts the picked model first", () => {
    expect(jarvisModelRequest([], 100, "anthropic/claude-opus-5-5").preferModels).toEqual(["anthropic/claude-opus-5-5"]);
  });
  it("leaves Auto unchanged", () => {
    expect(jarvisModelRequest([], 100).preferModels).toBeUndefined();
  });
  it("labels models readably", () => {
    expect(modelDisplayName("openai/gpt-6.1-sol")).toBe("GPT 6.1 Sol");
  });
});
