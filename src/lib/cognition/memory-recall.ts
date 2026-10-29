/**
 * Pillar 2 (Memory): choose which saved memories reach the prompt. Instead of
 * always sending the newest N, rank every memory by relevance to what the
 * owner just said (lexical overlap, plus cosine similarity when embeddings
 * exist) with a gentle recency boost, then fill a character budget.
 * Also a small bounded working-memory scratchpad for long tasks.
 */
export type RecallMemory = { id: string; kind: string; content: string; created_at: string };

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

export function recallMemories(memories: readonly RecallMemory[], options: RecallOptions): RecallMemory[] {
  const now = options.now ?? Date.now();
  const queryTerms = new Set(tokenize(options.query));
  const scored = memories.map((memory) => {
    const terms = new Set(tokenize(memory.content));
    let overlap = 0;
    for (const term of queryTerms) if (terms.has(term)) overlap += 1;
    const lexical = queryTerms.size ? overlap / Math.sqrt(queryTerms.size * Math.max(1, terms.size)) : 0;
    const precomputed = options.similarity?.[memory.id];
    const vector = typeof precomputed === "number" && Number.isFinite(precomputed)
      ? Math.max(0, precomputed)
      : options.embeddings?.byId[memory.id] ? Math.max(0, cosineSimilarity(options.embeddings.query, options.embeddings.byId[memory.id]!)) : 0;
    const ageDays = Math.max(0, (now - Date.parse(memory.created_at)) / 86_400_000);
    const recency = Number.isFinite(ageDays) ? 1 / (1 + ageDays / 30) : 0;
    return { memory, score: lexical * 2 + vector * 2 + recency * 0.5 };
  });
  scored.sort((x, y) => y.score - x.score || Date.parse(y.memory.created_at) - Date.parse(x.memory.created_at));
  const picked: RecallMemory[] = [];
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
