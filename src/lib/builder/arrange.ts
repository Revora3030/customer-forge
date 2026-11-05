/**
 * B13-4: arranging sections straight in the preview.
 *
 * The preview frame shows a drag handle on each section and a
 * "+ Add section with AI" line between sections. Everything the frame sends is
 * a request (move this section next to that one / add a section here); the
 * builder decides the real order from its own saved data, so hidden sections
 * keep their places and a crafted message can only reorder this page's rows.
 *
 * Pure helpers only (no DOM, no network), so every rule here is unit-tested.
 */
import { reorder } from "@/lib/builder-tree";

export type DropPosition = "before" | "after";

/** A section row as the builder caches it (only what ordering needs). */
type OrderedRow = { id: string; sort_order: number };
type PageRows = { id: string; sections: OrderedRow[] };

/** The page's section ids in saved order (hidden sections included). */
export function sectionOrder(page: PageRows): string[] {
  return [...page.sections].sort((a, b) => a.sort_order - b.sort_order).map((row) => row.id);
}

/** The page that holds a section, or null when it isn't on any page. */
export function pageOfSectionId<P extends PageRows>(pages: P[], id: string): P | null {
  return pages.find((page) => page.sections.some((row) => row.id === id)) ?? null;
}

/**
 * The new full order of the page for "put `dragId` before/after `overId`".
 * Null when nothing would change or the two sections aren't on the same page
 * (a section is never moved across pages from the preview).
 */
export function planSectionMove(
  pages: PageRows[],
  dragId: string,
  overId: string,
  position: DropPosition,
): { pageId: string; before: string[]; after: string[] } | null {
  if (dragId === overId) return null;
  const page = pageOfSectionId(pages, dragId);
  if (!page || !page.sections.some((row) => row.id === overId)) return null;
  const before = sectionOrder(page);
  const after = reorder(before, dragId, overId, position);
  if (after === before) return null;
  return { pageId: page.id, before, after };
}

/**
 * Keyboard alternative to dragging: one step up or down among the sections the
 * owner can see in the preview. Returns the neighbour to drop next to, or null
 * at the top or bottom.
 */
export function stepTarget(
  visibleIds: string[],
  id: string,
  direction: -1 | 1,
): { overId: string; position: DropPosition } | null {
  const from = visibleIds.indexOf(id);
  if (from < 0) return null;
  const overId = visibleIds[from + direction];
  if (!overId) return null;
  return { overId, position: direction < 0 ? "before" : "after" };
}

/**
 * Where a drag would land, from the pointer's height and each visible
 * section's top/bottom (viewport pixels, in page order). The upper half of a
 * section drops before it, the lower half after it; past the ends clamps to
 * the first/last section. Null when there are no sections.
 */
export function dropSpot(
  blocks: { id: string; top: number; bottom: number }[],
  y: number,
): { overId: string; position: DropPosition } | null {
  if (blocks.length === 0) return null;
  for (const block of blocks) {
    const middle = (block.top + block.bottom) / 2;
    if (y < middle) return { overId: block.id, position: "before" };
    if (y <= block.bottom) return { overId: block.id, position: "after" };
  }
  return { overId: blocks[blocks.length - 1]!.id, position: "after" };
}

/** True when dropping here would leave the section where it already is. */
export function isNoopDrop(visibleIds: string[], dragId: string, overId: string, position: DropPosition): boolean {
  if (dragId === overId) return true;
  return reorder(visibleIds, dragId, overId, position) === visibleIds;
}

/** The DOM order to show at once (optimistic), from the page's planned full order. */
export function visibleOrder(fullOrder: string[], visibleIds: string[]): string[] {
  const shown = new Set(visibleIds);
  return fullOrder.filter((id) => shown.has(id));
}

/**
 * The cached page tree with one page's sections renumbered to `order`
 * (optimistic update; the saved rows are written the same way 0..n-1).
 */
export function withSectionOrder<P extends PageRows>(pages: P[], pageId: string, order: string[]): P[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return pages.map((page) =>
    page.id !== pageId
      ? page
      : {
          ...page,
          sections: page.sections.map((row) => (rank.has(row.id) ? { ...row, sort_order: rank.get(row.id)! } : row)),
        },
  );
}

/** Plain-language line read to screen readers (and shown in the toast) after a move. */
export function moveAnnouncement(label: string | null, order: string[], id: string): string {
  const name = (label ?? "").trim() || "Section";
  const at = order.indexOf(id);
  return at < 0 ? `${name} moved` : `${name} moved to position ${at + 1} of ${order.length}`;
}

/** Where a new section should go: next to an existing one on the open page. */
export type InsertSpot = {
  /** The neighbouring section the new one goes next to. */
  id: string;
  position: DropPosition;
  /** That neighbour's plain-language name ("Services"). */
  label: string | null;
  kind: string | null;
};

/** The composer chip text, e.g. "New section after Services". */
export function insertChipLabel(spot: Pick<InsertSpot, "position" | "label" | "kind">): string {
  const name = (spot.label ?? spot.kind ?? "").trim() || "this section";
  return `New section ${spot.position} ${name}`;
}

/**
 * How the insert position is described to the AI team. Deliberately says
 * "section (id …)" rather than the "block (id …)" pick scope, so the edit is
 * not fenced to the neighbour: the new section is a new row next to it.
 */
export function insertPrefix(spot: InsertSpot): string {
  const name = ((spot.label ?? spot.kind ?? "").replace(/["\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "section").slice(0, 60);
  return `Add one new section to this page, placed directly ${spot.position} the "${name}" section (id ${spot.id}). Keep every other section where it is. The new section:`;
}

/** Removes the insert prefix again for the owner's own chat bubble. */
export function stripInsertPrefix(instruction: string): string {
  return instruction.replace(
    /^\s*Add one new section to this page, placed directly (?:before|after) the "[^"]*" section \(id [0-9A-Za-z_-]+\)\. Keep every other section where it is\. The new section:\s*/,
    "",
  );
}
