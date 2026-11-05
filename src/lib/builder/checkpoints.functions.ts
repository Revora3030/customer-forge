/**
 * Builder chat checkpoints (CU-5): the server side.
 *
 * Checkpoints are the published versions `publishSiteNow` already saves in
 * `website_versions` (no new table, no migration). Every function here checks
 * on the server that the caller is an owner or admin of the workspace; the
 * chat hides the controls from everyone else, but that is only presentation.
 * A restore goes through `publishSiteNow`, the one publish path.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildVersionList, MAX_PUBLISHED_VERSIONS, type PublishedRow } from "@/lib/site-versions";
import {
  applyCheckpointMeta,
  CHECKPOINT_MIN_ROLE,
  cleanCheckpointName,
  MAX_PINNED_CHECKPOINTS,
  readCheckpointMeta,
  snapshotOutline,
  toCheckpoints,
  type Checkpoint,
  type SnapshotOutline,
} from "@/lib/builder/checkpoints";

const UUID = /^[0-9a-f-]{36}$/i;
const SELECT = "id, version, label, created_at, published_at, created_by, pages, generation, seo";

const orgInput = (input: { organizationId?: unknown } | undefined) => {
  const organizationId = String(input?.organizationId ?? "");
  if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
  return organizationId;
};
const versionInput = (input: { versionId?: unknown } | undefined) => {
  const versionId = String(input?.versionId ?? "");
  if (!UUID.test(versionId)) throw new Error("Invalid checkpoint");
  return versionId;
};

type Db = {
  from: (table: string) => {
    select: (columns: string) => Query;
    update: (row: Record<string, unknown>) => Query;
  };
};
type Query = {
  eq: (column: string, value: unknown) => Query;
  not: (column: string, operator: string, value: unknown) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (count: number) => Query;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

const published = (db: Db, organizationId: string, columns = SELECT) =>
  db
    .from("website_versions")
    .select(columns)
    .eq("organization_id", organizationId)
    .eq("pages->>live_format", "1")
    .not("published_at", "is", null);

/** One published snapshot of this workspace, or null. */
async function readCheckpointRow(db: Db, organizationId: string, versionId: string) {
  const { data } = await published(db, organizationId, "id, version, pages, published_at").eq("id", versionId).maybeSingle();
  return data;
}

export type CheckpointList = { allowed: boolean; checkpoints: Checkpoint[] };

/**
 * The chat's checkpoint timeline, newest first: the last 20 published
 * versions plus any older pinned ones. Non-owners get `allowed: false` and an
 * empty list (not an error), so the chat simply shows nothing.
 */
export const listCheckpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: orgInput(input) }))
  .handler(async ({ data, context }): Promise<CheckpointList> => {
    // Owners and admins only, checked on the server. Anyone else gets an empty
    // list (not an error), so the chat shows nothing for them.
    const { orgRole, roleAtLeast } = await import("@/lib/org-authz.server");
    const role = await orgRole(context.supabase as never, data.organizationId, String(context.userId)).catch(() => null);
    if (!roleAtLeast(role, CHECKPOINT_MIN_ROLE)) return { allowed: false, checkpoints: [] };
    const db = context.supabase as unknown as Db;
    const [recent, pinned] = await Promise.all([
      published(db, data.organizationId)
        .order("version", { ascending: false })
        // One extra so the oldest shown entry can be compared with its predecessor.
        .limit(MAX_PUBLISHED_VERSIONS + 1),
      published(db, data.organizationId)
        .eq("pages->>checkpoint_pinned", "true")
        .order("version", { ascending: false })
        .limit(MAX_PINNED_CHECKPOINTS + 5),
    ]);
    if (recent.error) throw new Error("Couldn't load your checkpoints right now.");
    const recentRows = (recent.data ?? []) as PublishedRow[];
    const shown = new Set(recentRows.slice(0, MAX_PUBLISHED_VERSIONS).map((row) => row.id));
    const rows = new Map<string, PublishedRow>();
    for (const row of [...recentRows, ...((pinned.data ?? []) as PublishedRow[])]) rows.set(row.id, row);

    const who = new Map<string, string>();
    const ids = [...new Set([...rows.values()].map((row) => row.created_by).filter((id): id is string => !!id))];
    if (ids.length) {
      // Membership was verified above; author names come from profiles.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: people } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
      for (const person of (people ?? []) as { id: string; full_name: string | null }[])
        if (person.full_name) who.set(person.id, person.full_name);
    }
    const entries = buildVersionList([...rows.values()], who);
    const pagesById = new Map([...rows.values()].map((row) => [row.id, row.pages]));
    const checkpoints = toCheckpoints(entries, pagesById).filter((entry) => shown.has(entry.id) || entry.pinned);
    return { allowed: true, checkpoints };
  });

/** Names, renames, pins or unpins one checkpoint. Owners and admins only. */
export const updateCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; versionId: string; name?: string | null; pinned?: boolean }) => {
    const out: { organizationId: string; versionId: string; name?: string | null; pinned?: boolean } = {
      organizationId: orgInput(input),
      versionId: versionInput(input),
    };
    if (input && "name" in input && input.name !== undefined) out.name = cleanCheckpointName(input.name);
    if (input && typeof input.pinned === "boolean") out.pinned = input.pinned;
    if (out.name === undefined && out.pinned === undefined) throw new Error("Nothing to change");
    return out;
  })
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, String(context.userId), CHECKPOINT_MIN_ROLE);
    const db = context.supabase as unknown as Db;
    const row = await readCheckpointRow(db, data.organizationId, data.versionId);
    if (!row) throw new Error("That checkpoint isn't a saved copy of your published site.");
    const current = readCheckpointMeta(row["pages"]);
    if (data.pinned && !current.pinned) {
      const { data: pins } = await published(db, data.organizationId, "id")
        .eq("pages->>checkpoint_pinned", "true")
        .limit(MAX_PINNED_CHECKPOINTS + 1);
      if (((pins as unknown[] | null) ?? []).length >= MAX_PINNED_CHECKPOINTS)
        throw new Error(`You can pin up to ${MAX_PINNED_CHECKPOINTS} checkpoints. Unpin one first.`);
    }
    const pages = applyCheckpointMeta(row["pages"], { name: data.name, pinned: data.pinned });
    const { error } = await db
      .from("website_versions")
      .update({ pages })
      .eq("id", data.versionId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error("Couldn't save that checkpoint right now.");
    return readCheckpointMeta(pages);
  });

/**
 * One-click restore of a checkpoint: republishes it through `publishSiteNow`
 * (the one publish path) as a new version, so the restore can be undone too.
 * The owner's draft is not changed.
 */
export const restoreCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; versionId: string }) => ({
    organizationId: orgInput(input),
    versionId: versionInput(input),
  }))
  .handler(async ({ data, context }) => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, String(context.userId), CHECKPOINT_MIN_ROLE);
    const { publishSiteNow } = await import("@/lib/production.functions");
    const result = await publishSiteNow(context.supabase as never, context.userId, data.organizationId, {
      restoreVersionId: data.versionId,
    });
    return { activated: result.activated, reason: result.reason, version: result.version };
  });

export type CheckpointCompare = { before: SnapshotOutline; after: SnapshotOutline; liveVersion: number | null };

/** Text outlines of a checkpoint (before) and the live site now (after), for the compare slider. */
export const compareCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; versionId: string }) => ({
    organizationId: orgInput(input),
    versionId: versionInput(input),
  }))
  .handler(async ({ data, context }): Promise<CheckpointCompare> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase as never, data.organizationId, String(context.userId), CHECKPOINT_MIN_ROLE);
    const db = context.supabase as unknown as Db;
    const [row, live] = await Promise.all([
      readCheckpointRow(db, data.organizationId, data.versionId),
      published(db, data.organizationId, "id, version, pages").order("version", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!row) throw new Error("That checkpoint isn't a saved copy of your published site.");
    return {
      before: snapshotOutline(row["pages"]),
      after: snapshotOutline(live.data?.["pages"]),
      liveVersion: live.data ? Number(live.data["version"]) : null,
    };
  });
