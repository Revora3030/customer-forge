/**
 * A small in-process cache for repeated, read-only AI analysis.
 *
 * Free allowances are tiny, so asking the same question twice about an
 * unchanged site is waste. Only analysis-style calls (no side effects, same
 * input → same answer) are cached, keyed by a hash of the request. Prompts are
 * not stored: the key is a digest, and only the model's answer is held, briefly,
 * in memory. Never cache anything that writes to a customer's site.
 *
 * Server-only.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry<T> = { at: number; value: T };
const store = new Map<string, Entry<unknown>>();

async function digest(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function analysisCacheKey(scope: string, payload: unknown) {
  return `${scope}:${await digest(JSON.stringify(payload))}`;
}

function prune() {
  const now = Date.now();
  for (const [key, entry] of store) if (now - entry.at > TTL_MS) store.delete(key);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function readAnalysisCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function writeAnalysisCache<T>(key: string, value: T) {
  store.set(key, { at: Date.now(), value });
  prune();
}

export function resetAnalysisCache() {
  store.clear();
}

/** Run `work` once per identical request within the cache window. */
export async function withAnalysisCache<T>(
  scope: string,
  payload: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const key = await analysisCacheKey(scope, payload);
  const hit = readAnalysisCache<T>(key);
  if (hit !== null) return hit;
  const value = await work();
  writeAnalysisCache(key, value);
  return value;
}
