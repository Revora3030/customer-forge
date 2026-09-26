import { describe, expect, it } from "vitest";
import { pairTurns, toTurns } from "./builder-memory";

describe("saved builder conversation", () => {
  it("pairs each request with its reply in order", () => {
    const turns = toTurns([
      { role: "user", content: "Add a pricing page", created_at: "1" },
      { role: "assistant", content: "Added it.", created_at: "2" },
      { role: "user", content: "Make headlines shorter", created_at: "3" },
    ]);
    expect(pairTurns(turns)).toEqual([
      { instruction: "Add a pricing page", reply: "Added it.", at: "1" },
      { instruction: "Make headlines shorter", reply: "", at: "3" },
    ]);
  });

  it("puts a request before its reply when saved at the same moment", () => {
    const turns = toTurns([
      { role: "assistant", content: "Reply", created_at: "1" },
      { role: "user", content: "Ask", created_at: "1" },
    ]);
    expect(pairTurns(turns)).toEqual([{ instruction: "Ask", reply: "Reply", at: "1" }]);
  });

  it("drops empty or unknown rows", () => {
    expect(toTurns([{ role: "system", content: "x", created_at: "1" }, { role: "user", content: " ", created_at: "2" }])).toEqual([]);
  });

  it("keeps every assistant outcome with the request that caused it", () => {
    const turns = toTurns([
      { role: "user", content: "Redesign the home page", created_at: "1" },
      { role: "assistant", content: "I planned the redesign.", created_at: "2" },
      { role: "assistant", content: "18 changes applied to your draft.", created_at: "3" },
    ]);
    expect(pairTurns(turns)).toEqual([
      {
        instruction: "Redesign the home page",
        reply: "I planned the redesign.\n\n18 changes applied to your draft.",
        at: "1",
      },
    ]);
  });

  it("restores the saved result metadata on the same request", () => {
    const turns = toTurns([
      { role: "user", content: "Add a gallery", created_at: "1" },
      {
        role: "assistant",
        content: "6 changes applied to your draft.",
        created_at: "2",
        plan: { state: "complete", applied: 6, snapshotVersion: 12 },
      },
    ]);
    expect(pairTurns(turns)[0]?.taskResult).toEqual({
      state: "complete",
      applied: 6,
      snapshotVersion: 12,
    });
  });
});
