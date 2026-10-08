export const BUILDER_VIEWPORTS = [
  { key: "compact", label: "Small phone", width: 320 },
  { key: "phone", label: "Phone", width: 390 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "laptop", label: "Laptop", width: 1280 },
  { key: "wide", label: "Wide", width: 1440 },
  { key: "ultra", label: "4K", width: 2560 },
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
/* ------------------------------ compare modes ------------------------------ */

export type CompareMode = "off" | "side" | "overlay";

/** Cycles the compare button: off → side by side → overlay split → off. */
export function nextCompareMode(mode: CompareMode): CompareMode {
  return mode === "off" ? "side" : mode === "side" ? "overlay" : "off";
}

/**
 * Scale for each pane: side by side splits the stage in two; the overlay and
 * single views use the whole stage. Never above the user's zoom cap.
 */
export function compareScale(mode: CompareMode, scale: number, stageWidth: number, viewportWidth: number): number {
  if (mode !== "side" || !(stageWidth > 0) || !(viewportWidth > 0)) return scale;
  return Math.max(0.1, Math.min(scale, (stageWidth - 36) / 2 / viewportWidth));
}

/** Zoom that fits the whole device width into the stage (the "Fit" option). */
export function fitZoom(stageWidth: number, viewportWidth: number): number {
  if (!(stageWidth > 0) || !(viewportWidth > 0)) return 0.75;
  return Math.max(0.1, Math.min(1, (stageWidth - 24) / viewportWidth));
}

/* ---------------------------- draft vs live diff ---------------------------- */

type DiffSection = { id: string; fingerprint: string };

export type DraftDiff = { updated: number; added: number; removed: number };

/** Counts sections changed, added and removed between the live copy and the draft. */
export function draftDiff(live: readonly DiffSection[], draft: readonly DiffSection[]): DraftDiff {
  const liveById = new Map(live.map((section) => [section.id, section.fingerprint]));
  const draftIds = new Set(draft.map((section) => section.id));
  let updated = 0;
  let added = 0;
  for (const section of draft) {
    const before = liveById.get(section.id);
    if (before === undefined) added += 1;
    else if (before !== section.fingerprint) updated += 1;
  }
  const removed = live.filter((section) => !draftIds.has(section.id)).length;
  return { updated, added, removed };
}

/** "2 updated sections · 1 new section", or "No changes" / "Not published yet". */
export function draftDiffLabel(diff: DraftDiff | null): string {
  if (!diff) return "Not published yet";
  const parts: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word} section${n === 1 ? "" : "s"}`;
  if (diff.updated) parts.push(plural(diff.updated, "updated"));
  if (diff.added) parts.push(plural(diff.added, "new"));
  if (diff.removed) parts.push(plural(diff.removed, "removed"));
  return parts.length ? `Draft has ${parts.join(", ")}` : "Draft matches live";
}
