/**
 * Remembers approved paid-research answers on this device, keyed
 * `${message.id}:${index}` like jarvis-approvals. Without it, a reload would
 * show the Approve button's proposal with no answer, inviting the owner to
 * spend Perplexity credits twice on the same question. The server audit log
 * stays the source of truth; this is display state only.
 */

export const RESEARCH_KEY = "jarvis:research";
export const MAX_RESEARCH = 50;

export type ResearchResultRecord = {
  question: string;
  model: string | null;
  text: string;
  citations: string[];
  searchResults: { title: string | null; url: string }[];
  at: string;
};
export type ResearchResults = Record<string, ResearchResultRecord>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function cleanRecord(value: unknown): ResearchResultRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record["question"] !== "string" || typeof record["text"] !== "string") return null;
  const urls = (input: unknown) =>
    (Array.isArray(input) ? input : [])
      .filter((item): item is string => typeof item === "string" && /^https:\/\//.test(item))
      .slice(0, 20);
  const searchResults = (Array.isArray(record["searchResults"]) ? record["searchResults"] : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      return typeof entry["url"] === "string" && /^https:\/\//.test(entry["url"])
        ? { title: typeof entry["title"] === "string" ? entry["title"].slice(0, 200) : null, url: entry["url"] }
        : null;
    })
    .filter((item): item is { title: string | null; url: string } => item !== null)
    .slice(0, 20);
  return {
    question: record["question"].slice(0, 2000),
    model: typeof record["model"] === "string" ? record["model"].slice(0, 120) : null,
    text: record["text"].slice(0, 20000),
    citations: urls(record["citations"]),
    searchResults,
    at: typeof record["at"] === "string" ? record["at"] : "",
  };
}

function clean(value: unknown): ResearchResults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ResearchResults = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const record = cleanRecord(entry);
    if (record) out[key] = record;
  }
  return capped(out);
}

function capped(results: ResearchResults): ResearchResults {
  const entries = Object.entries(results);
  if (entries.length <= MAX_RESEARCH) return results;
  return Object.fromEntries(entries.slice(entries.length - MAX_RESEARCH));
}

export function readResearchResults(storage: StorageLike | null = defaultStorage()): ResearchResults {
  if (!storage) return {};
  try {
    const raw = storage.getItem(RESEARCH_KEY);
    return raw ? clean(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Records one approved answer and returns the updated map. Never throws. */
export function rememberResearchResult(key: string, record: ResearchResultRecord, storage: StorageLike | null = defaultStorage()): ResearchResults {
  const current = readResearchResults(storage);
  delete current[key];
  const next = capped({ ...current, [key]: record });
  if (storage) {
    try {
      storage.setItem(RESEARCH_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable or full */
    }
  }
  return next;
}
