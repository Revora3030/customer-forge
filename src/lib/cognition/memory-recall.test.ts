import { describe, expect, it } from "vitest";
import { MEMORY_HALF_LIFE_DAYS, Scratchpad, cosineSimilarity, dueObligations, halfLifeDays, normalizedRelevance, recallMemories, recencyWeight, tokenize } from "./memory-recall";

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

describe("half-life decay, normalised relevance and obligations", () => {
  it("halves the recency weight once per half-life, by kind or the memory's own", () => {
    expect(halfLifeDays({ kind: "preference" })).toBe(MEMORY_HALF_LIFE_DAYS.preference);
    expect(halfLifeDays({ kind: "note" })).toBe(30);
    expect(halfLifeDays({ kind: "unknown_kind" })).toBe(30);
    expect(halfLifeDays({ kind: "note", half_life_days: 7 })).toBe(7);
    expect(halfLifeDays({ kind: "note", half_life_days: -1 })).toBe(30);
    expect(recencyWeight({ kind: "note", created_at: day(0) }, NOW)).toBe(1);
    expect(recencyWeight({ kind: "note", created_at: day(30) }, NOW)).toBeCloseTo(0.5, 6);
    expect(recencyWeight({ kind: "note", created_at: day(60) }, NOW)).toBeCloseTo(0.25, 6);
    expect(recencyWeight({ kind: "note", half_life_days: 10, created_at: day(10) }, NOW)).toBeCloseTo(0.5, 6);
  });

  it("keeps relevance between 0 and 1 whatever the inputs", () => {
    expect(normalizedRelevance(0, 0, 0)).toBe(0);
    expect(normalizedRelevance(1, 1, 1)).toBe(1);
    expect(normalizedRelevance(5, -3, Number.NaN)).toBeCloseTo(2 / 4.5, 6);
  });

  it("a slow-fading preference outranks an equally old note with no other signal", () => {
    const set = [{ ...mem("note", "zzz", 90), kind: "note" }, mem("pref", "qqq", 90)];
    expect(recallMemories(set, { query: "nothing matches", limit: 1, now: NOW })[0]?.id).toBe("pref");
  });

  it("never returns a superseded memory or an obligation from relevance recall", () => {
    const set = [
      { ...mem("old", "luxury serif font", 1), superseded_by: "new" },
      mem("new", "luxury serif font, tighter tracking", 0),
      { ...mem("call", "call the luxury font vendor back", 0), due_at: day(-1) },
    ];
    expect(recallMemories(set, { query: "luxury font", limit: 5, now: NOW }).map((m) => m.id)).toEqual(["new"]);
  });

  it("lists due, unmet obligations soonest first", () => {
    const set = [
      { ...mem("later", "send the quote", 0), due_at: day(-3) },
      { ...mem("due", "call Sam back", 0), due_at: day(1) },
      { ...mem("first", "renew the domain", 0), due_at: day(2) },
      { ...mem("done", "file the permit", 0), due_at: day(2), completed_at: day(1) },
      { ...mem("gone", "old reminder", 0), due_at: day(2), superseded_by: "due" },
      mem("plain", "not an obligation", 0),
    ];
    expect(dueObligations(set, NOW).map((m) => m.id)).toEqual(["first", "due"]);
    expect(dueObligations(set, NOW, 4 * 86_400_000).map((m) => m.id)).toEqual(["first", "due", "later"]);
  });
});
