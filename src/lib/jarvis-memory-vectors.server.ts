/**
 * Semantic recall for Jarvis memory: embeddings through the Lovable provider
 * adapter (the owner's Lovable AI key), stored in pgvector
 * (jarvis_memory_embeddings) and matched with match_jarvis_memories.
 *
 * Everything here fails open: no key, a gateway error, a missing table or a
 * timeout just means recall stays lexical. Memory never blocks a chat answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEMORY_EMBEDDING_MODEL_ID } from "@/lib/ai/catalogue";
import { embedWithProvider } from "@/lib/ai/router.server";

type Db = Pick<SupabaseClient, "from" | "rpc">;

export const MEMORY_EMBEDDING_MODEL = MEMORY_EMBEDDING_MODEL_ID;
export const MEMORY_EMBEDDING_DIMENSIONS = 1536;
const TIMEOUT_MS = 6_000;

export async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Gateway vectors for `texts`, in order; null when embeddings are unavailable. */
export async function embedTexts(texts: string[], options: { apiKey?: string | null; fetcher?: typeof fetch } = {}): Promise<number[][] | null> {
  if (options.apiKey === null || !texts.length) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const vectors = await embedWithProvider(MEMORY_EMBEDDING_MODEL, texts.map((text) => text.slice(0, 4000)), {
      signal: controller.signal,
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    });
    if (!vectors) return null;
    if (vectors.length !== texts.length) return null;
    const valid = vectors.every((vector) => Array.isArray(vector) && vector.length === MEMORY_EMBEDDING_DIMENSIONS && vector.every((n) => typeof n === "number" && Number.isFinite(n)));
    return valid ? (vectors as number[][]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** pgvector's text form. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

/** Embeds and stores one memory. Best-effort; returns whether a vector was saved. */
export async function indexMemory(db: Db, userId: string, memoryId: string, content: string, options: { apiKey?: string | null; fetcher?: typeof fetch } = {}): Promise<boolean> {
  try {
    const vectors = await embedTexts([content], options);
    if (!vectors) return false;
    const { error } = await db.from("jarvis_memory_embeddings").upsert(
      { memory_id: memoryId, user_id: userId, model: MEMORY_EMBEDDING_MODEL, content_hash: await contentHash(content), embedding: toVectorLiteral(vectors[0]!) },
      { onConflict: "memory_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

/** Embeds memories that have no vector yet (saved before pgvector, or while the gateway was down). */
export async function backfillMemoryVectors(db: Db, userId: string, memories: readonly { id: string; content: string }[], options: { apiKey?: string | null; fetcher?: typeof fetch; max?: number } = {}): Promise<number> {
  try {
    if (!memories.length) return 0;
    const have = await db.from("jarvis_memory_embeddings").select("memory_id").eq("user_id", userId);
    if (have.error) return 0;
    const done = new Set((have.data ?? []).map((row) => String((row as { memory_id: string }).memory_id)));
    const missing = memories.filter((memory) => !done.has(memory.id)).slice(0, options.max ?? 50);
    if (!missing.length) return 0;
    const vectors = await embedTexts(missing.map((memory) => memory.content), options);
    if (!vectors) return 0;
    const rows = await Promise.all(missing.map(async (memory, i) => ({ memory_id: memory.id, user_id: userId, model: MEMORY_EMBEDDING_MODEL, content_hash: await contentHash(memory.content), embedding: toVectorLiteral(vectors[i]!) })));
    const { error } = await db.from("jarvis_memory_embeddings").upsert(rows, { onConflict: "memory_id" });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}

/** Cosine similarity per memory id for the owner's message, or null (stay lexical). */
export async function semanticScores(db: Db, userId: string, query: string, options: { apiKey?: string | null; fetcher?: typeof fetch; limit?: number } = {}): Promise<Record<string, number> | null> {
  try {
    const vectors = await embedTexts([query], options);
    if (!vectors) return null;
    const { data, error } = await db.rpc("match_jarvis_memories", { p_user_id: userId, p_query: toVectorLiteral(vectors[0]!), p_limit: options.limit ?? 200 });
    if (error || !Array.isArray(data)) return null;
    const scores: Record<string, number> = {};
    for (const row of data as { memory_id?: unknown; similarity?: unknown }[]) {
      if (typeof row.memory_id === "string" && typeof row.similarity === "number" && Number.isFinite(row.similarity)) scores[row.memory_id] = row.similarity;
    }
    return scores;
  } catch {
    return null;
  }
}
