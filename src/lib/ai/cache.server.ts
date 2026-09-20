/**
 * A small in-process cache for repeated, read-only AI analysis.
 *
 * Free allowances are tiny, so asking the same question twice about an
 * unchanged site is waste. Only analysis-style calls (no side effects, same
 * input → same answer) are cached, keyed by a hash of the request. Prompts are
 * not stored: the key is a digest, and only the model's answer is held, briefly,
 * in memory. Never cache anything that writes to a customer's site.
 *
 * TENANT ISOLATION: every key carries the workspace it belongs to and the
 * version of that workspace's site context, so one business can never be served
 * another's answer, and an edit to the site retires the answers about it. The
 * scope carries the role and capability version, so a changed role or prompt
 * contract cannot reuse an old answer either.
 *
 * Server-only.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry<T> = { at: number; value: T };
const store = new Map<string, Entry<unknown>>();

/** Who the answer belongs to, and which version of their site it describes. */
export type AnalysisCacheScope = {
  /** The workspace (tenant). Required: there is no shared, tenant-less cache. */
  organizationId: string;
  /** Free-form scope: role, capability version, model, prompt contract. */
  scope: string;
  /** Bumped whenever the site changes, so stale answers fall out. */
  contextVersion?: string | number | null;
};

async function digest(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function analysisCacheKey(scope: AnalysisCacheScope, payload: unknown) {
  const organizationId = String(scope.organizationId ?? "").trim();
  if (!organizationId) throw new Error("analysisCacheKey requires an organizationId");
  const version = scope.contextVersion == null ? "0" : String(scope.contextVersion);
  return `${organizationId}:${scope.scope}:${version}:${await digest(JSON.stringify(payload))}`;
}

/** Forget every cached answer for one workspace (after a site change). */
export function invalidateAnalysisCache(organizationId: string) {
  const prefix = `${String(organizationId ?? "").trim()}:`;
  if (prefix === ":") return;
  for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key);
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
  pending.clear();
}

/**
 * Identical requests that arrive while one is still running share that one call,
 * so a double-click or two tabs cannot spend the free allowance twice.
 */
const pending = new Map<string, Promise<unknown>>();

/** Run `work` once per identical request within the cache window. */
export async function withAnalysisCache<T>(
  scope: AnalysisCacheScope,
  payload: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const key = await analysisCacheKey(scope, payload);
  const hit = readAnalysisCache<T>(key);
  if (hit !== null) return hit;

  const inFlight = pending.get(key);
  if (inFlight) return (await inFlight) as T;

  const run = (async () => {
    const value = await work();
    writeAnalysisCache(key, value);
    return value;
  })();
  pending.set(key, run);
  try {
    return await run;
  } finally {
    pending.delete(key);
  }
}

