import { describe, expect, it } from "vitest";
import { Scratchpad, cosineSimilarity, recallMemories, tokenize } from "./memory-recall";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const mem = (id: string, content: string, age: number) => ({ id, kind: "preference", content, created_at: day(age) });

describe("recallMemories", () => {
  const memories = [
    mem("font", "Luxury automotive sites: prefer a high-contrast serif display font with wide tracking", 60),
    ...Array.from({ length: 50 }, (_, i) => mem(`n${i}`, `Unrelated note number ${i} about invoices and billing`, i)),
  ];

  it("surfaces an old relevant memory that the newest-N rule would drop", () => {
    const picked = recallMemories(memories, { query: "what font should the luxury automotive site use?", limit: 5, now: NOW });
    expect(picked[0]?.id).toBe("font");
    const newestOnly = [...memories].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5);
    expect(newestOnly.map((m) => m.id)).not.toContain("font");
  });

  it("falls back to recency when nothing matches, and respects limit and character budget", () => {
    const picked = recallMemories(memories, { query: "zzz qqq", limit: 3, now: NOW });
    expect(picked.map((m) => m.id)).toEqual(["n0", "n1", "n2"]);
    const budgeted = recallMemories(memories, { query: "invoices billing", limit: 10, charBudget: 120, now: NOW });
    expect(budgeted.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(120);
  });

  it("uses embeddings when they are supplied", () => {
    const set = [mem("a", "alpha", 1), mem("b", "beta", 1)];
    const picked = recallMemories(set, { query: "unrelated words here", limit: 1, now: NOW, embeddings: { query: [1, 0], byId: { a: [0, 1], b: [1, 0] } } });
    expect(picked[0]?.id).toBe("b");
  });

  it("tokenizes without stop words and computes cosine safely", () => {
    expect(tokenize("The font of the luxury site")).toEqual(["font", "luxury", "site"]);
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});

describe("Scratchpad", () => {
  it("is bounded in entries and characters and keeps the newest", () => {
    const pad = new Scratchpad(2, 5);
    pad.set("a", "1234567890");
    pad.set("b", "b");
    pad.set("c", "c");
    expect(pad.snapshot()).toEqual({ b: "b", c: "c" });
    pad.set("a", "1234567890");
    expect(pad.get("a")).toBe("12345");
  });
});
