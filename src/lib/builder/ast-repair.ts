/**
 * BRF-01: AST-precise repair edits instead of rewrites.
 *
 * Revora sites are stored as composition trees (a JSON AST, see
 * composition-tree.ts), not as TypeScript source, so this is the
 * ast-grep/ts-morph idea applied to the AST we actually have:
 *
 *   1. FIND the exact node structurally (type, text, href, ancestor, path),
 *      like an ast-grep pattern, never by regenerating the page.
 *   2. EDIT only the named field of that node. A button's label can change
 *      while its link (the click action) is preserved unless an edit names it.
 *   3. RE-VALIDATE the whole tree with validateComposition.
 *   4. PROVE precision: every node outside the edited paths is deep-equal to
 *      before, and the diff lists exactly what changed (for the version log
 *      and the before/after compare).
 *
 * Pure and deterministic. Nothing here writes to the database.
 */
import {
  COMPOSITION_PRIMITIVES,
  validateComposition,
  type CompositionNode,
  type CompositionTree,
  type NodeStyle,
  type ValidateOptions,
} from "@/lib/builder/composition-tree";

/** "root", "root.children[2]", "root.children[2].children[0]". */
export type NodePath = string;

const SEGMENT = /^children\[(\d{1,3})\]$/;

export function parsePath(path: NodePath): number[] | null {
  if (typeof path !== "string" || path.length > 400) return null;
  const [head, ...rest] = path.split(".");
  if (head !== "root") return null;
  const out: number[] = [];
  for (const part of rest) {
    const match = SEGMENT.exec(part);
    if (!match) return null;
    out.push(Number(match[1]));
  }
  return out;
}

export function formatPath(indexes: number[]): NodePath {
  return `root${indexes.map((i) => `.children[${i}]`).join("")}`;
}

export function nodeAt(tree: CompositionTree, path: NodePath): CompositionNode | null {
  const indexes = parsePath(path);
  if (!indexes) return null;
  let node: CompositionNode | undefined = tree.root;
  for (const i of indexes) node = node?.children?.[i];
  return node ?? null;
}

/** Structural selector (the ast-grep "pattern" for compositions). */
export type NodeSelector = {
  type?: CompositionNode["type"];
  /** Case-insensitive substring of the node's own text. */
  text?: string;
  /** Exact href on the node or one of its CTAs. */
  href?: string;
  /** The node must sit inside a node matching this selector. */
  inside?: NodeSelector;
};

function ownMatch(node: CompositionNode, s: NodeSelector): boolean {
  if (s.type && node.type !== s.type) return false;
  if (s.text) {
    const haystack = [node.text, node.accentText, node.primaryCta?.label, node.secondaryCta?.label, node.tertiaryCta?.label]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(s.text.toLowerCase())) return false;
  }
  if (s.href) {
    const hrefs = [node.href, node.primaryCta?.href, node.secondaryCta?.href, node.tertiaryCta?.href];
    if (!hrefs.includes(s.href)) return false;
  }
  return true;
}

/** Every node matching the selector, in document order, with its path. */
export function findNodes(tree: CompositionTree, selector: NodeSelector): { path: NodePath; node: CompositionNode }[] {
  const out: { path: NodePath; node: CompositionNode }[] = [];
  const walk = (node: CompositionNode, indexes: number[], ancestors: CompositionNode[]) => {
    const insideOk = !selector.inside || ancestors.some((a) => ownMatch(a, selector.inside!));
    if (insideOk && ownMatch(node, selector)) out.push({ path: formatPath(indexes), node });
    node.children?.forEach((child, i) => walk(child, [...indexes, i], [...ancestors, node]));
  };
  walk(tree.root, [], []);
  return out;
}

/** Fields an edit may set directly. Structure (children, type) changes need replace/insert/remove. */
export const EDITABLE_FIELDS = ["text", "accentText", "alt", "href", "level", "items"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export const CTA_SLOTS = ["primaryCta", "secondaryCta", "tertiaryCta"] as const;
export type CtaSlot = (typeof CTA_SLOTS)[number];

export type RepairEdit =
  | { op: "set"; path: NodePath; field: EditableField; value: CompositionNode[EditableField] }
  | { op: "style"; path: NodePath; style: Partial<NodeStyle> }
  /** Changes a CTA's label (and optionally aria label). The href, its click action, is kept. */
  | { op: "cta_label"; path: NodePath; slot: CtaSlot; label: string; ariaLabel?: string }
  | { op: "replace"; path: NodePath; node: CompositionNode }
  | { op: "insert"; path: NodePath; index: number; node: CompositionNode }
  | { op: "remove"; path: NodePath };

export type RepairChange = { path: NodePath; what: string; before: unknown; after: unknown };

export type RepairResult =
  | { ok: true; tree: CompositionTree; changes: RepairChange[] }
  | { ok: false; problems: string[] };

/** Copy-on-write update of the node at `indexes`; untouched branches keep identity. */
function updateAt(node: CompositionNode, indexes: number[], fn: (n: CompositionNode) => CompositionNode | null): CompositionNode | null {
  if (!indexes.length) return fn(node);
  const [head, ...rest] = indexes;
  const children = node.children ?? [];
  const child = children[head!];
  if (!child) throw new Error("missing");
  const next = updateAt(child, rest, fn);
  const copy = children.slice();
  if (next === null) copy.splice(head!, 1);
  else copy[head!] = next;
  return { ...node, children: copy };
}

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

const PRIMITIVES: ReadonlySet<string> = new Set(COMPOSITION_PRIMITIVES);

/**
 * Applies edits in order. Any edit that can't land exactly as written (bad
 * path, missing CTA, unknown field) fails the whole repair: no partial trees.
 */
export function applyRepairEdits(
  tree: CompositionTree,
  edits: RepairEdit[],
  options: ValidateOptions = {},
): RepairResult {
  const problems: string[] = [];
  const changes: RepairChange[] = [];
  let root = tree.root;
  const current = () => ({ ...tree, root });

  edits.forEach((edit, n) => {
    if (problems.length) return;
    const label = `edit ${n + 1} (${edit.op} ${edit.path})`;
    const indexes = parsePath(edit.path);
    const target = indexes ? nodeAt(current(), edit.path) : null;
    if (!indexes || !target) return void problems.push(`${label}: no node at that path`);
    try {
      switch (edit.op) {
        case "set": {
          if (!(EDITABLE_FIELDS as readonly string[]).includes(edit.field)) return void problems.push(`${label}: ${edit.field} can't be set`);
          changes.push({ path: edit.path, what: edit.field, before: clone(target[edit.field]), after: clone(edit.value) });
          root = updateAt(root, indexes, (node) => ({ ...node, [edit.field]: clone(edit.value) }))!;
          return;
        }
        case "style": {
          const before = target.style ?? {};
          const style = { ...before, ...clone(edit.style) } as NodeStyle;
          for (const key of Object.keys(edit.style) as (keyof NodeStyle)[]) {
            changes.push({ path: edit.path, what: `style.${String(key)}`, before: clone(before[key]), after: clone(edit.style[key]) });
          }
          root = updateAt(root, indexes, (node) => ({ ...node, style }))!;
          return;
        }
        case "cta_label": {
          const cta = target[edit.slot];
          if (!cta) return void problems.push(`${label}: that node has no ${edit.slot}`);
          const label2 = edit.label.trim();
          if (!label2) return void problems.push(`${label}: empty label`);
          changes.push({ path: edit.path, what: `${edit.slot}.label`, before: cta.label, after: label2 });
          const next = { ...cta, label: label2, ...(edit.ariaLabel === undefined ? {} : { ariaLabel: edit.ariaLabel }) };
          root = updateAt(root, indexes, (node) => ({ ...node, [edit.slot]: next }))!;
          return;
        }
        case "replace": {
          if (!PRIMITIVES.has(edit.node?.type)) return void problems.push(`${label}: unknown node type`);
          changes.push({ path: edit.path, what: "node", before: clone(target), after: clone(edit.node) });
          root = updateAt(root, indexes, () => clone(edit.node))!;
          return;
        }
        case "insert": {
          if (!PRIMITIVES.has(edit.node?.type)) return void problems.push(`${label}: unknown node type`);
          const count = target.children?.length ?? 0;
          if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index > count) return void problems.push(`${label}: index out of range`);
          changes.push({ path: `${edit.path}.children[${edit.index}]`, what: "insert", before: null, after: clone(edit.node) });
          root = updateAt(root, indexes, (node) => {
            const children = (node.children ?? []).slice();
            children.splice(edit.index, 0, clone(edit.node));
            return { ...node, children };
          })!;
          return;
        }
        case "remove": {
          if (!indexes.length) return void problems.push(`${label}: the root can't be removed`);
          changes.push({ path: edit.path, what: "remove", before: clone(target), after: null });
          root = updateAt(root, indexes, () => null)!;
          return;
        }
        default:
          problems.push(`${label}: unknown op`);
      }
    } catch {
      problems.push(`${label}: no node at that path`);
    }
  });

  if (problems.length) return { ok: false, problems };
  const validated = validateComposition(current(), options);
  if (!validated.ok) return { ok: false, problems: validated.issues.map((i) => `${i.path}: ${i.problem}`) };
  return { ok: true, tree: current(), changes };
}

/**
 * Paths whose subtree differs between two trees (deepest first-difference per
 * branch). Used to prove a repair touched only what it said it would.
 */
export function changedPaths(before: CompositionNode, after: CompositionNode, path: NodePath = "root"): NodePath[] {
  if (before === after) return [];
  const { children: bc = [], ...bRest } = before;
  const { children: ac = [], ...aRest } = after;
  if (JSON.stringify(bRest) !== JSON.stringify(aRest) || bc.length !== ac.length) return [path];
  return bc.flatMap((child, i) => changedPaths(child, ac[i]!, `${path}.children[${i}]`));
}

/** True when every changed path is one of (or inside / the parent of an insert/remove at) the edited paths. */
export function onlyEditedChanged(before: CompositionTree, after: CompositionTree, edits: RepairEdit[]): boolean {
  const allowed = edits.map((e) => e.path);
  return changedPaths(before.root, after.root).every((p) => allowed.some((a) => p === a || p.startsWith(`${a}.`)));
}

/** Guide for the AI repair step: ask for these edits, never a whole new page. */
export const AST_REPAIR_GUIDE = [
  "Fix only the failing part, using these edit ops on node paths like root.children[1].children[0]:",
  '{"op":"set","path":"...","field":"text|accentText|alt|href|level|items","value":...}',
  '{"op":"style","path":"...","style":{"color":"...","background":"..."}}',
  '{"op":"cta_label","path":"...","slot":"primaryCta|secondaryCta|tertiaryCta","label":"..."} (keeps the link)',
  '{"op":"replace"|"insert","path":"...","index":0,"node":{...}} / {"op":"remove","path":"..."}',
  "Never regenerate the whole page. Never change links, forms or widgets you weren't asked to fix.",
].join("\n");

/** Reads an AI reply into edits; anything malformed is dropped (and reported). */
export function parseRepairEdits(raw: unknown): { edits: RepairEdit[]; rejected: number } {
  const list = (raw as { edits?: unknown } | null)?.edits;
  if (!Array.isArray(list)) return { edits: [], rejected: 0 };
  const edits: RepairEdit[] = [];
  let rejected = 0;
  for (const item of list.slice(0, 40)) {
    const e = (item ?? {}) as Record<string, unknown> & { op?: unknown; path?: unknown };
    const ok =
      typeof e.path === "string" &&
      parsePath(e.path) !== null &&
      ((e.op === "set" && typeof e["field"] === "string" && (EDITABLE_FIELDS as readonly string[]).includes(e["field"] as string)) ||
        (e.op === "style" && typeof e["style"] === "object" && e["style"] !== null && !Array.isArray(e["style"])) ||
        (e.op === "cta_label" && (CTA_SLOTS as readonly string[]).includes(String(e["slot"])) && typeof e["label"] === "string") ||
        ((e.op === "replace" || e.op === "insert") && typeof e["node"] === "object" && e["node"] !== null) ||
        e.op === "remove");
    if (ok) edits.push(e as unknown as RepairEdit);
    else rejected++;
  }
  return { edits, rejected };
}

/**
 * Applies per-section edit lists, e.g. {"edits":{"<sectionId>":[...edits]}}, to
 * the current trees. A section whose edits fail (or that has none) keeps its
 * current tree untouched; unknown section ids are ignored. Returns null when
 * the reply carries no per-section edits at all, so callers can fall back.
 */
export function applySectionEdits(
  current: Record<string, unknown>,
  raw: unknown,
): { trees: Record<string, unknown>; applied: number; failed: number } | null {
  const bySection = (raw as { edits?: unknown } | null)?.edits;
  if (!bySection || typeof bySection !== "object" || Array.isArray(bySection)) return null;
  const trees: Record<string, unknown> = { ...current };
  let applied = 0;
  let failed = 0;
  for (const [sectionId, list] of Object.entries(bySection as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(current, sectionId)) continue;
    const { edits } = parseRepairEdits({ edits: list });
    if (!edits.length) continue;
    const result = applyRepairEdits(current[sectionId] as CompositionTree, edits);
    if (result.ok) {
      trees[sectionId] = result.tree;
      applied += 1;
    } else {
      failed += 1;
    }
  }
  return { trees, applied, failed };
}
