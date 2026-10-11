import type { SavedTurn } from "@/lib/builder-memory";
import { isMessageKind, kindForTurn, normaliseBranch, normaliseRequestId } from "@/lib/builder/chat-thread";
import { normaliseSavedTaskResult } from "@/lib/builder-chat-result";

const CACHE_PREFIX = "rv-builder-turns:";
const CACHE_LIMIT = 80;

/** Storage getters themselves can throw; capture each one independently. */
function stores(): Storage[] {
  if (typeof window === "undefined") return [];
  const available: Storage[] = [];
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = window[name];
      if (store && !available.includes(store)) available.push(store);
    } catch { /* this storage backend is unavailable */ }
  }
  return available;
}
const cacheKey = (organizationId: string) => `${CACHE_PREFIX}${organizationId}`;

function decode(raw: string): SavedTurn[] | null {
  if (raw.length > 4_000_000) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const turns: SavedTurn[] = [];
  for (const value of parsed.slice(-CACHE_LIMIT)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const role = row["role"], content = row["content"], at = row["at"];
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim() || typeof at !== "string" || !at.trim()) continue;
    const result = normaliseSavedTaskResult(row["taskResult"], content);
    const requestId = normaliseRequestId(row["requestId"]);
    turns.push({ role, content: content.slice(0, 20000), at: at.slice(0, 80),
      ...(result ? { taskResult: result } : {}),
      ...(requestId ? { requestId } : row["requestId"] === null ? { requestId: null } : {}),
      ...(typeof row["branch"] === "string" ? { branch: normaliseBranch(row["branch"]) } : {}),
      ...(isMessageKind(row["kind"]) ? { kind: kindForTurn({ role, kind: row["kind"], taskResult: result }) } : {}),
    });
  }
  return turns;
}

/** Workspace-scoped, display-only data. Never used to authorize backend requests. */
export function readCachedTurns(organizationId: string): SavedTurn[] {
  for (const store of stores()) {
    try {
      const raw = store.getItem(cacheKey(organizationId));
      if (!raw) continue;
      const turns = decode(raw);
      if (turns) return turns;
    } catch { /* try the next backend */ }
  }
  return [];
}
export function writeCachedTurns(organizationId: string, turns: SavedTurn[]): void {
  let payload: string;
  try { payload = JSON.stringify(turns.slice(-CACHE_LIMIT)); }
  catch { return; }
  for (const store of stores()) {
    try { store.setItem(cacheKey(organizationId), payload); return; }
    catch { /* full or blocked storage: try the next backend */ }
  }
}
export function clearCachedTurns(organizationId: string): void {
  for (const store of stores()) {
    try { store.removeItem(cacheKey(organizationId)); } catch { /* best effort */ }
  }
}
export function clearAllCachedTurns(): void {
  for (const store of stores()) {
    const keys: string[] = [];
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
      }
    } catch { continue; }
    for (const key of keys) {
      try { store.removeItem(key); } catch { /* keep trying other cache keys */ }
    }
  }
}
