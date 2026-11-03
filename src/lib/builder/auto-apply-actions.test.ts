import { describe, expect, it } from "vitest";
import { autoApplyActions } from "@/lib/site-agent.functions";

describe("server applies a plan on its own only when the chat would", () => {
  const step = (action: unknown, destructive = false) => ({ action, destructive });
  it("reversible steps with no questions are applied", () => {
    expect(autoApplyActions({ steps: [step({ a: 1 }), step({ b: 2 })], questions: [] })).toEqual([{ a: 1 }, { b: 2 }]);
  });
  it("anything that removes something waits for the owner", () => {
    expect(autoApplyActions({ steps: [step({ a: 1 }), step({ b: 2 }, true)], questions: [] })).toBeNull();
  });
  it("open questions, chat answers, deferrals and unavailable plans are never applied", () => {
    expect(autoApplyActions({ steps: [step({ a: 1 })], questions: ["Which page?"] })).toBeNull();
    expect(autoApplyActions({ steps: [step({ a: 1 })], conversational: true })).toBeNull();
    expect(autoApplyActions({ steps: [step({ a: 1 })], deferred: true })).toBeNull();
    expect(autoApplyActions({ steps: [step({ a: 1 })], unavailable: { retryable: true } })).toBeNull();
    expect(autoApplyActions({ steps: [] })).toBeNull();
  });
});
