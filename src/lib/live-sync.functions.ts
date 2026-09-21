/**
 * "Is every change actually on my site?" — server side.
 *
 * Reads the builder's own tree as the signed-in member (so RLS scopes it to
 * their workspace), then reads the very same rows back through the anonymous
 * visitor projection the published site uses. The two are compared by the pure
 * `compareLiveSync` grader, so the answer is evidence from the real visitor
 * path, never an assumption.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  compareLiveSync,
  type BuilderPage,
  type SyncResult,
  type VisitorPage,
} from "@/lib/builder/live-sync";

const inputSchema = z.object({ organizationId: z.string().uuid() });

export type LiveSyncResult = SyncResult & { checkedAt: string; slug: string | null };

export const checkLiveSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<LiveSyncResult> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;

    // Workspace members only — the check reads that workspace's content.
    const { data: membership } = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership?.role) throw new Error("You do not have access to this workspace.");

    const [pages, sections, components, settings] = await Promise.all([
      supabase
        .from("website_pages")
        .select("id, slug, title, is_visible, sort_order")
        .eq("organization_id", orgId)
        .order("sort_order"),
      supabase
        .from("website_sections")
        .select("id, page_id, kind, heading, is_visible, sort_order")
        .eq("organization_id", orgId)
        .order("sort_order"),
      supabase
        .from("website_components")
        .select("id, section_id, kind, label, is_visible, sort_order")
        .eq("organization_id", orgId)
        .order("sort_order"),
      supabase
        .from("website_settings")
        .select("publish_state")
        .eq("organization_id", orgId)
        .maybeSingle(),
    ]);

    const itemsBySection = new Map<string, { id: string; label: string; visible: boolean }[]>();
    for (const row of components.data ?? []) {
      const list = itemsBySection.get(row.section_id as string) ?? [];
      list.push({
        id: row.id as string,
        label: (row.label as string | null) || (row.kind as string),
        visible: row.is_visible !== false,
      });
      itemsBySection.set(row.section_id as string, list);
    }
    const sectionsByPage = new Map<string, BuilderPage["sections"]>();
    for (const row of sections.data ?? []) {
      const list = sectionsByPage.get(row.page_id as string) ?? [];
      list.push({
        id: row.id as string,
        label: (row.heading as string | null) || (row.kind as string),
        visible: row.is_visible !== false,
        items: itemsBySection.get(row.id as string) ?? [],
      });
      sectionsByPage.set(row.page_id as string, list);
    }
    const builderPages: BuilderPage[] = (pages.data ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      title: (row.title as string | null) || (row.slug as string),
      visible: row.is_visible !== false,
      sections: sectionsByPage.get(row.id as string) ?? [],
    }));

    const publishState = (settings.data?.publish_state as string | null) ?? "draft";

    // Now the visitor's own view of the same workspace.
    const { publicOrganization, loadSite } = await import("@/lib/public-site.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("slug")
      .eq("id", orgId)
      .maybeSingle();
    const slug = (org?.slug as string | null) ?? null;

    const visitorPages: VisitorPage[] = [];
    if (slug && publishState === "published") {
      const exists = await publicOrganization({ slug });
      if (exists) {
        for (const page of builderPages.filter((p) => p.visible)) {
          const site = await loadSite(slug, { pageSlug: page.slug });
          const content = site?.content ?? null;
          if (!content?.page) continue;
          visitorPages.push({
            slug: page.slug,
            sectionIds: content.sections.map((section) => section.id),
            itemIds: content.sections.flatMap((section) =>
              (section.components ?? []).map((component) => component.id),
            ),
          });
        }
      }
    }

    return {
      ...compareLiveSync({ publishState, builderPages, visitorPages }),
      checkedAt: new Date().toISOString(),
      slug,
    };
  });
