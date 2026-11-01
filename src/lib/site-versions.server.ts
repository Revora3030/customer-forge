import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_PUBLISHED_VERSIONS, prunableVersionIds } from "@/lib/site-versions";

/**
 * Deletes published snapshots beyond the newest MAX_PUBLISHED_VERSIONS for one
 * workspace. Only published (live) snapshots are pruned; draft restore points
 * are left alone. The newest two are always kept, so the live site and the
 * previous known-good one can never be pruned. Runs through the caller's own
 * session, so row level security applies.
 */
export async function pruneOldPublishedVersions(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("website_versions")
    .select("id, version")
    .eq("organization_id", organizationId)
    .eq("pages->>live_format", "1")
    .not("published_at", "is", null)
    .order("version", { ascending: false })
    .limit(MAX_PUBLISHED_VERSIONS + 50);
  if (error || !data) return 0;
  const ids = prunableVersionIds(data as { id: string; version: number }[]);
  if (!ids.length) return 0;
  const { error: deleteError } = await supabase.from("website_versions").delete().in("id", ids);
  return deleteError ? 0 : ids.length;
}
