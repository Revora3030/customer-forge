/**
 * Owner-facing site versions: the version list and one-click restore.
 *
 * Every publish saves a production snapshot in `website_versions` (existing
 * table and RLS; no new table). `listSiteVersions` turns those into a short
 * list; `restoreSiteVersion` republishes one through `publishSiteNow`, the one
 * publish path, so the live renderer, payment gate, SEO pings and the live
 * check behave exactly as for a normal publish.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildVersionList,
  MAX_PUBLISHED_VERSIONS,
  type PublishedRow,
  type VersionEntry,
} from "@/lib/site-versions";

const UUID = /^[0-9a-f-]{36}$/i;

export const listSiteVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }): Promise<{ versions: VersionEntry[] }> => {
    // RLS: only members of this workspace can read its versions.
    const { data: rows, error } = await context.supabase
      .from("website_versions")
      .select("id, version, label, created_at, published_at, created_by, pages, generation, seo")
      .eq("organization_id", data.organizationId)
      .eq("pages->>live_format", "1")
      .not("published_at", "is", null)
      .order("version", { ascending: false })
      // One extra row so the oldest shown entry can be compared with its predecessor.
      .limit(MAX_PUBLISHED_VERSIONS + 1);
    if (error) throw new Error("Couldn't load your saved versions right now.");
    const published = (rows ?? []) as unknown as PublishedRow[];

    const who = new Map<string, string>();
    const ids = [...new Set(published.map((row) => row.created_by).filter((id): id is string => !!id))];
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      for (const person of (people ?? []) as { id: string; full_name: string | null }[]) {
        if (person.full_name) who.set(person.id, person.full_name);
      }
    }
    return { versions: buildVersionList(published, who).slice(0, MAX_PUBLISHED_VERSIONS) };
  });

/**
 * One-click "Restore this version": republishes a saved version to the live
 * site as a NEW version, so nothing is deleted and the restore can itself be
 * undone. The owner's draft is not changed.
 */
export const restoreSiteVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; versionId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    const versionId = String(input?.versionId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    if (!UUID.test(versionId)) throw new Error("Invalid version");
    return { organizationId, versionId };
  })
  .handler(async ({ data, context }) => {
    const { publishSiteNow } = await import("@/lib/production.functions");
    const result = await publishSiteNow(context.supabase as never, context.userId, data.organizationId, {
      restoreVersionId: data.versionId,
    });
    return { activated: result.activated, reason: result.reason, version: result.version };
  });
