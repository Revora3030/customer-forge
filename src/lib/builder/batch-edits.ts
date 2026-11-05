/**
 * Batch quick edits (COMP-3): words the owner types straight into the builder
 * preview collect in a "N changes" bar and are saved together, once, with a
 * single Save. Editing is free; only Save writes anything.
 *
 * Pure helpers (no React, no network, no AI) shared by the preview bar, the
 * server save and the tests. A direct edit never calls the assistant: it only
 * changes a node's plain text through `applyInlineText`.
 */

import type { CompositionTree } from "@/lib/builder/composition-tree";
import { applyInlineText, cleanInlineText, isInlinePath } from "@/lib/builder/inline-edit";

/** One unsaved text change. `before` is the words as last saved, never an earlier unsaved draft. */
export type PendingEdit = {
  sectionId: string;
  path: string;
  before: string;
  after: string;
  /** Plain-language block name for the changes list ("Headline banner"), if known. */
  label?: string | null;
};

/** A Save carries at most this many edits, so one request stays small. */
export const MAX_BATCH_EDITS = 50;

const keyOf = (edit: Pick<PendingEdit, "sectionId" | "path">) => `${edit.sectionId}::${edit.path}`;

/**
 * Adds an edit to the pending list. Editing the same words again keeps the
 * ORIGINAL `before`, so the list always says "saved text -> new text". Putting
 * the words back to what was saved removes the entry. Never mutates `list`.
 */
export function stageEdit(list: readonly PendingEdit[], edit: PendingEdit): PendingEdit[] {
  const after = cleanInlineText(edit.after);
  if (!isInlinePath(edit.path) || !edit.sectionId) return [...list];
  const key = keyOf(edit);
  const existing = list.find((row) => keyOf(row) === key);
  const before = existing ? existing.before : cleanInlineText(edit.before);
  const rest = list.filter((row) => keyOf(row) !== key);
  if (!after || after === before) return rest;
  if (!existing && rest.length >= MAX_BATCH_EDITS) return [...list];
  const next: PendingEdit = { sectionId: edit.sectionId, path: edit.path, before, after, label: edit.label ?? existing?.label ?? null };
  // Keep the order the owner first touched things in.
  return existing ? list.map((row) => (keyOf(row) === key ? next : row)) : [...rest, next];
}

/** The "N changes" bar text. */
export function batchLabel(count: number): string {
  if (count <= 0) return "No changes";
  return count === 1 ? "1 change" : `${count} changes`;
}

const clip = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** One short line per change, for the bar's list and the saved version's note. */
export function describeEdit(edit: PendingEdit): string {
  const where = edit.label ? `${edit.label}: ` : "";
  return `${where}“${clip(edit.before)}” → “${clip(edit.after)}”`;
}

/** Restore-point label: short and plain, capped for the database column. */
export function batchVersionLabel(edits: readonly Pick<PendingEdit, "after" | "label">[]): string {
  const count = edits.length;
  const head = `Before ${count} quick edit${count === 1 ? "" : "s"}`;
  const names = edits
    .map((edit) => edit.label?.trim())
    .filter((name): name is string => Boolean(name));
  const unique = Array.from(new Set(names)).slice(0, 3);
  const label = unique.length ? `${head}: ${unique.join(", ")}` : head;
  return label.slice(0, 120);
}

export type BatchEditInput = { sectionId: string; path: string; text: string };

export type BatchPlan = {
  /** Updated tree per section, with every edit for that section applied. */
  trees: Map<string, CompositionTree>;
  /** What changed, in the order sent. */
  applied: { sectionId: string; path: string; before: string; after: string }[];
  /** Edits that were skipped, with why (never written). */
  skipped: { sectionId: string; path: string; reason: "no_block" | "no_layout" | "bad_path" | "not_editable" | "empty" | "unchanged" }[];
};

/**
 * Applies every edit to a copy of each block's layout. Edits to the same
 * block build on each other, so two edits in one block are both kept. A bad
 * edit is skipped, not fatal: the rest still save. Input trees are untouched.
 */
export function planBatch(
  trees: ReadonlyMap<string, CompositionTree | null>,
  edits: readonly BatchEditInput[],
): BatchPlan {
  const working = new Map<string, CompositionTree>();
  const plan: BatchPlan = { trees: working, applied: [], skipped: [] };
  for (const edit of edits) {
    if (!trees.has(edit.sectionId)) {
      plan.skipped.push({ sectionId: edit.sectionId, path: edit.path, reason: "no_block" });
      continue;
    }
    const base = working.get(edit.sectionId) ?? trees.get(edit.sectionId) ?? null;
    if (!base) {
      plan.skipped.push({ sectionId: edit.sectionId, path: edit.path, reason: "no_layout" });
      continue;
    }
    const result = applyInlineText(base, edit.path, edit.text);
    if (!result.ok) {
      plan.skipped.push({ sectionId: edit.sectionId, path: edit.path, reason: result.reason });
      continue;
    }
    working.set(edit.sectionId, result.tree);
    plan.applied.push({ sectionId: edit.sectionId, path: edit.path, before: result.before, after: result.after });
  }
  return plan;
}
