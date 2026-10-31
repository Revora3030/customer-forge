/**
 * One h1 per page, and an outline that never skips a level (audit P1-08).
 *
 * A page is drawn from several saved layouts that were each written on their
 * own, so a page could carry two h1s, or none, or jump from h1 to h4. Here the
 * section layouts are read in page order and corrected before they render: the
 * first level-1 heading stays the only h1 (later ones become h2); when no
 * layout has one, the first heading on the page becomes the h1; and a heading
 * is never more than one level below the one before it. Only the `level` of a
 * heading changes, never its words or its size, which come from its style.
 * The site header and footer render their headings as plain text, so they are
 * not part of this outline.
 */
import type { CompositionNode } from "@/lib/builder/composition-tree";

/** The node types that render inside a heading tag; anything else turns the heading into a div. */
const PHRASING_TYPES = new Set(["media", "icon", "button", "link", "divider"]);
const rendersAsHeading = (node: CompositionNode): boolean =>
  node.type === "heading" && (node.children ?? []).every((child) => PHRASING_TYPES.has(child.type) && childrenArePhrasing(child));
function childrenArePhrasing(node: CompositionNode): boolean {
  return (node.children ?? []).every((child) => PHRASING_TYPES.has(child.type) && childrenArePhrasing(child));
}

type Level = 1 | 2 | 3 | 4;

function collect(node: CompositionNode, into: CompositionNode[]): void {
  if (rendersAsHeading(node)) into.push(node);
  for (const child of node.children ?? []) collect(child, into);
}

/** Returns the roots with a corrected heading outline. Roots that need no change are returned as they are. */
export function normalizeHeadingOutline(roots: readonly (CompositionNode | null)[]): (CompositionNode | null)[] {
  const cloned = roots.map((root) => (root ? (structuredClone(root) as CompositionNode) : null));
  const headings: CompositionNode[] = [];
  for (const root of cloned) if (root) collect(root, headings);
  if (headings.length === 0) return [...roots];

  const levels = headings.map((heading) => (heading.level ?? 2) as Level);
  const firstH1 = levels.indexOf(1);
  if (firstH1 === -1) levels[0] = 1;
  else levels.forEach((level, index) => { if (level === 1 && index !== firstH1) levels[index] = 2; });
  let previous = 0;
  levels.forEach((level, index) => {
    const allowed = Math.min(level, previous + 1) as Level;
    levels[index] = allowed;
    previous = allowed;
  });
  let changed = false;
  headings.forEach((heading, index) => {
    if ((heading.level ?? 2) !== levels[index]) {
      heading.level = levels[index]!;
      changed = true;
    }
  });
  return changed ? cloned : [...roots];
}
