/**
 * Tenant backup + restore engine.
 *
 * A backup is a complete, self-contained snapshot of one workspace's own rows.
 * It never contains platform data, other tenants' rows, credentials, Stripe
 * secrets or auth records — only the business data a client would lose if
 * something went wrong: their profile, services, website, CRM and history.
 *
 * Restores are deliberately conservative:
 *  - a safety snapshot of the CURRENT state is taken first (kind = pre_restore),
 *  - the website tree is restored through the existing atomic RPC,
 *  - CRM tables are upserted by primary key and rows that are not in the
 *    snapshot are removed, so the workspace ends up exactly as it was.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tables captured verbatim, in dependency order (parents before children). */
export const BACKUP_TABLES = [
  "business_profiles",
  "website_settings",
  "services",
  "quote_forms",
  "quote_questions",
  "quote_options",
  "quote_addons",
  "customers",
  "leads",
  "appointments",
  "quote_requests",
  "lead_activities",
  "reviews",
  "automations",
  "automation_steps",
  "campaigns",
  "social_profiles",
  "media",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Website tree is snapshotted in the shape restore_website_state expects. */
export type WebsiteSnapshot = {
  format: "1";
  pages: unknown[];
};

export type TenantSnapshot = {
  format: 1;
  organization_id: string;
  taken_at: string;
  tables: Record<string, Record<string, unknown>[]>;
  website: WebsiteSnapshot;
};

type Admin = SupabaseClient;

const PAGE_SIZE = 1000;

async function readAll(
  admin: Admin,
  table: string,
  organizationId: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Rebuilds the nested page → section → component tree for the restore RPC. */
async function readWebsite(admin: Admin, organizationId: string): Promise<WebsiteSnapshot> {
  const [pages, sections, components] = await Promise.all([
    readAll(admin, "website_pages", organizationId),
    readAll(admin, "website_sections", organizationId),
    readAll(admin, "website_components", organizationId),
  ]);
  return {
    format: "1",
    pages: pages.map((page) => ({
      ...page,
      sections: sections
        .filter((section) => section["page_id"] === page["id"])
        .map((section) => ({
          ...section,
          components: components.filter((component) => component["section_id"] === section["id"]),
        })),
    })),
  };
}

export async function buildSnapshot(admin: Admin, organizationId: string): Promise<TenantSnapshot> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await readAll(admin, table, organizationId);
  }
  return {
    format: 1,
    organization_id: organizationId,
    taken_at: new Date().toISOString(),
    tables,
    website: await readWebsite(admin, organizationId),
  };
}

export type BackupSummary = {
  id: string;
  organizationId: string;
  kind: string;
  label: string | null;
  rowCounts: Record<string, number>;
  sizeBytes: number;
  createdAt: string;
  restoredAt: string | null;
};

/** Snapshots one workspace and stores it. Returns the stored row summary. */
export async function createBackup(
  admin: Admin,
  organizationId: string,
  options: {
    kind?: "scheduled" | "manual" | "pre_restore";
    label?: string | undefined;
    userId?: string | undefined;
  } = {},
): Promise<BackupSummary> {
  const snapshot = await buildSnapshot(admin, organizationId);
  const rowCounts: Record<string, number> = {};
  let rows = 0;
  for (const [table, list] of Object.entries(snapshot.tables)) {
    rowCounts[table] = list.length;
    rows += list.length;
  }
  rowCounts["website_pages"] = snapshot.website.pages.length;
  const serialized = JSON.stringify(snapshot);

  const { data, error } = await admin
    .from("data_backups")
    .insert({
      organization_id: organizationId,
      kind: options.kind ?? "manual",
      label: options.label ?? null,
      snapshot: snapshot as never,
      row_counts: { ...rowCounts, total_rows: rows } as never,
      size_bytes: serialized.length,
      created_by: options.userId ?? null,
    })
    .select("id, organization_id, kind, label, row_counts, size_bytes, created_at, restored_at")
    .single();
  if (error) throw new Error(`Couldn't save the backup: ${error.message}`);

  return {
    id: data.id as string,
    organizationId: data.organization_id as string,
    kind: data.kind as string,
    label: (data.label as string | null) ?? null,
    rowCounts: (data.row_counts ?? {}) as Record<string, number>,
    sizeBytes: Number(data.size_bytes ?? 0),
    createdAt: data.created_at as string,
    restoredAt: (data.restored_at as string | null) ?? null,
  };
}

/** Keeps the newest `keep` backups per workspace; older scheduled ones go. */
export async function pruneBackups(admin: Admin, organizationId: string, keep = 14) {
  const { data, error } = await admin
    .from("data_backups")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(keep, keep + 200);
  if (error || !data?.length) return 0;
  const ids = data.map((row) => row.id as string);
  await admin.from("data_backups").delete().in("id", ids);
  return ids.length;
}

export type RestoreResult = {
  backupId: string;
  safetyBackupId: string;
  tables: Record<string, number>;
  website: { pages: number; sections: number; components: number };
};

/**
 * Restores a snapshot into its own workspace. The backup's organization_id is
 * the only tenant ever written to, so a mismatched id can never leak rows
 * across tenants.
 */
/** Writes a tenant snapshot over the live workspace. Throws on the first failure. */
async function applyTenantSnapshot(
  admin: Admin,
  organizationId: string,
  snapshot: TenantSnapshot,
  tables: Record<string, number>,
): Promise<unknown> {
  const { data: siteResult, error: siteError } = await admin.rpc("restore_website_state", {
    _organization_id: organizationId,
    _snapshot: snapshot.website as never,
  });
  if (siteError) throw new Error(`Website restore failed: ${siteError.message}`);

  const keptIds: Record<string, Set<string>> = {};

  // Parents before children so foreign keys always resolve.
  for (const table of BACKUP_TABLES) {
    const rows = (snapshot.tables[table] ?? []).map((row) => ({
      ...row,
      organization_id: organizationId,
    }));
    if (rows.length) {
      const { error: upsertError } = await admin
        .from(table)
        .upsert(rows as never[], { onConflict: "id" });
      if (upsertError) throw new Error(`Restore failed on ${table}: ${upsertError.message}`);
    }
    keptIds[table] = new Set(rows.map((row) => String((row as Record<string, unknown>)["id"])));
    tables[table] = rows.length;
  }

  // Removals run children first, for the same foreign-key reason.
  for (const table of [...BACKUP_TABLES].reverse()) {
    const { data: existing, error: readError } = await admin
      .from(table)
      .select("id")
      .eq("organization_id", organizationId)
      .returns<{ id: string }[]>();
    if (readError) throw new Error(`Restore cleanup failed on ${table}: ${readError.message}`);
    const stale = (existing ?? [])
      .map((row) => String(row.id))
      .filter((id) => !keptIds[table]?.has(id));
    if (!stale.length) continue;
    const { error: deleteError } = await admin.from(table).delete().in("id", stale);
    if (deleteError) throw new Error(`Restore cleanup failed on ${table}: ${deleteError.message}`);
  }

  return siteResult;
}

export async function restoreBackup(
  admin: Admin,
  backupId: string,
  options: { userId?: string | undefined; rollingBack?: boolean } = {},
): Promise<RestoreResult> {
  const { data: backup, error } = await admin
    .from("data_backups")
    .select("id, organization_id, snapshot")
    .eq("id", backupId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read that backup: ${error.message}`);
  if (!backup) throw new Error("That backup no longer exists.");

  const organizationId = backup.organization_id as string;
  const snapshot = backup.snapshot as TenantSnapshot;
  if (!snapshot || snapshot.format !== 1 || snapshot.organization_id !== organizationId) {
    throw new Error("That backup is not in a restorable format.");
  }

  // Safety net: capture where the workspace stands right now, so a restore can
  // itself be undone.
  const safety = options.rollingBack
    ? { id: backupId }
    : await createBackup(admin, organizationId, {
        kind: "pre_restore",
        label: `Before restoring ${new Date(snapshot.taken_at).toISOString()}`,
        userId: options.userId,
      });

  let siteResult: unknown = null;
  const tables: Record<string, number> = {};
  try {
    siteResult = await applyTenantSnapshot(admin, organizationId, snapshot, tables);
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : String(failure);
    if (options.rollingBack) throw failure;
    try {
      await restoreBackup(admin, safety.id, { ...options, rollingBack: true });
    } catch (rollbackFailure) {
      throw new Error(
        `${reason} Putting the workspace back also failed (${rollbackFailure instanceof Error ? rollbackFailure.message : "unknown error"}); restore backup ${safety.id} to recover.`,
      );
    }
    throw new Error(`${reason} Nothing was changed — the workspace was put back as it was.`);
  }

  await admin
    .from("data_backups")
    .update({ restored_at: new Date().toISOString() })
    .eq("id", backupId);

  const site = (siteResult ?? {}) as { pages?: number; sections?: number; components?: number };
  return {
    backupId,
    safetyBackupId: safety.id,
    tables,
    website: {
      pages: Number(site.pages ?? 0),
      sections: Number(site.sections ?? 0),
      components: Number(site.components ?? 0),
    },
  };
}
