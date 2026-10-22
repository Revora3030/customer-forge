/**
 * Library documentation lookup through Context7 (CONTEXT7_API_KEY, free tier).
 * Two steps: resolve a library ID by name, then fetch focused doc snippets.
 * Each answer carries its source library ID so Jarvis can cite it.
 */
const BASE = "https://context7.com/api/v2";

export function cleanDocsQuery(raw: unknown): { library: string; topic: string } | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex -- strips control characters from untrusted input
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
