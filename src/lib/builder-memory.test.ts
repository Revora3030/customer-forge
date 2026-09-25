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

  it("drops empty or unknown rows", () => {
    expect(toTurns([{ role: "system", content: "x", created_at: "1" }, { role: "user", content: " ", created_at: "2" }])).toEqual([]);
  });
});
