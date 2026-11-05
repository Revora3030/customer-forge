/**
 * Builder chat checkpoints (CU-5): pure helpers, no database access.
 *
 * A checkpoint is a published site version that `publishSiteNow` already
 * saves in `website_versions` (see `site-versions.ts`); there is no new table.
 * An owner may give one a name or pin it. Both live inside the snapshot's own
 * `pages` JSON (keys below), so pruning can see a pin and a restored copy can
 * drop it again. The database work lives in `checkpoints.functions.ts`.
 */
import type { VersionEntry } from "@/lib/site-versions";

/** Owners and admins: restoring puts a different site in front of visitors. */
export const CHECKPOINT_MIN_ROLE = "admin" as const;
export const CHECKPOINT_NAME_MAX = 60;
/** Pins are never pruned, so they are capped to keep storage bounded. */
export const MAX_PINNED_CHECKPOINTS = 10;

export const CHECKPOINT_NAME_KEY = "checkpoint_name";
export const CHECKPOINT_PINNED_KEY = "checkpoint_pinned";

type Row = Record<string, unknown>;

export type CheckpointMeta = { name: string | null; pinned: boolean };

export type Checkpoint = VersionEntry & CheckpointMeta;

const asRow = (body: unknown): Row => (body && typeof body === "object" && !Array.isArray(body) ? (body as Row) : {});

/** Tidies an owner-typed name: one line, trimmed, capped; empty means "no name". */
export function cleanCheckpointName(value: unknown): string | null {
  const text = Array.from(String(value ?? ""), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? " " : char;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHECKPOINT_NAME_MAX)
    .trim();
  return text ? text : null;
}

/** Reads the owner's name and pin from a snapshot body. */
export function readCheckpointMeta(pages: unknown): CheckpointMeta {
  const body = asRow(pages);
  const pinned = body[CHECKPOINT_PINNED_KEY];
  return {
    name: cleanCheckpointName(body[CHECKPOINT_NAME_KEY]),
    pinned: pinned === true || pinned === "true",
  };
}

/** True when a snapshot is pinned (accepts the body or PostgREST's `->>` text). */
export function isPinned(value: unknown): boolean {
  if (value === true || value === "true") return true;
  return typeof value === "object" && value !== null ? readCheckpointMeta(value).pinned : false;
}

/** A copy of the snapshot body with the name and pin changed; other keys untouched. */
export function applyCheckpointMeta(
  pages: unknown,
  patch: { name?: string | null | undefined; pinned?: boolean | undefined },
): Row {
  const next: Row = { ...asRow(pages) };
  if (patch.name !== undefined) {
    const name = cleanCheckpointName(patch.name);
    if (name) next[CHECKPOINT_NAME_KEY] = name;
    else delete next[CHECKPOINT_NAME_KEY];
  }
  if (patch.pinned !== undefined) {
    if (patch.pinned) next[CHECKPOINT_PINNED_KEY] = true;
    else delete next[CHECKPOINT_PINNED_KEY];
  }
  return next;
}

/** A restore is its own new checkpoint: it never inherits the source's name or pin. */
export function stripCheckpointMeta<T extends Row>(pages: T): T {
  const next = { ...pages };
  delete next[CHECKPOINT_NAME_KEY];
  delete next[CHECKPOINT_PINNED_KEY];
  return next;
}

/** Adds the name and pin to version list entries (matched by id). */
export function toCheckpoints(
  entries: readonly VersionEntry[],
  pagesById: ReadonlyMap<string, unknown>,
): Checkpoint[] {
  return entries.map((entry) => ({ ...entry, ...readCheckpointMeta(pagesById.get(entry.id)) }));
}

/**
 * The checkpoint "before this message": the newest one published strictly
 * before the owner sent it. Null when there is none, or when it is the live
 * site already (nothing changed since, so there is nothing to put back), or
 * when its live check failed (never offered as a restore).
 */
export function checkpointBefore<T extends Pick<VersionEntry, "date" | "isLive" | "verification" | "version">>(
  checkpoints: readonly T[],
  sentAt: number | null | undefined,
): T | null {
  if (sentAt === null || sentAt === undefined || !Number.isFinite(sentAt)) return null;
  const before = [...checkpoints]
    .filter((entry) => {
      const at = Date.parse(entry.date);
      return Number.isFinite(at) && at < sentAt;
    })
    .sort((a, b) => b.version - a.version)[0];
  if (!before || before.isLive || before.verification === "failed") return null;
  return before;
}

/**
 * When the owner sent a chat message. Saved messages carry their time; a
 * message sent in this session is stamped the first time it is seen, which is
 * the moment it was sent, and the stamp is kept for the life of the page.
 */
const firstSeen = new Map<string, number>();
export function messageSentAt(task: { id: string; sentAt?: string | undefined }, now: () => number = Date.now): number {
  const saved = task.sentAt ? Date.parse(task.sentAt) : Number.NaN;
  if (Number.isFinite(saved)) return saved;
  const known = firstSeen.get(task.id);
  if (known !== undefined) return known;
  const at = now();
  firstSeen.set(task.id, at);
  return at;
}

/** Name shown for a checkpoint: the owner's name, else "Version N". */
export function checkpointTitle(entry: Pick<Checkpoint, "name" | "version">): string {
  return entry.name ?? `Version ${entry.version}`;
}

// ---------------------------------------------------------------------------
// Before/after outline: what the compare slider draws for two snapshots.
// ---------------------------------------------------------------------------

export type OutlineSection = { id: string; label: string; heading: string; text: string };
export type OutlinePage = { id: string; title: string; sections: OutlineSection[] };
export type SnapshotOutline = { pages: OutlinePage[] };

const OUTLINE_TEXT_MAX = 160;
const MAX_OUTLINE_PAGES = 12;
const MAX_OUTLINE_SECTIONS = 30;

const plainText = (value: unknown, max = OUTLINE_TEXT_MAX) => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const kindLabel = (kind: unknown) => {
  const text = String(kind ?? "section").replace(/[_-]+/g, " ").trim() || "section";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

/**
 * A small text outline of a snapshot (visible pages and sections, headings and
 * the first words of each). It is not a screenshot, and the panel says so.
 */
export function snapshotOutline(pages: unknown): SnapshotOutline {
  const list = asRow(pages)["pages"];
  const rows = Array.isArray(list) ? (list as Row[]) : [];
  return {
    pages: rows
      .filter((page) => page["is_visible"] !== false)
      .slice(0, MAX_OUTLINE_PAGES)
      .map((page) => {
        const sections = Array.isArray(page["sections"]) ? (page["sections"] as Row[]) : [];
        return {
          id: String(page["id"] ?? page["slug"] ?? ""),
          title: plainText(page["title"] || page["slug"] || "Page", 60),
          sections: [...sections]
            .filter((section) => section["is_visible"] !== false)
            .sort((a, b) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0))
            .slice(0, MAX_OUTLINE_SECTIONS)
            .map((section) => ({
              id: String(section["id"] ?? ""),
              label: kindLabel(section["kind"]),
              heading: plainText(section["heading"], 90),
              text: plainText(section["subheading"]) || plainText(section["body"]),
            })),
        };
      }),
  };
}

/** Section ids whose outline differs between before and after (added, removed or edited). */
export function changedSectionIds(before: SnapshotOutline, after: SnapshotOutline): Set<string> {
  const index = (outline: SnapshotOutline) => {
    const map = new Map<string, string>();
    for (const page of outline.pages)
      for (const section of page.sections) map.set(section.id, `${section.label}|${section.heading}|${section.text}`);
    return map;
  };
  const a = index(before);
  const b = index(after);
  const changed = new Set<string>();
  for (const [id, value] of a) if (b.get(id) !== value) changed.add(id);
  for (const id of b.keys()) if (!a.has(id)) changed.add(id);
  return changed;
}
