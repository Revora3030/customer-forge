export const BUILDER_VIEWPORTS = [
  { key: "phone", label: "Phone", width: 390 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "laptop", label: "Laptop", width: 1280 },
  { key: "wide", label: "Wide", width: 1440 },
] as const;

export type BuilderViewportKey = (typeof BUILDER_VIEWPORTS)[number]["key"];

/**
 * The address the builder preview loads. It points at the owner's private draft
 * rather than the public site, because the public address only serves a site
 * after it has been published — before that it would show "business not found",
 * and it would never show unpublished edits.
 */
export function previewPath(slug: string, pageSlug: string): string {
  const safeSite = encodeURIComponent(slug.trim());
  const safePage = pageSlug.trim();
  return safePage === "home" || safePage === "" 
    ? `/draft/${safeSite}`
    : `/draft/${safeSite}/${encodeURIComponent(safePage)}`;
}

export function previewZoom(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0.5, Math.round(value * 20) / 20));
}