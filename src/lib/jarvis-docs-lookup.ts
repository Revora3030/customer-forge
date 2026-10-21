/**
 * Library documentation lookup through Context7 (CONTEXT7_API_KEY, free tier).
 * Two steps: resolve a library ID by name, then fetch focused doc snippets.
 * Each answer carries its source library ID so Jarvis can cite it. A 404 is an
 * empty answer, 202/503 mean "still indexing, retry later", and 429 means the
 * free quota is spent; none of them is reported as documentation found.
 */
const BASE = "https://context7.com/api/v2";

export function cleanDocsQuery(raw: unknown): { library: string; topic: string } | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex -- control characters are stripped from model input
  const q = raw.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200);
  if (q.length < 2) return null;
  const [library, ...rest] = q.split(/\s*[:|]\s*/);
  return { library: (library ?? q).slice(0, 80), topic: rest.join(" ").slice(0, 120) };
}

export function buildSearchUrl(library: string): string {
  const u = new URL(`${BASE}/libs/search`);
  u.searchParams.set("libraryName", library);
  u.searchParams.set("query", library);
  return u.toString();
}

export function buildDocsUrl(libraryId: string, topic: string): string {
  const u = new URL(`${BASE}/context`);
  u.searchParams.set("libraryId", libraryId);
  u.searchParams.set("type", "txt");
  u.searchParams.set("query", topic || "Overview and getting started");
  return u.toString();
}

export function pickLibraryId(raw: unknown): { id: string; title: string } | null {
  const results = (raw as { results?: unknown })?.results;
  if (!Array.isArray(results)) return null;
  const first = results.find((r) => r && typeof (r as { id?: unknown }).id === "string") as { id: string; title?: string } | undefined;
  return first ? { id: first.id.slice(0, 160), title: String(first.title ?? first.id).slice(0, 120) } : null;
}

export type Context7Classification =
  | { kind: "ok" }
  /** Context7 answered that it has nothing for this request: an empty result, not an error. */
  | { kind: "empty"; reason: "library_not_found" | "no_documentation_found" }
  /** Temporary: the library is still being indexed or the service is busy. */
  | { kind: "retry"; reason: "retryable_indexing" }
  | { kind: "error"; reason: string };

/** Maps a Context7 HTTP status for the search ("search") or docs ("docs") step. */
export function classifyContext7Response(status: number, step: "search" | "docs" = "search"): Context7Classification {
  if (status === 202 || status === 503) return { kind: "retry", reason: "retryable_indexing" };
  if (status >= 200 && status < 300) return { kind: "ok" };
  if (status === 404) return { kind: "empty", reason: step === "search" ? "library_not_found" : "no_documentation_found" };
  if (status === 429) return { kind: "error", reason: "free_quota_exhausted" };
  return { kind: "error", reason: `context7_http_${status}` };
}

export type DocsLookupOutcome = { status: "observed" | "unknown"; data: Record<string, unknown> };

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;
/** Per-isolate cache so repeated questions do not spend the free monthly quota. */
const cache = new Map<string, { at: number; value: DocsLookupOutcome }>();

const cacheKey = (q: { library: string; topic: string }) => `${q.library.toLowerCase()}|${q.topic.toLowerCase()}`;

export function resetDocsLookupCache(): void {
  cache.clear();
}

function cached(key: string, now: number): DocsLookupOutcome | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { status: hit.value.status, data: { ...hit.value.data, cached: true } };
}

function remember(key: string, value: DocsLookupOutcome, now: number): DocsLookupOutcome {
  cache.delete(key);
  while (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(key, { at: now, value });
  return value;
}

async function readText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let remaining = maxBytes;
  let output = "";
  try {
    while (remaining > 0) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value.subarray(0, remaining);
      output += decoder.decode(chunk, { stream: true });
      remaining -= chunk.byteLength;
    }
    return output + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

const unknownFrom = (c: Exclude<Context7Classification, { kind: "ok" | "empty" }>, extra: Record<string, unknown> = {}): DocsLookupOutcome => ({
  status: "unknown",
  data: { reason: c.reason, ...(c.kind === "retry" ? { retryable: true } : {}), ...extra },
});

/**
 * Two v2 calls (resolve the library, then fetch its docs). Successful answers,
 * including "Context7 has nothing for this", are cached per isolate for six
 * hours; failures and retryable states are never cached.
 */
export async function lookupContext7Docs(
  q: { library: string; topic: string },
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DocsLookupOutcome> {
  const id = cacheKey(q);
  const hit = cached(id, Date.now());
  if (hit) return hit;
  const headers = { Authorization: `Bearer ${key}` };
  const search = await fetchImpl(buildSearchUrl(q.library), { headers, signal: AbortSignal.timeout(7000) });
  const searchClass = classifyContext7Response(search.status, "search");
  if (searchClass.kind !== "ok") {
    await search.body?.cancel().catch(() => undefined);
    if (searchClass.kind === "empty") return remember(id, { status: "observed", data: { found: false, reason: searchClass.reason, library: q.library } }, Date.now());
    return unknownFrom(searchClass);
  }
  const lib = pickLibraryId(await search.json());
  if (!lib) return remember(id, { status: "observed", data: { found: false, reason: "library_not_found", library: q.library } }, Date.now());
  const docs = await fetchImpl(buildDocsUrl(lib.id, q.topic), { headers, signal: AbortSignal.timeout(7000) });
  const docsClass = classifyContext7Response(docs.status, "docs");
  if (docsClass.kind !== "ok") {
    await docs.body?.cancel().catch(() => undefined);
    if (docsClass.kind === "empty") return remember(id, { status: "observed", data: { found: false, reason: docsClass.reason, source: lib.id, library: lib.title } }, Date.now());
    return unknownFrom(docsClass, { source: lib.id });
  }
  const text = (await readText(docs, 12000)).slice(0, 7500);
  if (!text.trim()) return { status: "unknown", data: { reason: "empty_documentation", source: lib.id } };
  return remember(id, { status: "observed", data: { found: true, source: lib.id, library: lib.title, topic: q.topic || null, excerpt: text } }, Date.now());
}
