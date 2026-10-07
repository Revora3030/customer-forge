/**
 * Inline text edits made directly in the builder preview (double-click a
 * heading, paragraph, button or link and type).
 *
 * Pure helpers shared by the server function and tests. An edit addresses one
 * node by its tree path (`root.0.2`, the same key the renderer uses) and may
 * only change that node's plain `text`. Structure, styles, links and pictures
 * are never touched here; those still go through the AI or the canvas.
 */

import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

/** Node types whose `text` an owner may change in place. */
export const INLINE_EDITABLE_TYPES = new Set<CompositionNode["type"]>(["heading", "text", "button", "link", "quote"]);

export const INLINE_TEXT_MAX = 600;
const PATH = /^root(?:\.\d{1,3}){0,12}$/;

export function isInlinePath(path: unknown): path is string {
  return typeof path === "string" && PATH.test(path);
}

/** Collapses whitespace, strips control characters and markup-looking input. */
export function cleanInlineText(value: unknown): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex -- control characters are stripped from owner text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, INLINE_TEXT_MAX);
}

export function nodeAtPath(tree: CompositionTree, path: string): CompositionNode | null {
  if (!isInlinePath(path)) return null;
  let node: CompositionNode | undefined = tree.root;
  for (const part of path.split(".").slice(1)) {
    node = node?.children?.[Number(part)];
    if (!node) return null;
  }
  return node ?? null;
}

export type InlineEditResult =
  | { ok: true; tree: CompositionTree; before: string; after: string }
  | { ok: false; reason: "bad_path" | "not_editable" | "empty" | "unchanged" };

/** Returns a NEW tree with only that node's text replaced. */
export function applyInlineText(tree: CompositionTree, path: string, value: unknown): InlineEditResult {
  const target = nodeAtPath(tree, path);
  if (!target) return { ok: false, reason: "bad_path" };
  if (!INLINE_EDITABLE_TYPES.has(target.type) || target.children?.length) return { ok: false, reason: "not_editable" };
  const after = cleanInlineText(value);
  if (!after) return { ok: false, reason: "empty" };
  const before = target.text ?? "";
  if (before === after) return { ok: false, reason: "unchanged" };

  const clone = structuredClone(tree);
  const node = nodeAtPath(clone, path)!;
  node.text = after;
  return { ok: true, tree: clone, before, after };
}
