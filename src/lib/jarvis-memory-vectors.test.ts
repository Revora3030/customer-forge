import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { recallMemories } from "@/lib/cognition/memory-recall";
import { routeStatus } from "@/lib/ai/catalogue";
import {
  MEMORY_EMBEDDING_DIMENSIONS,
  MEMORY_EMBEDDING_MODEL,
  backfillMemoryVectors,
  embedTexts,
  indexMemory,
  semanticScores,
  toVectorLiteral,
} from "@/lib/jarvis-memory-vectors.server";

const vec = (seed: number) => Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, (_, i) => ((i * 7 + seed) % 13) / 13);
const okFetch = (count = 1) =>
  vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { model: string; input: string[] };
    expect(body.model).toBe(MEMORY_EMBEDDING_MODEL);
    return new Response(JSON.stringify({ data: body.input.slice(0, count === -1 ? 0 : body.input.length).map((_, index) => ({ index, embedding: vec(index) })) }), { status: 200 });
  }) as unknown as typeof fetch;

function fakeDb(opts: { rpc?: unknown; rpcError?: boolean; have?: string[] } = {}) {
  const upserts: unknown[] = [];
  const rpcCalls: unknown[] = [];
  const db = {
    from: () => ({
      upsert: async (rows: unknown) => { upserts.push(rows); return { error: null }; },
      select: () => ({ eq: async () => ({ data: (opts.have ?? []).map((memory_id) => ({ memory_id })), error: null }) }),
    }),
    rpc: async (name: string, args: unknown) => { rpcCalls.push({ name, args }); return opts.rpcError ? { data: null, error: { code: "42883" } } : { data: opts.rpc ?? [], error: null }; },
  };
  return { db: db as never, upserts, rpcCalls };
}

describe("memory embeddings fail open", () => {
  it("returns null without a key, on HTTP errors, wrong sizes or thrown fetches", async () => {
    expect(await embedTexts(["hello"], { apiKey: null })).toBeNull();
    expect(await embedTexts(["hello"], { apiKey: "lovable-test-key", fetcher: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch })).toBeNull();
    expect(await embedTexts(["hello"], { apiKey: "lovable-test-key", fetcher: (async () => new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }))) as unknown as typeof fetch })).toBeNull();
    expect(await embedTexts(["hello"], { apiKey: "lovable-test-key", fetcher: (async () => { throw new Error("down"); }) as unknown as typeof fetch })).toBeNull();
    expect(await embedTexts(["a", "b"], { apiKey: "lovable-test-key", fetcher: okFetch(-1) })).toBeNull();
  });

  it("returns ordered vectors from the gateway", async () => {
    const vectors = await embedTexts(["a", "b"], { apiKey: "lovable-test-key", fetcher: okFetch() });
    expect(vectors).toHaveLength(2);
    expect(vectors![1]).toEqual(vec(1));
  });

  it("indexes a memory as a pgvector literal, owner-scoped", async () => {
    const { db, upserts } = fakeDb();
    expect(await indexMemory(db, "owner-1", "mem-1", "Prefers dark blue", { apiKey: "lovable-test-key", fetcher: okFetch() })).toBe(true);
    const row = upserts[0] as Record<string, string>;
    expect(row).toMatchObject({ memory_id: "mem-1", user_id: "owner-1", model: MEMORY_EMBEDDING_MODEL });
    expect(row["embedding"]).toBe(toVectorLiteral(vec(0)));
    expect(row["content_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(await indexMemory(db, "owner-1", "mem-2", "x", { apiKey: null })).toBe(false);
  });

  it("backfills only memories without vectors", async () => {
    const { db, upserts } = fakeDb({ have: ["m1"] });
    const n = await backfillMemoryVectors(db, "owner-1", [{ id: "m1", content: "a" }, { id: "m2", content: "b" }], { apiKey: "lovable-test-key", fetcher: okFetch() });
    expect(n).toBe(1);
    expect((upserts[0] as { memory_id: string }[]).map((row) => row.memory_id)).toEqual(["m2"]);
  });

  it("scores through match_jarvis_memories for this owner only, null on RPC error", async () => {
    const { db, rpcCalls } = fakeDb({ rpc: [{ memory_id: "m2", similarity: 0.91 }, { memory_id: 5, similarity: 1 }] });
    expect(await semanticScores(db, "owner-1", "what colour?", { apiKey: "lovable-test-key", fetcher: okFetch() })).toEqual({ m2: 0.91 });
    expect(rpcCalls[0]).toMatchObject({ name: "match_jarvis_memories", args: { p_user_id: "owner-1" } });
    expect(await semanticScores(fakeDb({ rpcError: true }).db, "owner-1", "q", { apiKey: "lovable-test-key", fetcher: okFetch() })).toBeNull();
  });
});

describe("recall blends semantic similarity", () => {
  it("ranks a semantically close memory above an unrelated newer one", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    const memories = [
      { id: "new", kind: "note", content: "Invoice reminders go out on Fridays", created_at: "2026-10-29T11:00:00Z" },
      { id: "old", kind: "preference", content: "Brand palette is navy and gold", created_at: "2026-06-01T00:00:00Z" },
    ];
    const lexical = recallMemories(memories, { query: "what colours do I like", limit: 1, now });
    expect(lexical[0]!.id).toBe("new");
    const semantic = recallMemories(memories, { query: "what colours do I like", limit: 1, now, similarity: { old: 0.82, new: 0.05 } });
    expect(semantic[0]!.id).toBe("old");
  });
});

describe("pgvector migration stays server-only", () => {
  const sql = readFileSync("supabase/migrations/20261029151000_jarvis_memory_vectors.sql", "utf8");
  it("enables the extension, RLS, and grants nothing to browser roles", () => {
    expect(sql).toMatch(/create extension if not exists vector/i);
    expect(sql).toMatch(/vector\(1536\)/);
    expect(sql).toMatch(/alter table public\.jarvis_memory_embeddings enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.jarvis_memory_embeddings from public, anon, authenticated/i);
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/i);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("the match function is scoped to one owner and callable only by the server", () => {
    expect(sql).toMatch(/where e\.user_id = p_user_id/i);
    expect(sql).toMatch(/revoke all on function public\.match_jarvis_memories[^;]*from public, anon, authenticated/i);
    expect(sql).toMatch(/security invoker/i);
  });
});

describe("catalogue reports the memory embedding model honestly", () => {
  it("names the model Jarvis memory uses", () => {
    const status = routeStatus([{ id: MEMORY_EMBEDDING_MODEL, deprecated: false, surfaces: ["embeddings"], inputs: ["text"], outputs: ["text"], retentionBySurface: { embeddings: "zero" } }], {});
    expect(status[0]!.reason).toMatch(/Jarvis memory recall/);
  });
});
