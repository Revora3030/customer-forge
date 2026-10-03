/**
 * Section kinds the public renderer can draw. Anything else is not shown.
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
  // Fallback layouts: these render the section's heading, body and components
  // in a simple clean layout when no AI composition tree exists.
  "hero",
  "services",
  "process",
  "social_proof",
  "faq",
  "home",
  "page",
  "story",
  "values",
  "service_area",
] as const;

const KINDS = new Set<string>(RENDERABLE_SECTION_KINDS);

export function isRenderableSectionKind(kind: unknown): boolean {
  return typeof kind === "string" && KINDS.has(kind);
}
