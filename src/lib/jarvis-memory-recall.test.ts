import { describe, expect, it } from "vitest";
import { memoryPromptBlock } from "@/lib/jarvis-memory.server";

/** Minimal chainable fake of the one query memoryPromptBlock makes. */
function fakeDb(rows: { id: string; kind: string; content: string; source: string; created_at: string; updated_at: string }[]) {
  const calls: { limit?: number } = {};
  const chain: Record<string, unknown> = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: (n: number) => { calls.limit = n; return Promise.resolve({ data: rows.slice(0, n), error: null }); },
  };
  return { db: { from: () => chain } as never, calls };
}

const row = (id: string, content: string, daysAgo: number) => {
  const at = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return { id, kind: "preference", content, source: "chat", created_at: at, updated_at: at };
};

describe("memoryPromptBlock", () => {
  const rows = [
    ...Array.from({ length: 60 }, (_, i) => row(`n${i}`, `Routine billing note ${i} about invoices`, i)),
    row("font", "Luxury automotive sites prefer a serif display font", 90),
  ];

  it("without a query keeps the newest-first behaviour and reads only the newest", async () => {
    const { db, calls } = fakeDb(rows);
    const block = await memoryPromptBlock(db, "u1");
    expect(calls.limit).toBe(40);
    expect(block).not.toContain("serif display font");
  });

  it("with the owner's message reads the full store and surfaces the relevant old memory", async () => {
    const { db, calls } = fakeDb(rows);
    const block = await memoryPromptBlock(db, "u1", "which font for the luxury automotive site?");
    expect(calls.limit).toBe(200);
    expect(block).toContain("serif display font");
  });
});

describe("memoryPromptBlock with obligation and supersession columns", () => {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  function fakeDbWithExtras(rows: ReturnType<typeof row>[], extras: Record<string, unknown>[] | "missing_columns") {
    const main: Record<string, unknown> = {
      select: () => main, eq: () => main, order: () => main,
      limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      or: () => Promise.resolve(extras === "missing_columns" ? { data: null, error: { message: "column jarvis_memories.due_at does not exist" } } : { data: extras, error: null }),
    };
    return { from: () => main } as never;
  }
  const rows = [row("a", "Prefers morning site visits", 2), row("old", "Brand colour is navy", 40), row("new", "Brand colour is forest green", 1)];

  it("behaves exactly as before when the new columns are not there yet", async () => {
    const block = await memoryPromptBlock(fakeDbWithExtras(rows, "missing_columns"), "u1");
    expect(block).toContain("Brand colour is navy");
    expect(block).not.toContain("DUE OBLIGATIONS");
  });

  it("drops a superseded memory and raises due obligations soonest first", async () => {
    const extras = [
      { id: "old", kind: "fact", content: "Brand colour is navy", created_at: iso(40), due_at: null, completed_at: null, superseded_by: "new", half_life_days: null },
      { id: "o1", kind: "note", content: "Send Dana the revised quote", created_at: iso(3), due_at: iso(1), completed_at: null, superseded_by: null, half_life_days: null },
      { id: "o2", kind: "note", content: "Renew the domain", created_at: iso(3), due_at: iso(2), completed_at: null, superseded_by: null, half_life_days: null },
      { id: "o3", kind: "note", content: "Filed permit", created_at: iso(3), due_at: iso(2), completed_at: iso(1), superseded_by: null, half_life_days: null },
      { id: "o4", kind: "note", content: "Next quarter review", created_at: iso(3), due_at: iso(-30), completed_at: null, superseded_by: null, half_life_days: null },
    ];
    const block = (await memoryPromptBlock(fakeDbWithExtras(rows, extras), "u1"))!;
    expect(block).toContain("Brand colour is forest green");
    expect(block).not.toContain("Brand colour is navy");
    expect(block).toContain("DUE OBLIGATIONS");
    expect(block.indexOf("Renew the domain")).toBeLessThan(block.indexOf("Send Dana the revised quote"));
    expect(block).not.toContain("Filed permit");
    expect(block).not.toContain("Next quarter review");
  });
});
