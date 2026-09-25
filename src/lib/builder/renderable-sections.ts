/**
 * Section kinds the public renderer can draw. Anything else is not shown, and
 * is never swapped for a built-in design — so the site check reports it and
 * the AI must turn it into a composition (or remove it) before publishing.
 *
 * Kept in step with the `switch` in src/components/site/SiteSections.tsx
 * (a test locks the two together).
 */
export const RENDERABLE_SECTION_KINDS = [
  "composition",
  "quote",
  "booking",
  "contact",
  "sticky_cta",
  "post_list",
  "embed",
  "custom",
] as const;

const KINDS = new Set<string>(RENDERABLE_SECTION_KINDS);

export function isRenderableSectionKind(kind: unknown): boolean {
  return typeof kind === "string" && KINDS.has(kind);
}
