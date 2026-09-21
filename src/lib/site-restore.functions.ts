import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildFullSnapshot,
  countSnapshot,
  planRestore,
  readFullSnapshot,
  snapshotsMatch,
  type FullSnapshot,
} from "@/lib/site-restore";

/**
 * Exact rollback for AI and manual website edits.
 *
 * `captureSiteState` is taken before a risky change; `restoreSiteState` puts the
 * website back exactly as it was, including components, variants and settings.
 * All reads and writes go through the caller's own session, so row level
 * security keeps one workspace out of another's website.
 */

const uuid = (value: unknown) => {
  const id = String(value ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid workspace");
  return id;
};

export type StateReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export type RestoreClient = {
  from: SupabaseClient["from"];
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Reads the whole editable website as an exact snapshot, through the caller's
 * own session so row level security still applies. Shared with draft branches.
 */
export async function readWebsiteState(
  supabase: StateReader,
  organizationId: string,
): Promise<FullSnapshot> {

  const [pages, sections, components] = await Promise.all([
    supabase
      .from("website_pages")
      .select(
        "id, slug, title, kind, seo_title, seo_description, seo_canonical, og_title, og_description, og_image_url, noindex, sort_order, is_visible",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("website_sections")
      .select(
        "id, page_id, kind, variant, heading, subheading, body, settings, sort_order, is_visible",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("website_components")
      .select(
        "id, section_id, kind, label, body, link_label, link_url, media_url, settings, sort_order, is_visible",
      )
      .eq("organization_id", organizationId),
  ]);
  for (const result of [pages, sections, components]) {
    if (result.error) throw new Error("Couldn't read your website right now.");
  }
  return buildFullSnapshot(
    (pages.data as Record<string, unknown>[]) ?? [],
    (sections.data as Record<string, unknown>[]) ?? [],
    (components.data as Record<string, unknown>[]) ?? [],
  );
}

export const captureSiteState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string; label?: string }) => ({
    organizationId: uuid(data?.organizationId),
    label: String(data?.label ?? "Before this change").slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as Parameters<typeof readState>[0];
    const snapshot = await readState(supabase, data.organizationId);
    return { snapshot, label: data.label, counts: countSnapshot(snapshot) };
  });

export const restoreSiteState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string; snapshot: unknown }) => {
    const snapshot = readFullSnapshot(data?.snapshot);
    if (!snapshot) throw new Error("That saved state can no longer be read.");
    return { organizationId: uuid(data?.organizationId), snapshot };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as {
      from: SupabaseClient["from"];
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const orgId = data.organizationId;
    const before = await readState(supabase as never as Parameters<typeof readState>[0], orgId);
    const plan = planRestore(before, data.snapshot);

    // One database transaction: the restore either lands completely or not at
    // all. A half-restored website is never possible, even if a single row
    // fails, because Postgres rolls the whole function back.
    const { error } = await supabase.rpc("restore_website_state", {
      _organization_id: orgId,
      _snapshot: data.snapshot as never,
    });
    if (error) {
      await supabase.from("audit_logs").insert({
        organization_id: orgId,
        action: "SITE_STATE_RESTORE_FAILED",
        entity_type: "website",
        entity_id: orgId,
        metadata: { reason: error.message.slice(0, 300) } as never,
      });
      throw new Error(
        error.message.includes("FORBIDDEN") || error.message.includes("row-level security")
          ? "You don't have permission to restore this website."
          : "The restore didn't run, so nothing was changed. Your website is exactly as it was.",
      );
    }

    // Verify the restore really landed instead of reporting success blindly.
    const after = await readState(supabase as never as Parameters<typeof readState>[0], orgId);
    const exact = snapshotsMatch(after, data.snapshot);

    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      action: exact ? "SITE_STATE_RESTORED" : "SITE_STATE_RESTORE_PARTIAL",
      entity_type: "website",
      entity_id: orgId,
      metadata: { ...countSnapshot(data.snapshot), exact } as never,
    });

    return {
      exact,
      summary: exact
        ? plan.summary
        : "Your website was put back, but a few items didn't match exactly. Check the pages before publishing.",
      counts: countSnapshot(after),
    };
  });
