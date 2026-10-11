import { describe, expect, it } from "vitest";
import { pairTurns } from "./builder-message-pairing";
import { pairTurns as integratedPairTurns, toTurns } from "./builder-memory";
import type { SavedTurn } from "./builder-memory";
const turn = (role: SavedTurn["role"], content: string, requestId: string | null, at: string, branch = "main"): SavedTurn => ({ role, content, requestId, at, branch });
describe("request-aware saved chat pairing", () => {
  it("pairs replies with request ids, not the most recent user", () => {
    const pairs = pairTurns([turn("user", "First", "req-a", "1"), turn("user", "Second", "req-b", "2"), turn("assistant", "Reply A", "req-a", "3"), turn("assistant", "Reply B", "req-b", "4")]);
    expect(pairs.map((p) => [p.instruction, p.reply])).toEqual([["First", "Reply A"], ["Second", "Reply B"]]);
  });
  it("does not cross branches when request ids are reused", () => {
    const pairs = pairTurns([turn("user", "Main", "req-a", "1"), turn("user", "Alternative", "req-a", "2", "alternative"), turn("assistant", "Main reply", "req-a", "3"), turn("assistant", "Alt reply", "req-a", "4", "alternative")]);
    expect(pairs.map((p) => p.reply)).toEqual(["Main reply", "Alt reply"]);
  });
  it("can pair a tagged reply persisted before its user turn", () => {
    expect(pairTurns([turn("assistant", "Early reply", "req-a", "1"), turn("user", "Question", "req-a", "2")])[0]?.reply).toBe("Early reply");
  });
  it("does not attach an unknown tagged reply to an unrelated request", () => {
    expect(pairTurns([turn("user", "Question", "req-a", "1"), turn("assistant", "Other reply", "req-b", "2")])[0]?.reply).toBe("");
  });
  it("keeps the legacy no-id shape and branch-local ordering", () => {
    expect(pairTurns([{ role: "user", content: "Question", at: "1" }, { role: "assistant", content: "Reply", at: "2" }])).toEqual([{ instruction: "Question", reply: "Reply", at: "1" }]);
    const pairs = pairTurns([turn("user", "Main", null, "1"), turn("user", "Alt", null, "2", "alternative"), turn("assistant", "Main reply", null, "3")]);
    expect(pairs.map((p) => p.reply)).toEqual(["Main reply", ""]);
  });
  it("keeps retry ids distinct and normalizes supported id spellings", () => {
    const pairs = pairTurns([turn("user", "Original", "req-a", "1"), turn("user", "Retry", "req-a~r9", "2"), turn("assistant", "Retried", "req-a_r9", "3")]);
    expect(pairs.map((p) => p.reply)).toEqual(["", "Retried"]);
  });
  it("does not mutate saved turns while collecting replies", () => {
    const turns = [turn("user", "Question", "req-a", "1"), turn("assistant", "Reply", "req-a", "2")];
    const before = JSON.stringify(turns); pairTurns(turns); expect(JSON.stringify(turns)).toBe(before);
  });
});

describe("chat-memory integration", () => {
  it("uses the request-aware pairing through the existing public API", () => {
    const rows = [
      { role: "user", content: "First", created_at: "1", request_id: "req-a" },
      { role: "user", content: "Second", created_at: "2", request_id: "req-b" },
      { role: "assistant", content: "Reply A", created_at: "3", request_id: "req-a" },
    ];
    expect(integratedPairTurns(toTurns(rows)).map((p) => p.reply)).toEqual(["Reply A", ""]);
  });
  it("normalizes result JSON and identifiers while loading database turns", () => {
    const turns = toTurns([{ role: "assistant", content: "Your free access has ended.", created_at: "1", request_id: "req-a~r9", branch: "Alternative!", plan: { state: "failed", applied: -1, retryable: true } }]);
    expect(turns[0]).toMatchObject({ requestId: "req-a_r9", branch: "alternative", taskResult: { state: "failed", retryable: false } });
    expect(turns[0]?.taskResult?.applied).toBeUndefined();
  });
});
