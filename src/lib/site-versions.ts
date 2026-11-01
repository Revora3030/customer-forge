/**
 * Owner-facing site versions: pure helpers (no database access).
 *
 * Every publish already saves a permanent production snapshot in
 * `website_versions` (see `publishSiteNow`). This module turns those rows into
 * the short version list an owner sees (date, who, one-line summary of what
 * changed) and decides which old snapshots may be pruned. The database work
 * lives in `site-versions.functions.ts`.
 */

/** Newest published snapshots kept per site. Older ones are pruned. */
export const MAX_PUBLISHED_VERSIONS = 20;

type Row = Record<string, unknown>;

/** Reads the visitor-facing pages out of a production snapshot body. */
export function snapshotPages(body: unknown): Row[] {
  const pages = body && typeof body === "object" ? (body as Row)["pages"] : null;
  return Array.isArray(pages) ? (pages as Row[]) : [];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const sectionLabel = (section: Row) => {
  const kind = String(section["kind"] ?? "section").replace(/[_-]+/g, " ").trim();
  return kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
};

const SECTION_FIELDS = ["kind", "variant", "heading", "subheading", "body", "settings", "sort_order", "is_visible", "components"];
const PAGE_FIELDS = ["slug", "title", "seo_title", "seo_description", "seo_canonical", "og_title", "og_description", "og_image_url", "noindex", "is_visible"];

export type SnapshotChange = {
  pagesAdded: string[];
  pagesRemoved: string[];
  sectionsAdded: string[];
  sectionsRemoved: string[];
  sectionsEdited: number;
  pagesEdited: number;
  styleChanged: boolean;
  seoChanged: boolean;
};

export type VersionContent = { pages: unknown; generation?: unknown; seo?: unknown };

const indexSections = (pages: Row[]) => {
  const map = new Map<string, Row>();
  for (const page of pages) {
    const sections = Array.isArray(page["sections"]) ? (page["sections"] as Row[]) : [];
    for (const section of sections) map.set(String(section["id"] ?? ""), section);
  }
  return map;
};

/** What changed between two published snapshots (previous may be null for a first publish). */
export function diffSnapshots(previous: VersionContent | null, next: VersionContent): SnapshotChange {
  const nextPages = snapshotPages(next.pages);
  const prevPages = previous ? snapshotPages(previous.pages) : [];
  const prevById = new Map(prevPages.map((page) => [String(page["id"] ?? ""), page]));
  const nextById = new Map(nextPages.map((page) => [String(page["id"] ?? ""), page]));
  const pageName = (page: Row) => String(page["title"] || page["slug"] || "Page");

  const pagesAdded = nextPages.filter((p) => !prevById.has(String(p["id"] ?? ""))).map(pageName);
  const pagesRemoved = prevPages.filter((p) => !nextById.has(String(p["id"] ?? ""))).map(pageName);
  const pagesEdited = nextPages.filter((page) => {
    const before = prevById.get(String(page["id"] ?? ""));
    return before ? PAGE_FIELDS.some((f) => !same(before[f], page[f])) : false;
  }).length;

  const prevSections = indexSections(prevPages);
  const nextSections = indexSections(nextPages);
  const sectionsAdded: string[] = [];
  const sectionsRemoved: string[] = [];
  let sectionsEdited = 0;
  for (const [id, section] of nextSections) {
    const before = prevSections.get(id);
    if (!before) sectionsAdded.push(sectionLabel(section));
    else if (SECTION_FIELDS.some((f) => !same(before[f], section[f]))) sectionsEdited += 1;
  }
  for (const [id, section] of prevSections) if (!nextSections.has(id)) sectionsRemoved.push(sectionLabel(section));

  return {
    pagesAdded,
    pagesRemoved,
    sectionsAdded,
    sectionsRemoved,
    sectionsEdited,
    pagesEdited,
    // Colours come live from the business profile, so only the stored design
    // settings (fonts, layout, motion) and search settings are compared here.
    styleChanged: previous ? !same(previous.generation, next.generation) : false,
    seoChanged: previous ? !same(previous.seo, next.seo) : false,
  };
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const names = (list: string[]) => {
  const unique = [...new Set(list)];
  const shown = unique.slice(0, 3).join(", ");
  return unique.length > 3 ? `${shown} +${unique.length - 3} more` : shown;
};

/** One short plain-language line, e.g. "Added 2 sections (Gallery, Faq) · removed 1 section · edited 3 sections". */
export function summarizeChange(change: SnapshotChange | null): string {
  if (!change) return "First published version.";
  const parts: string[] = [];
  if (change.pagesAdded.length) parts.push(`added ${plural(change.pagesAdded.length, "page")} (${names(change.pagesAdded)})`);
  if (change.pagesRemoved.length) parts.push(`removed ${plural(change.pagesRemoved.length, "page")} (${names(change.pagesRemoved)})`);
  if (change.sectionsAdded.length) parts.push(`added ${plural(change.sectionsAdded.length, "section")} (${names(change.sectionsAdded)})`);
  if (change.sectionsRemoved.length) parts.push(`removed ${plural(change.sectionsRemoved.length, "section")} (${names(change.sectionsRemoved)})`);
  if (change.sectionsEdited) parts.push(`edited ${plural(change.sectionsEdited, "section")}`);
  if (change.pagesEdited) parts.push(`updated the settings of ${plural(change.pagesEdited, "page")}`);
  if (change.styleChanged) parts.push("changed the design style");
  if (change.seoChanged) parts.push("changed search settings");
  if (!parts.length) return "No visible changes.";
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1) + ".";
}

export type VersionVerification = "passed" | "failed" | null;

export type PublishedRow = {
  id: string;
  version: number;
  label: string | null;
  created_at: string;
  published_at: string | null;
  created_by: string | null;
  pages: unknown;
  generation?: unknown;
  seo?: unknown;
  /**
   * TODO(sf/post-publish-verify): Site Factory's item 25 will save a pass/fail
   * result per publish. Until that field exists this is always null/absent.
   * Wire the real column/lookup here once that PR merges; do not add it here.
   */
  verification_status?: string | null;
};

export type VersionEntry = {
  id: string;
  version: number;
  date: string;
  who: string;
  kind: "publish" | "restore";
  restoredFrom: number | null;
  summary: string;
  isLive: boolean;
  verification: VersionVerification;
};

/** The version number a restore entry came from, or null for a normal publish. */
export function restoredFromVersion(row: Pick<PublishedRow, "label" | "pages">): number | null {
  const body = row.pages && typeof row.pages === "object" ? (row.pages as Row) : {};
  const stored = Number(body["restored_from"]);
  if (Number.isFinite(stored) && stored >= 1) return Math.trunc(stored);
  // Older "Revert live site" entries only carry the number in their label.
  const match = /\((?:reverted to|restored from) v(\d+)\)/i.exec(row.label ?? "");
  return match ? Number(match[1]) : null;
}

const normalizeVerification = (value: unknown): VersionVerification =>
  value === "passed" || value === "failed" ? value : null;

/**
 * Builds the owner's version list, newest first. `rows` are published (live)
 * snapshots; each is compared with the one published just before it, so a
 * restore shows as its own entry that says what it put back.
 */
export function buildVersionList(
  rows: readonly PublishedRow[],
  whoById: ReadonlyMap<string, string> = new Map(),
): VersionEntry[] {
  const sorted = [...rows].sort((a, b) => b.version - a.version);
  return sorted.map((row, index) => {
    const previous = sorted[index + 1] ?? null;
    const restoredFrom = restoredFromVersion(row);
    const change = diffSnapshots(previous, row);
    const summary =
      restoredFrom !== null
        ? `Restored version ${restoredFrom}. ${summarizeChange(previous ? change : null)}`
        : summarizeChange(previous ? change : null);
    return {
      id: row.id,
      version: row.version,
      date: row.published_at ?? row.created_at,
      who: row.created_by ? (whoById.get(row.created_by) ?? "A team member") : "Revora",
      kind: restoredFrom !== null ? "restore" : "publish",
      restoredFrom,
      summary,
      isLive: index === 0,
      verification: normalizeVerification(row.verification_status),
    };
  });
}

/**
 * Versions rollback may safely pick. A failed live check is never offered;
 * versions with no result (null) stay allowed until Site Factory's
 * verification field exists (TODO sf/post-publish-verify). With `passedOnly`
 * a missing result is excluded too, for when every publish carries one.
 */
export function restorableVersions<T extends { verification: VersionVerification }>(
  entries: readonly T[],
  options: { passedOnly?: boolean } = {},
): T[] {
  return entries.filter((entry) =>
    options.passedOnly ? entry.verification === "passed" : entry.verification !== "failed",
  );
}

/**
 * Ids of old published snapshots to delete so at most `keep` remain. The
 * newest `keep` are always kept, and so are the two newest of any kind (the
 * live site and the last known-good one) — the last working site is never lost.
 */
export function prunableVersionIds(
  rows: readonly { id: string; version: number }[],
  keep: number = MAX_PUBLISHED_VERSIONS,
): string[] {
  const limit = Math.max(keep, 2);
  return [...rows]
    .sort((a, b) => b.version - a.version)
    .slice(limit)
    .map((row) => row.id);
}
