/**
 * JC-43 conversation workspace: pins, project folders and markdown export for
 * Jarvis conversations. Pins and folders live on this device (localStorage);
 * no new table. The server list (jarvis-conversations.functions.ts) stays the
 * source of truth for which conversations exist.
 */

export const WORKSPACE_KEY = "jarvis:conversation-workspace:v1";
export const MAX_PINS = 50;
export const MAX_FOLDER_NAME = 40;
export const MAX_FOLDERED = 500;

export type ConversationWorkspace = { pins: string[]; folders: Record<string, string> };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const empty = (): ConversationWorkspace => ({ pins: [], folders: {} });

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Folder name rules: one line, trimmed, 1..40 characters. Empty means "no folder". */
export function parseFolderName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (name.length > MAX_FOLDER_NAME) throw new Error(`Keep folder names under ${MAX_FOLDER_NAME + 1} characters.`);
  return name;
}

/** Drops anything malformed so a hand-edited or old value can't break the sheet. */
export function cleanWorkspace(value: unknown): ConversationWorkspace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty();
  const raw = value as { pins?: unknown; folders?: unknown };
  const pins = Array.isArray(raw.pins)
    ? [...new Set(raw.pins.filter((id): id is string => typeof id === "string" && UUID.test(id)).map((id) => id.toLowerCase()))].slice(0, MAX_PINS)
    : [];
  const folders: Record<string, string> = {};
  if (raw.folders && typeof raw.folders === "object" && !Array.isArray(raw.folders)) {
    for (const [id, name] of Object.entries(raw.folders as Record<string, unknown>).slice(0, MAX_FOLDERED)) {
      if (!UUID.test(id)) continue;
      try {
        const clean = parseFolderName(name);
        if (clean) folders[id.toLowerCase()] = clean;
      } catch { /* too long: drop */ }
    }
  }
  return { pins, folders };
}

export function readWorkspace(storage: StorageLike | null = defaultStorage()): ConversationWorkspace {
  if (!storage) return empty();
  try {
    return cleanWorkspace(JSON.parse(storage.getItem(WORKSPACE_KEY) ?? "null"));
  } catch {
    return empty();
  }
}

/** Returns false when the device won't store it (private mode, quota). */
export function writeWorkspace(ws: ConversationWorkspace, storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORKSPACE_KEY, JSON.stringify(cleanWorkspace(ws)));
    return true;
  } catch {
    return false;
  }
}

export function isPinned(ws: ConversationWorkspace, id: string): boolean {
  return ws.pins.includes(id.toLowerCase());
}

export function togglePin(ws: ConversationWorkspace, id: string): ConversationWorkspace {
  const key = id.toLowerCase();
  if (ws.pins.includes(key)) return { ...ws, pins: ws.pins.filter((p) => p !== key) };
  if (ws.pins.length >= MAX_PINS) throw new Error(`You can pin up to ${MAX_PINS} conversations.`);
  return { ...ws, pins: [key, ...ws.pins] };
}

/** Moves a conversation into a folder; an empty name takes it out of any folder. */
export function setFolder(ws: ConversationWorkspace, id: string, name: unknown): ConversationWorkspace {
  const key = id.toLowerCase();
  const clean = parseFolderName(name);
  const folders = { ...ws.folders };
  if (clean) folders[key] = clean;
  else delete folders[key];
  return { ...ws, folders };
}

/** Folder names in use, A to Z (case-insensitive). */
export function folderNames(ws: ConversationWorkspace): string[] {
  return [...new Set(Object.values(ws.folders))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** "all" shows everything; "none" shows conversations outside any folder; otherwise one folder. */
export type FolderFilter = { kind: "all" } | { kind: "none" } | { kind: "folder"; name: string };

/**
 * Pinned first (most recently pinned first), then the server order (newest
 * activity first). Filtering by folder never hides a conversation from "all".
 */
export function arrangeConversations<T extends { id: string }>(list: readonly T[], ws: ConversationWorkspace, filter: FolderFilter = { kind: "all" }): T[] {
  const inFilter = (c: T) => {
    const folder = ws.folders[c.id.toLowerCase()];
    if (filter.kind === "all") return true;
    if (filter.kind === "none") return !folder;
    return folder === filter.name;
  };
  const shown = list.filter(inFilter);
  const pinRank = (c: T) => {
    const i = ws.pins.indexOf(c.id.toLowerCase());
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return shown
    .map((c, index) => ({ c, index, rank: pinRank(c) }))
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map(({ c }) => c);
}

export type ExportRow = { role: string; content: string; created_at: string };

/**
 * One conversation as markdown. `truncated` adds an honest note when only the
 * newest part of a very long conversation could be loaded.
 */
export function conversationMarkdown(title: string, rows: readonly ExportRow[], opts: { exportedAt?: Date; truncated?: boolean } = {}): string {
  const at = (opts.exportedAt ?? new Date()).toISOString();
  const head = [`# ${title.replace(/\s+/g, " ").trim() || "Jarvis conversation"}`, "", `Exported ${at} · ${rows.length} message${rows.length === 1 ? "" : "s"}`];
  if (opts.truncated) head.push("", "> Only the most recent messages were exported; older ones were not loaded.");
  if (!rows.length) head.push("", "_No messages in this conversation yet._");
  const body = rows.map((r) => `### ${r.role === "user" ? "You" : r.role === "assistant" ? "Jarvis" : r.role} · ${r.created_at}\n\n${r.content}`);
  return [head.join("\n"), ...body].join("\n\n---\n\n") + "\n";
}

/** Safe download name: jarvis-<slug>-<yyyy-mm-dd>.md */
export function exportFilename(title: string, now: Date = new Date()): string {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return `jarvis-${slug || "conversation"}-${now.toISOString().slice(0, 10)}.md`;
}

/**
 * Loads a whole conversation newest-page-first, oldest-first result. Stops at
 * `maxPages` and says so instead of pretending the export is complete.
 */
export async function loadAllPages<T extends { created_at: string }>(
  loadPage: (before: string | undefined) => Promise<T[]>,
  pageSize: number,
  maxPages = 10,
): Promise<{ rows: T[]; truncated: boolean }> {
  let rows: T[] = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const chunk = await loadPage(before);
    rows = [...chunk, ...rows];
    if (chunk.length < pageSize || !chunk[0]) return { rows, truncated: false };
    before = chunk[0].created_at;
  }
  return { rows, truncated: true };
}
