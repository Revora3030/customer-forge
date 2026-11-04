/**
 * Pillar 2 (Memory): choose which saved memories reach the prompt. Instead of
 * always sending the newest N, rank every memory by relevance to what the
 * owner just said (lexical overlap, plus cosine similarity when embeddings
 * exist) with a half-life recency weight (per kind, or the memory's own),
 * blended into one 0-1 relevance, then fill a character budget. Superseded
 * memories are skipped and obligations are surfaced separately when due.
 * Also a small bounded working-memory scratchpad for long tasks.
 */
export type RecallMemory = {
  id: string;
  kind: string;
  content: string;
  created_at: string;
  /** An obligation: something Jarvis must raise by this time. Obligations are not ranked by relevance; see dueObligations. */
  due_at?: string | null;
  /** When the obligation was met. */
  completed_at?: string | null;
  /** A newer memory replaced this one; it no longer reaches the prompt. */
  superseded_by?: string | null;
  /** Days for this memory's recency weight to halve. Defaults by kind. */
  half_life_days?: number | null;
};

/** Default recency half-lives in days: settled preferences fade slowly, passing notes quickly. */
export const MEMORY_HALF_LIFE_DAYS: Readonly<Record<string, number>> = { preference: 180, fact: 120, decision: 90, goal: 60, note: 30 };
const DEFAULT_HALF_LIFE = 30;
const MAX_HALF_LIFE = 3650;

export function halfLifeDays(memory: Pick<RecallMemory, "kind" | "half_life_days">): number {
  const own = memory.half_life_days;
  if (typeof own === "number" && Number.isFinite(own) && own > 0) return Math.min(own, MAX_HALF_LIFE);
  return MEMORY_HALF_LIFE_DAYS[memory.kind] ?? DEFAULT_HALF_LIFE;
}

/** Half-life decay: 1 when new, 0.5 after one half-life, never negative. */
export function recencyWeight(memory: Pick<RecallMemory, "kind" | "half_life_days" | "created_at">, now: number): number {
  const ageDays = Math.max(0, (now - Date.parse(memory.created_at)) / 86_400_000);
  return Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / halfLifeDays(memory)) : 0;
}

/** Weights for the blended relevance; the score is divided by their sum so it always lies in 0-1. */
export const RELEVANCE_WEIGHTS = { lexical: 2, vector: 2, recency: 0.5 } as const;

/** Normalised 0-1 relevance from lexical overlap (0-1), vector similarity (clamped to 0-1) and recency (0-1). */
export function normalizedRelevance(lexical: number, vector: number, recency: number): number {
  const unit = (v: number) => (Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : 0);
  const w = RELEVANCE_WEIGHTS;
  return (w.lexical * unit(lexical) + w.vector * unit(vector) + w.recency * unit(recency)) / (w.lexical + w.vector + w.recency);
}

const isObligation = (memory: RecallMemory) => typeof memory.due_at === "string" && memory.due_at.length > 0;

/**
 * Obligations due by `now` (plus an optional look-ahead) and not yet met,
 * soonest first. These are injected on their own, never by relevance.
 */
export function dueObligations<T extends RecallMemory>(memories: readonly T[], now: number, lookAheadMs = 0): T[] {
  return memories
    .filter((memory) => isObligation(memory) && !memory.completed_at && !memory.superseded_by && Date.parse(memory.due_at!) <= now + lookAheadMs)
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));
}

const STOP = new Set("a an and are as at be but by for from has have i if in is it its me my of on or our so that the their them then there they this to was we what when which with you your".split(" "));

export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP.has(word));
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type RecallOptions = {
  query: string;
  /** Memories to return at most. */
  limit: number;
  /** Total characters across the returned memories. */
  charBudget?: number;
  now?: number;
  /** Optional embeddings: query vector plus one per memory id. Without them ranking is lexical. */
  embeddings?: { query: readonly number[]; byId: Readonly<Record<string, readonly number[]>> };
  /** Optional precomputed cosine similarity per memory id (pgvector match). Takes precedence over `embeddings`. */
  similarity?: Readonly<Record<string, number>>;
};

export function recallMemories<T extends RecallMemory>(memories: readonly T[], options: RecallOptions): T[] {
  const now = options.now ?? Date.now();
  const queryTerms = new Set(tokenize(options.query));
  // Replaced memories never return; obligations go through dueObligations instead.
  const live = memories.filter((memory) => !memory.superseded_by && !isObligation(memory));
  const scored = live.map((memory) => {
    const terms = new Set(tokenize(memory.content));
    let overlap = 0;
    for (const term of queryTerms) if (terms.has(term)) overlap += 1;
    const lexical = queryTerms.size ? overlap / Math.sqrt(queryTerms.size * Math.max(1, terms.size)) : 0;
    const precomputed = options.similarity?.[memory.id];
    const vector = typeof precomputed === "number" && Number.isFinite(precomputed)
      ? Math.max(0, precomputed)
      : options.embeddings?.byId[memory.id] ? Math.max(0, cosineSimilarity(options.embeddings.query, options.embeddings.byId[memory.id]!)) : 0;
    return { memory, score: normalizedRelevance(lexical, vector, recencyWeight(memory, now)) };
  });
  scored.sort((x, y) => y.score - x.score || Date.parse(y.memory.created_at) - Date.parse(x.memory.created_at));
  const picked: T[] = [];
  let used = 0;
  for (const { memory } of scored) {
    if (picked.length >= options.limit) break;
    if (options.charBudget !== undefined && used + memory.content.length > options.charBudget) continue;
    picked.push(memory);
    used += memory.content.length;
  }
  return picked;
}

/** Working memory: bounded key/value notes a long task keeps outside the prompt. */
export class Scratchpad {
  private readonly entries = new Map<string, string>();
  constructor(private readonly maxEntries = 30, private readonly maxChars = 800) {}
  set(key: string, value: string): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.delete(key);
    this.entries.set(key, value.slice(0, this.maxChars));
  }
  get(key: string): string | undefined {
    return this.entries.get(key);
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.entries);
  }
}
