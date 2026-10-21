export const BUILDER_VIEWPORTS = [
  { key: "compact", label: "Small phone", width: 320 },
  { key: "phone", label: "Phone", width: 390 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "laptop", label: "Laptop", width: 1280 },
  { key: "wide", label: "Wide", width: 1440 },
  { key: "ultra", label: "4K", width: 2560 },
] as const;
export type BuilderViewportKey = (typeof BUILDER_VIEWPORTS)[number]["key"];

export function previewPath(slug: string, pageSlug: string): string {
  const safeSite = encodeURIComponent(slug.trim());
  const safePage = pageSlug.trim();
  return safePage === "home" || safePage === "" ? `/draft/${safeSite}` : `/draft/${safeSite}/${encodeURIComponent(safePage)}`;
}
export function previewZoom(value: number): number {
  if (!Number.isFinite(value)) return 0.75;
  return Math.min(1, Math.max(0.5, Math.round(value * 20) / 20));
}
export type CompareMode = "off" | "side" | "overlay";
/** Overlay requires a live image; unpublished sites still retain their draft pane. */
export function effectiveCompareMode(mode: CompareMode, livePublished: boolean): CompareMode {
  return mode === "overlay" && !livePublished ? "side" : mode;
}
export function comparisonStatus(loading: boolean, failed: boolean, diff: DraftDiff | null): string {
  if (loading) return "Comparing…";
  if (failed) return "Comparison unavailable";
  return draftDiffLabel(diff);
}
export function nextCompareMode(mode: CompareMode): CompareMode {
  return mode === "off" ? "side" : mode === "side" ? "overlay" : "off";
}
const positive = (value: number) => Number.isFinite(value) && value > 0;

/** Fit the available width, even when a 4K frame needs a scale below 0.1. */
export function fitZoom(stageWidth: number, viewportWidth: number): number {
  if (!positive(stageWidth) || !positive(viewportWidth)) return 0.75;
  const available = Math.max(1, stageWidth - 24);
  return Math.min(1, available / viewportWidth);
}
export function compareScale(mode: CompareMode, scale: number, stageWidth: number, viewportWidth: number): number {
  const safeScale = positive(scale) ? Math.min(scale, 1) : 0.75;
  if (mode !== "side" || !positive(stageWidth) || !positive(viewportWidth)) return safeScale;
  const availablePerPane = Math.max(1, (stageWidth - 36) / 2);
  return Math.min(safeScale, availablePerPane / viewportWidth);
}

type DiffSection = { id: string; fingerprint: string };
export type DraftDiff = { updated: number; added: number; removed: number };
export function draftDiff(live: readonly DiffSection[], draft: readonly DiffSection[]): DraftDiff {
  const liveById = new Map(live.map((section) => [section.id, section.fingerprint]));
  const draftIds = new Set(draft.map((section) => section.id));
  let updated = 0, added = 0;
  for (const section of draft) {
    const before = liveById.get(section.id);
    if (before === undefined) added += 1;
    else if (before !== section.fingerprint) updated += 1;
  }
  return { updated, added, removed: live.filter((section) => !draftIds.has(section.id)).length };
}
export function draftDiffLabel(diff: DraftDiff | null): string {
  if (!diff) return "Not published yet";
  const parts: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word} section${n === 1 ? "" : "s"}`;
  if (diff.updated) parts.push(plural(diff.updated, "updated"));
  if (diff.added) parts.push(plural(diff.added, "new"));
  if (diff.removed) parts.push(plural(diff.removed, "removed"));
  return parts.length ? `Draft has ${parts.join(", ")}` : "Draft matches live";
}
