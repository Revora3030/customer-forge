/**
 * Staged visual edits.
 *
 * Clicking an element in the visual editor and changing it should not write to
 * the database on every keystroke. Edits collect here first, the owner sees them
 * in the preview, and only Apply writes them. Cancel throws the buffer away, so
 * the saved website is never touched by an experiment.
 *
 * Structural actions (add, delete, duplicate, reorder) are deliberately NOT
 * staged — they already have their own immediate undo — so this module only
 * models field patches.
 */

export type StagedKind = "section" | "component";

export type StagedPatch = Record<string, unknown>;

export type StagedEdit = {
  kind: StagedKind;
  id: string;
  /** The saved values for exactly the fields being changed, for a faithful cancel. */
  before: StagedPatch;
  /** The pending values, merged across every change made since staging began. */
  patch: StagedPatch;
};

/** Keyed by kind and id so a section and a component can never collide. */
export type StagedState = Record<string, StagedEdit>;

export const stagedKey = (kind: StagedKind, id: string): string => `${kind}:${id}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep-equal enough for content rows: JSON values only, key order insensitive. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!sameValue(a[key], b[key])) return false;
    return true;
  }
  return false;
}

/**
 * Adds a change to the buffer. `saved` is the row as stored, used to record the
 * original values once and to drop fields that were edited back to their
 * original value.
 */
export function stageEdit(
  state: StagedState,
  kind: StagedKind,
  id: string,
  patch: StagedPatch,
  saved: StagedPatch,
): StagedState {
  const key = stagedKey(kind, id);
  const existing = state[key];
  const before: StagedPatch = { ...(existing?.before ?? {}) };
  const merged: StagedPatch = { ...(existing?.patch ?? {}) };

  for (const [field, value] of Object.entries(patch)) {
    if (!(field in before)) before[field] = saved[field];
    if (sameValue(value, before[field])) delete merged[field];
    else merged[field] = value;
  }

  for (const field of Object.keys(before)) {
    if (!(field in merged)) delete before[field];
  }

  const next: StagedState = { ...state };
  if (Object.keys(merged).length === 0) delete next[key];
  else next[key] = { kind, id, before, patch: merged };
  return next;
}

/** Drops one element's pending changes. */
export function discardEdit(state: StagedState, kind: StagedKind, id: string): StagedState {
  const next = { ...state };
  delete next[stagedKey(kind, id)];
  return next;
}

/** The pending patch for one element, or null when nothing is staged for it. */
export function pendingPatch(
  state: StagedState,
  kind: StagedKind,
  id: string,
): StagedPatch | null {
  const edit = state[stagedKey(kind, id)];
  return edit ? edit.patch : null;
}

/** Applies pending changes over a saved row so the preview shows them. */
export function withPending<T extends { id: string }>(
  state: StagedState,
  kind: StagedKind,
  row: T,
): T {
  const patch = pendingPatch(state, kind, row.id);
  return patch ? ({ ...row, ...patch } as T) : row;
}

export function stagedCount(state: StagedState): number {
  return Object.keys(state).length;
}

export function hasPending(state: StagedState, kind: StagedKind, id: string): boolean {
  return pendingPatch(state, kind, id) !== null;
}

/** Every staged edit, in a stable order, ready to be written. */
export function stagedEdits(state: StagedState): StagedEdit[] {
  return Object.keys(state)
    .sort()
    .map((key) => state[key]!)
    .filter((edit): edit is StagedEdit => !!edit);
}

/** The names of changed fields, in plain words, for the Apply button's label. */
export function stagedFieldSummary(state: StagedState): string {
  const fields = new Set<string>();
  for (const edit of stagedEdits(state)) {
    for (const field of Object.keys(edit.patch)) fields.add(FIELD_WORDS[field] ?? field);
  }
  const list = [...fields].sort();
  if (list.length === 0) return "";
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const FIELD_WORDS: Record<string, string> = {
  heading: "heading",
  subheading: "sub-heading",
  body: "text",
  is_visible: "visibility",
  settings: "details",
  variant: "layout",
  values: "content",
};
