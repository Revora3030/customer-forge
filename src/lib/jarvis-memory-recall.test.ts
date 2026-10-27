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
