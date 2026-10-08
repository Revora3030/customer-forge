/**
 * Scheduled clean-up of orphaned media files (uploads and generated pictures
 * left behind by cancelled or rolled-back generations).
 *
 * Safety rails:
 *  - service role, but strictly one workspace folder at a time;
 *  - every reference source is read in full first; if ANY read fails the
 *    workspace is skipped (never delete on partial knowledge);
 *  - only files older than the grace period that no row, layout, version or
 *    backup mentions are removed (see media-cleanup.ts);
 *  - capped per run; dry-run by default unless `apply` is set.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_BUCKET } from "@/lib/media";
import { orphanedObjects, referenceText, type StoredObject } from "@/lib/media-cleanup";

type Admin = SupabaseClient;

const SOURCES: { table: string; columns: string }[] = [
  { table: "media", columns: "url, file_name" },
  { table: "website_sections", columns: "settings, body" },
  { table: "website_components", columns: "media_url, settings, body" },
  { table: "website_pages", columns: "og_image_url" },
  { table: "website_settings", columns: "generation, seo, pages" },
  { table: "business_profiles", columns: "*" },
  { table: "image_records", columns: "*" },
  { table: "website_versions", columns: "pages, generation, seo" },
  { table: "data_backups", columns: "snapshot" },
  // Service cards carry their own picture, draft branches keep a full copy of
  // the site, and chat plans name the photos the owner attached.
  { table: "services", columns: "image_url" },
  { table: "website_branches", columns: "base_snapshot" },
  { table: "builder_messages", columns: "content, plan" },
];

async function listFolder(admin: Admin, organizationId: string): Promise<StoredObject[] | null> {
  const out: StoredObject[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await admin.storage.from(MEDIA_BUCKET).list(organizationId, { limit: 1000, offset });
    if (error) return null;
    for (const item of data ?? []) {
      // Folders have no id; only files are candidates.
      if (!item.id) continue;
      out.push({ path: `${organizationId}/${item.name}`, createdAt: item.created_at ?? null, size: Number(item.metadata?.["size"] ?? 0) || null });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function referencesFor(admin: Admin, organizationId: string): Promise<string | null> {
  const values: unknown[] = [];
  for (const source of SOURCES) {
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await admin
        .from(source.table)
        .select(source.columns)
        .eq("organization_id", organizationId)
        .range(from, from + 999);
      // A missing optional table (not migrated yet) is not a reference
      // source; any other error means we don't know enough to delete.
      if (error) {
        if ((error as { code?: string }).code === "42P01") break;
        return null;
      }
      values.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  return referenceText(values);
}

export async function cleanOrphanedMedia(
  admin: Admin,
  options: { apply?: boolean; maxWorkspaces?: number; maxDeletes?: number; graceDays?: number } = {},
) {
  const maxDeletes = options.maxDeletes ?? 500;
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(options.maxWorkspaces ?? 200);
  if (error) throw new Error("Couldn't list workspaces");

  let deleted = 0;
  let candidates = 0;
  let bytes = 0;
  const skipped: string[] = [];
  for (const org of orgs ?? []) {
    if (deleted >= maxDeletes) break;
    const organizationId = String(org.id);
    const objects = await listFolder(admin, organizationId);
    if (!objects || objects.length === 0) continue;
    const references = await referencesFor(admin, organizationId);
    if (references === null) {
      skipped.push(organizationId);
      continue;
    }
    const orphans = orphanedObjects(objects, organizationId, references, options.graceDays !== undefined ? { graceDays: options.graceDays } : {}).slice(0, maxDeletes - deleted);
    candidates += orphans.length;
    bytes += orphans.reduce((sum, item) => sum + (item.size ?? 0), 0);
    if (!options.apply || orphans.length === 0) continue;
    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100).map((item) => item.path);
      const { error: removeError } = await admin.storage.from(MEDIA_BUCKET).remove(batch);
      if (removeError) {
        skipped.push(organizationId);
        break;
      }
      deleted += batch.length;
    }
  }
  return { apply: options.apply === true, candidates, deleted, bytes, skippedWorkspaces: skipped.length };
}
