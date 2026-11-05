/**
 * JC-24 Creative District asset queue: generated pictures waiting for an
 * owner's review, read from `image_records`. Pure shaping only; nothing is
 * generated, approved or changed from the queue.
 *
 * Revora keeps no voice or motion asset records today, so those kinds are
 * reported as "not recorded", never as zero.
 */

export const ASSET_QUEUE_LIMIT = 50;

export type AssetQueueRecord = {
  id: string;
  organization_id: string;
  slot: string | null;
  status: string | null;
  source: string | null;
  alt_text: string | null;
  media_id: string | null;
  model: string | null;
  provider: string | null;
  generation: number | null;
  updated_at: string | null;
  created_at: string | null;
};

export type AssetQueueItem = {
  id: string;
  kind: "image";
  organizationId: string;
  workspace: string;
  slot: string;
  status: string;
  at: string;
  altText: string | null;
  /** Short-lived preview, or null when no picture file is recorded. */
  thumbnail: string | null;
  /** Lovable model id only; other providers aren't named here. */
  model: string | null;
  attempt: number;
};

export type AssetQueueKind = {
  kind: "image" | "voice" | "motion";
  recorded: boolean;
  waiting: number | null;
};

export type AssetQueue = {
  available: boolean;
  items: AssetQueueItem[];
  /** Total waiting (may be more than the items shown). Null when unreadable. */
  total: number | null;
  kinds: AssetQueueKind[];
  checkedAt: string;
};

/** "gallery-2" → "Gallery 2", "hero" → "Hero". Unknown slots stay readable. */
export function slotLabel(slot: string | null | undefined): string {
  const clean = String(slot ?? "")
    .replace(/[^a-z0-9 _-]/gi, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 60);
  if (!clean) return "Picture";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function buildAssetQueue(input: {
  records: AssetQueueRecord[] | null;
  total: number | null;
  workspaces: ReadonlyMap<string, string>;
  /** media id → signed preview URL */
  previews: ReadonlyMap<string, string>;
  checkedAt: string;
}): AssetQueue {
  const available = Array.isArray(input.records);
  const items: AssetQueueItem[] = (input.records ?? []).slice(0, ASSET_QUEUE_LIMIT).map((row) => ({
    id: row.id,
    kind: "image",
    organizationId: row.organization_id,
    workspace: input.workspaces.get(row.organization_id)?.trim() || "Unnamed workspace",
    slot: slotLabel(row.slot),
    status: row.status ?? "pending",
    at: row.updated_at ?? row.created_at ?? "",
    altText: row.alt_text?.trim() ? row.alt_text.trim().slice(0, 160) : null,
    thumbnail: row.media_id ? (input.previews.get(row.media_id) ?? null) : null,
    model: row.provider === "lovable" && row.model ? row.model : null,
    attempt: Math.max(1, Number(row.generation) || 1),
  }));
  return {
    available,
    items,
    total: available ? (input.total ?? items.length) : null,
    kinds: [
      { kind: "image", recorded: true, waiting: available ? (input.total ?? items.length) : null },
      { kind: "voice", recorded: false, waiting: null },
      { kind: "motion", recorded: false, waiting: null },
    ],
    checkedAt: input.checkedAt,
  };
}
