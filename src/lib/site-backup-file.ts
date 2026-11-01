/** File name for a downloaded site export, e.g. "acme-site-backup-2026-11-01.json". */
export function siteBackupFileName(slug: string | null | undefined, takenAt: string): string {
  const safe =
    String(slug ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "site";
  const day = /^\d{4}-\d{2}-\d{2}/.exec(takenAt)?.[0] ?? "backup";
  return `${safe}-site-backup-${day}.json`;
}
