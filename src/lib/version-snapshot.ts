import { supabase } from "@/integrations/supabase/client";
import type { FullSnapshot } from "@/lib/site-restore";

/**
 * The comparison summary every stored version carries (see VersionDiff),
 * derived from the full website snapshot so both always agree.
 */
export function versionContent(full: FullSnapshot) {
  return {
    content: {
      pages: full.pages.map((page) => ({
        id: page.id,
        slug: page.slug,
        title: page.title,
        kind: page.kind,
        seo_title: page.seo_title,
        seo_description: page.seo_description,
        sections: page.sections.map((section) => ({
          id: section.id,
          page_id: section.page_id,
          kind: section.kind,
          heading: section.heading,
          subheading: section.subheading,
          body: section.body,
          sort_order: section.sort_order,
          is_visible: section.is_visible,
        })),
      })),
    },
  };
}

/**
 * Inserts a version on the next free number. Two people saving at the same
 * moment collide on the (workspace, version) unique key, so a collision moves
 * on to the next number instead of failing the save.
 */
export async function insertVersionSnapshot(
  organizationId: string,
  latestVersion: number,
  fields: { label: string; generation: unknown; seo: unknown; pages: unknown },
) {
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  let version = latestVersion;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    version += 1;
    const { data, error } = await supabase
      .from("website_versions")
      .insert({
        organization_id: organizationId,
        version,
        label: fields.label,
        generation: (fields.generation ?? {}) as never,
        seo: (fields.seo ?? {}) as never,
        pages: fields.pages as never,
        published_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id, version")
      .maybeSingle();
    if (data) return { data: data as { id: string; version: number }, error: null };
    lastError = error;
    if ((error as { code?: string } | null)?.code !== "23505") break;
  }
  return { data: null, error: lastError };
}
