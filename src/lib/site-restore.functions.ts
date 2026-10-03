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

  // Paged: snapshots and restore points must hold every row, not the first 1,000.
  const { readAll } = await import("@/lib/db/read-all");
  const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [pages, sections, components] = await Promise.all([
    readAll(() =>
      db
        .from("website_pages")
        .select(
          "id, slug, title, kind, seo_title, seo_description, seo_canonical, og_title, og_description, og_image_url, noindex, sort_order, is_visible",
        )
        .eq("organization_id", organizationId)
        .order("id"),
    ),
    readAll(() =>
      db
        .from("website_sections")
        .select(
          "id, page_id, kind, variant, heading, subheading, body, settings, sort_order, is_visible",
        )
        .eq("organization_id", organizationId)
        .order("id"),
    ),
    readAll(() =>
      db
        .from("website_components")
        .select(
          "id, section_id, kind, label, body, link_label, link_url, media_url, settings, sort_order, is_visible",
        )
        .eq("organization_id", organizationId)
        .order("id"),
    ),
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
  .validator((data: { organizationId: string; label?: string }) => ({
    organizationId: uuid(data?.organizationId),
    label: String(data?.label ?? "Before this change").slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as StateReader;
    const snapshot = await readWebsiteState(supabase, data.organizationId);
    return { snapshot, label: data.label, counts: countSnapshot(snapshot) };
  });

/**
 * Puts the website back to an exact snapshot, in one database transaction, and
 * verifies the result instead of reporting success blindly. Shared by restore
 * points and by throwing a draft branch away.
 */
export async function applyWebsiteRestore(
  supabase: RestoreClient,
  orgId: string,
  snapshot: FullSnapshot,
) {
  const before = await readWebsiteState(supabase as never as StateReader, orgId);
  const plan = planRestore(before, snapshot);

  // One database transaction: the restore either lands completely or not at
  // all. A half-restored website is never possible, even if a single row
  // fails, because Postgres rolls the whole function back.
  const { error } = await supabase.rpc("restore_website_state", {
    _organization_id: orgId,
    _snapshot: snapshot as never,
  });
  if (error) {
    await supabase.from("audit_logs").insert({
      organization_id: orgId,
      action: "SITE_STATE_RESTORE_FAILED",
      entity: "website",
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
  const after = await readWebsiteState(supabase as never as StateReader, orgId);
  const exact = snapshotsMatch(after, snapshot);

  await supabase.from("audit_logs").insert({
    organization_id: orgId,
    action: exact ? "SITE_STATE_RESTORED" : "SITE_STATE_RESTORE_PARTIAL",
    entity: "website",
    entity_id: orgId,
    metadata: { ...countSnapshot(snapshot), exact } as never,
  });

  return {
    exact,
    summary: exact
      ? plan.summary
      : "Your website was put back, but a few items didn't match exactly. Check the pages before publishing.",
    counts: countSnapshot(after),
  };
}

export const restoreSiteState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { organizationId: string; snapshot: unknown }) => {
    const snapshot = readFullSnapshot(data?.snapshot);
    if (!snapshot) throw new Error("That saved state can no longer be read.");
    return { organizationId: uuid(data?.organizationId), snapshot };
  })
  .handler(({ data, context }) =>
    applyWebsiteRestore(
      context.supabase as never as RestoreClient,
      data.organizationId,
      data.snapshot,
    ),
  );


type VersionRow = {
  id: string;
  version: number;
  generation: unknown;
  seo: unknown;
  pages: unknown;
};

const filledObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;

/**
 * Works out what a stored version can put back. Versions are written by
 * several features with different shapes: launches and saved versions carry
 * site settings plus the page tree, assistant restore points carry only the
 * page tree, and very old versions stored the settings page map directly.
 */
export function planVersionRestore(row: Pick<VersionRow, "generation" | "seo" | "pages">) {
  const stored = row.pages && typeof row.pages === "object" ? (row.pages as Record<string, unknown>) : null;
  const full = readFullSnapshot(stored) ?? readFullSnapshot(stored?.["full"]);
  const settings: Record<string, unknown> = {};
  // Only fields the version really holds are written back: a version without
  // them must never blank out the site's design or search settings.
  if (filledObject(row.generation)) settings["generation"] = row.generation;
  if (filledObject(row.seo)) settings["seo"] = row.seo;
  if (stored && "settings_pages" in stored) {
    if (stored["settings_pages"] != null) settings["pages"] = stored["settings_pages"];
  } else if (
    stored &&
    !full &&
    !("content" in stored) &&
    !("format" in stored) &&
    !Array.isArray(stored["pages"])
  ) {
    settings["pages"] = stored;
  }
  return { full, settings };
}

/**
 * Restores one saved version into the draft: the pages, sections and elements
 * (in one transaction, verified) and the site settings the version holds.
 */
export const restoreWebsiteVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { organizationId: string; versionId: string }) => ({
    organizationId: uuid(data?.organizationId),
    versionId: uuid(data?.versionId),
  }))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never as RestoreClient;
    const { data: row, error } = await supabase
      .from("website_versions")
      .select("id, version, generation, seo, pages")
      .eq("id", data.versionId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error("Couldn't read that version right now.");
    if (!row) throw new Error("That version is no longer available.");
    const version = row as VersionRow;
    const plan = planVersionRestore(version);
    if (!plan.full && !Object.keys(plan.settings).length) {
      throw new Error("That version doesn't hold anything that can be put back.");
    }

    let exact: boolean | null = null;
    if (plan.full) {
      const result = await applyWebsiteRestore(supabase, data.organizationId, plan.full);
      exact = result.exact;
    }

    if (Object.keys(plan.settings).length) {
      const { nextPublishState } = await import("@/lib/publish-state");
      const keepState = await nextPublishState(supabase, data.organizationId);
      const { error: writeError } = await supabase
        .from("website_settings")
        .update({
          ...plan.settings,
          review_state: "ready_for_review",
          publish_state: keepState,
        } as never)
        .eq("organization_id", data.organizationId);
      if (writeError) throw new Error("The pages were put back, but the site settings couldn't be.");
    }

    return {
      version: Number(version.version),
      pagesRestored: Boolean(plan.full),
      settingsRestored: Object.keys(plan.settings).length > 0,
      exact,
    };
  });
