/**
 * Orphaned media clean-up — pure decision logic (unit tested).
 *
 * A storage object in a workspace folder is deletable ONLY when:
 *  - it is older than the grace period (default 14 days), so an upload whose
 *    database row is still being written is never touched;
 *  - its path appears NOWHERE in that workspace's data: media library rows,
 *    section/element rows, business profile, image records, settings, and
 *    every saved version and backup (so any restore keeps working).
 *
 * References are found by scanning serialized rows for the object path, which
 * also catches paths embedded inside JSON (layouts, snapshots) and inside
 * signed URLs. When in doubt, a file is kept.
 */

export const DEFAULT_GRACE_DAYS = 14;

export type StoredObject = { path: string; createdAt: string | null; size?: number | null };

/** True when `path` is a file directly inside this workspace's own folder. */
export function inWorkspaceFolder(path: string, organizationId: string): boolean {
  return path.startsWith(`${organizationId}/`) && !path.includes("..") && path.length > organizationId.length + 1;
}

/** Collects every string in any nested JSON value into one searchable text. */
export function referenceText(values: readonly unknown[]): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 40 || value == null) return;
    if (typeof value === "string") {
      parts.push(value);
      // Paths inside URLs are often percent-encoded.
      if (value.includes("%")) {
        try {
          parts.push(decodeURIComponent(value));
        } catch {
          /* not encoded */
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) walk(item, depth + 1);
  };
  for (const value of values) walk(value, 0);
  return parts.join("\n");
}

export function orphanedObjects(
  objects: readonly StoredObject[],
  organizationId: string,
  references: string,
  options: { now?: number | undefined; graceDays?: number | undefined } = {},
): StoredObject[] {
  const now = options.now ?? Date.now();
  const graceMs = (options.graceDays ?? DEFAULT_GRACE_DAYS) * 86_400_000;
  return objects.filter((object) => {
    if (!inWorkspaceFolder(object.path, organizationId)) return false;
    const created = object.createdAt ? Date.parse(object.createdAt) : NaN;
    // Unknown age: keep.
    if (!Number.isFinite(created) || now - created < graceMs) return false;
    const name = object.path.slice(organizationId.length + 1);
    // Referenced by full path or by its unique file name: keep.
    return !references.includes(object.path) && !references.includes(name);
  });
}
