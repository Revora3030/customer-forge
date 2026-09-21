/**
 * Builder undo/redo — the pure state machine.
 *
 * Every recorded change is stored as a pair of patches against one database
 * row: `after` (what the edit applied) and `before` (the exact values that were
 * replaced). Undo re-applies `before`; redo re-applies `after`. Because both
 * sides are ordinary column patches, undo/redo works for content edits, style
 * and layout settings, visibility toggles and AI-applied changes alike — the
 * builder does not need a separate history model per feature.
 *
 * The stack is browser-persisted per workspace: it survives a reload while
 * Version History remains the durable, cross-device restore mechanism.
 */

export type HistoryTable = "website_pages" | "website_sections" | "website_components";

export type HistoryEntry = {
  id: string;
  /** Plain-language description shown on the Undo button's tooltip. */
  label: string;
  at: number;
  table: HistoryTable;
  rowId: string;
  /** Values to write when undoing (the pre-edit values). */
  before: Record<string, unknown>;
  /** Values to write when redoing (the edit itself). */
  after: Record<string, unknown>;
};

export type HistoryState = {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

export const emptyHistory: HistoryState = { past: [], future: [] };

/** Keeps the session stack bounded so a long editing session cannot grow forever. */
export const HISTORY_LIMIT = 50;

export function isHistoryState(value: unknown): value is HistoryState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HistoryState>;
  if (!Array.isArray(candidate.past) || !Array.isArray(candidate.future)) return false;
  return [...candidate.past, ...candidate.future].every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as HistoryEntry).id === "string" &&
      typeof (item as HistoryEntry).label === "string" &&
      typeof (item as HistoryEntry).at === "number" &&
      ["website_pages", "website_sections", "website_components"].includes(
        (item as HistoryEntry).table,
      ) &&
      typeof (item as HistoryEntry).rowId === "string" &&
      Boolean((item as HistoryEntry).before && typeof (item as HistoryEntry).before === "object") &&
      Boolean((item as HistoryEntry).after && typeof (item as HistoryEntry).after === "object"),
  );
}

export function parseHistoryState(raw: string | null): HistoryState {
  if (!raw) return emptyHistory;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isHistoryState(parsed)) return emptyHistory;
    return {
      past: parsed.past.slice(-HISTORY_LIMIT),
      future: parsed.future.slice(0, HISTORY_LIMIT),
    };
  } catch {
    return emptyHistory;
  }
}

/**
 * Builds the inverse of a patch from the row as it exists right now.
 *
 * Only keys the patch actually changes are captured, and a patch that changes
 * nothing returns null so no-op saves never enter the history.
 */
export function inversePatch(
  row: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  if (!row) return null;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(patch)) {
    if (!(key in row)) continue;
    const current = row[key];
    if (sameValue(current, next)) continue;
    before[key] = current ?? null;
    after[key] = next;
  }
  return Object.keys(after).length ? { before, after } : null;
}

function sameValue(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "object" && typeof b === "object" && a && b) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/** Adds an entry to the stack. Any redo branch is dropped, as in every editor. */
export function record(
  state: HistoryState,
  entry: HistoryEntry,
  limit = HISTORY_LIMIT,
): HistoryState {
  const past = [...state.past, entry];
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

/** Pops the newest change. Returns null when there is nothing to undo. */
export function undo(
  state: HistoryState,
): { state: HistoryState; entry: HistoryEntry; patch: Record<string, unknown> } | null {
  const entry = state.past[state.past.length - 1];
  if (!entry) return null;
  return {
    state: { past: state.past.slice(0, -1), future: [entry, ...state.future] },
    entry,
    patch: entry.before,
  };
}

/** Re-applies the most recently undone change. */
export function redo(
  state: HistoryState,
): { state: HistoryState; entry: HistoryEntry; patch: Record<string, unknown> } | null {
  const entry = state.future[0];
  if (!entry) return null;
  return {
    state: { past: [...state.past, entry], future: state.future.slice(1) },
    entry,
    patch: entry.after,
  };
}

const TABLE_NOUN: Record<HistoryTable, string> = {
  website_pages: "page",
  website_sections: "section",
  website_components: "item",
};

const FIELD_LABELS: Record<string, string> = {
  heading: "heading",
  subheading: "subheading",
  body: "text",
  label: "label",
  title: "title",
  slug: "address",
  variant: "layout",
  settings: "design",
  is_visible: "visibility",
  sort_order: "order",
  link_url: "link",
  link_label: "link label",
  media_url: "image",
  seo_title: "search title",
  seo_description: "search description",
  noindex: "search visibility",
};

/**
 * Turns a patch into something a business owner recognises on an Undo button,
 * e.g. "Undo heading change on section".
 */
export function describeChange(table: HistoryTable, patch: Record<string, unknown>): string {
  const keys = Object.keys(patch);
  if (keys.length === 0) return `${TABLE_NOUN[table]} change`;
  const named = keys.map((key) => FIELD_LABELS[key] ?? key.replace(/_/g, " "));
  const head = named.slice(0, 2).join(" and ");
  const rest = named.length > 2 ? ` +${named.length - 2} more` : "";
  return `${head}${rest} on ${TABLE_NOUN[table]}`;
}
