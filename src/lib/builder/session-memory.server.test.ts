import { describe, expect, it } from "vitest";
import { loadMemory, recallBrief, rememberExchange } from "@/lib/builder/session-memory.server";

type Row = {
  id: string;
  kind: string;
  text: string;
  pinned: boolean;
  created_at: string;
};

/** A stand-in workspace database, scoped by organization id like RLS is. */
function fakeClient(rows: Row[], options: { failInsert?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  const client = {
    from() {
      return {
        select: () => ({
          eq: (_column: string, _value: string) => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
        insert: async (payload: unknown) => {
          if (options.failInsert) return { error: { message: "denied" } };
          inserted.push(...(payload as Record<string, unknown>[]));
          return { error: null };
        },
        delete: () => ({
          eq: () => ({
            in: async (_column: string, ids: string[]) => {
              deleted.push(...ids);
              return { error: null };
            },
          }),
        }),
      };
    },
  };
  return { client: client as never, inserted, deleted };
}

const row = (id: string, kind: string, text: string, at: string, pinned = false): Row => ({
  id,
  kind,
  text,
  pinned,
  created_at: at,
});

describe("long-session memory storage", () => {
  it("reads what is remembered for the workspace", async () => {
    const { client } = fakeClient([row("1", "rule", "always keep the headline", "2024-01-01")]);
    const entries = await loadMemory(client, "org");
    expect(entries).toEqual([
      {
        id: "1",
        kind: "rule",
        text: "always keep the headline",
        pinned: false,
        createdAt: "2024-01-01",
      },
    ]);
  });

  it("briefs the planner from stored memory", async () => {
    const { client } = fakeClient([row("1", "rule", "always keep the headline", "2024-01-01")]);
    const brief = await recallBrief(client, "org");
    expect(brief).toContain("always keep the headline");
  });

  it("records only notes that are genuinely new", async () => {
    const { client, inserted } = fakeClient([
      row("1", "rule", "Always keep the headline", "2024-01-01"),
    ]);
    const result = await rememberExchange(client, "org", "user-1", {
      instruction: "Always keep the headline. Add a gallery to the home page.",
      applied: ["gallery on /home"],
    });
    const kinds = inserted.map((entry) => entry["kind"]);
    expect(kinds).not.toContain("rule");
    expect(kinds).toContain("decision");
    expect(kinds).toContain("outcome");
    expect(result.added).toBe(inserted.length);
    expect(inserted.every((entry) => entry["organization_id"] === "org")).toBe(true);
  });

  it("never throws when the database refuses the write", async () => {
    const { client } = fakeClient([], { failInsert: true });
    await expect(
      rememberExchange(client, "org", null, { instruction: "add a gallery" }),
    ).resolves.toEqual({ added: 1, forgotten: 0 });
  });

  it("forgets the oldest ordinary notes once the journal is full", async () => {
    const rows = Array.from({ length: 45 }, (_, index) =>
      row(
        `r${index}`,
        "decision",
        `ask ${index}`,
        new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
      ),
    );
    const { client, deleted } = fakeClient(rows);
    const result = await rememberExchange(client, "org", null, { instruction: "one more ask" });
    expect(result.forgotten).toBeGreaterThan(0);
    expect(deleted.length).toBe(result.forgotten);
    expect(deleted).toContain("r0");
  });
});
