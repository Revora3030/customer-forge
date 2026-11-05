import { describe, expect, it } from "vitest";
import { isSavedTaskResult, toTurns } from "./builder-memory";

describe("SavedTaskResult agentRunId (PAI-15)", () => {
  it("accepts a complete result with a non-empty agentRunId", () => {
    expect(isSavedTaskResult({ state: "complete", agentRunId: "run-1" })).toBe(true);
    expect(isSavedTaskResult({ state: "complete", agentRunId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })).toBe(true);
  });

  it("rejects blank or non-string agentRunId when the field is present", () => {
    expect(isSavedTaskResult({ state: "complete", agentRunId: "" })).toBe(false);
    expect(isSavedTaskResult({ state: "complete", agentRunId: "  " })).toBe(false);
    expect(isSavedTaskResult({ state: "complete", agentRunId: 12 })).toBe(false);
  });

  it("round-trips agentRunId through toTurns from a saved plan", () => {
    const turns = toTurns([
      {
        role: "assistant",
        content: "Working on it",
        created_at: "2026-11-05T00:00:00Z",
        plan: { state: "complete", agentRunId: "run-xyz" },
        request_id: "t1",
      },
    ]);
    expect(turns[0]?.taskResult).toEqual({ state: "complete", agentRunId: "run-xyz" });
  });
});
