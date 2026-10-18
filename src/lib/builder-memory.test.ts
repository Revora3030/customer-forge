import { beforeEach, describe, expect, it, vi } from "vitest";

/** Every call made on a fake builder_messages query, and the rows it returns. */
const db = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const query = () => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of ["from", "select", "eq", "neq", "lt", "order", "limit"]) {
      chain[name] = (...args: unknown[]) => {
        db.calls.push([name, ...args]);
        return chain;
      };
    }
    chain["then"] = (resolve: unknown) =>
      Promise.resolve({ data: db.rows, error: null }).then(resolve as (value: unknown) => unknown);
    return chain;
  };
  return { supabase: { from: (table: string) => (query()["from"] as (t: string) => unknown)(table) } };
});

import { loadEarlierTurns, loadTurns, MEMORY_TURNS, pairTurns, toTurns } from "./builder-memory";

describe("loading one conversation branch at a time", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.rows = [];
  });

  it("filters the newest page by branch", async () => {
    db.rows = [
      { role: "assistant", content: "Done darker.", created_at: "2026-10-07T00:00:02Z", request_id: "t2", kind: "text", branch: "darker" },
      { role: "user", content: "Make it darker", created_at: "2026-10-07T00:00:01Z", request_id: "t2", kind: "text", branch: "darker" },
    ];
    const turns = await loadTurns("org-a", "darker");
    expect(db.calls).toContainEqual(["eq", "organization_id", "org-a"]);
    expect(db.calls).toContainEqual(["eq", "branch", "darker"]);
    expect(turns.map((turn) => turn.content)).toEqual(["Make it darker", "Done darker."]);
  });

  it("defaults to the main branch", async () => {
    await loadTurns("org-a");
    expect(db.calls).toContainEqual(["eq", "branch", "main"]);
  });

  it("loads the page before the oldest shown message, and says when more may exist", async () => {
    db.rows = Array.from({ length: MEMORY_TURNS }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `turn ${index}`,
      created_at: `2026-10-06T00:00:${String(59 - (index % 60)).padStart(2, "0")}Z`,
      branch: "main",
    }));
    const page = await loadEarlierTurns("org-a", "main", "2026-10-07T00:00:00Z");
    expect(db.calls).toContainEqual(["lt", "created_at", "2026-10-07T00:00:00Z"]);
    expect(db.calls).toContainEqual(["eq", "branch", "main"]);
    expect(page.full).toBe(true);
    expect(page.turns).toHaveLength(MEMORY_TURNS);
  });

  it("an apply result is shown by its card, not repeated in the reply", () => {
    const pairs = pairTurns(
      toTurns([
        { role: "user", content: "Add a gallery", created_at: "1", request_id: "t5" },
        { role: "assistant", content: "I'll add a gallery.", created_at: "2", request_id: "t5" },
        { role: "assistant", content: "Updated your draft · 4 changes", created_at: "3", request_id: "t5", plan: { state: "complete", applied: 4 } },
      ] as never),
    );
    expect(pairs[0]?.reply).toBe("I'll add a gallery.");
    expect(pairs[0]?.taskResult?.applied).toBe(4);
  });
});

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
        content: "Updated your draft · 6 changes",
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

describe("saved builder conversation keyed by request id", () => {
  it("attaches a late result to the request it belongs to, not the newest one", () => {
    const turns = toTurns([
      { role: "user", content: "Remove the gallery", created_at: "1", request_id: "req-a" },
      { role: "assistant", content: "Approve to remove it?", created_at: "2", request_id: "req-a" },
      { role: "user", content: "Make headlines shorter", created_at: "3", request_id: "req-b" },
      { role: "assistant", content: "Gallery removed.", created_at: "4", request_id: "req-a" },
    ] as never);
    const pairs = pairTurns(turns);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]?.reply).toBe("Approve to remove it?\n\nGallery removed.");
    expect(pairs[1]?.reply).toBe("");
  });

  it("keeps a re-planned request as one entry", () => {
    const turns = toTurns([
      { role: "user", content: "Add pricing", created_at: "1", request_id: "req-a" },
      { role: "user", content: "Add pricing", created_at: "5", request_id: "req-a" },
      { role: "assistant", content: "Added it.", created_at: "6", request_id: "req-a" },
    ] as never);
    expect(pairTurns(turns)).toEqual([{ instruction: "Add pricing", reply: "Added it.", at: "1", requestId: "req-a" }]);
  });
});
