/**
 * Backup + restore server functions.
 *
 * Access rules, enforced server-side on every call:
 *  - a workspace owner/admin may back up and restore THEIR OWN workspace,
 *  - a platform super admin may do it for any workspace,
 *  - nobody can read or restore a workspace they don't belong to.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = (value: unknown, label = "workspace") => {
  const id = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
};

/** True when the caller owns/administers the workspace, or runs the platform. */
async function assertBackupAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
) {
  const [{ data: membership }, { data: role }] = await Promise.all([
    supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle(),
  ]);
  const isSuperAdmin = Boolean(role);
  const canManage = membership?.role === "owner" || membership?.role === "admin";
  if (!isSuperAdmin && !canManage) throw new Error("Forbidden");
  return { isSuperAdmin };
}

export type BackupRow = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  kind: string;
  label: string | null;
  totalRows: number;
  sizeBytes: number;
  createdAt: string;
  restoredAt: string | null;
};

/** Backup history for one workspace, newest first. */
export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: uuid(input?.organizationId),
  }))
  .handler(async ({ data, context }): Promise<BackupRow[]> => {
    await assertBackupAccess(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("data_backups")
      .select(
        "id, organization_id, kind, label, row_counts, size_bytes, created_at, restored_at, organizations(name)",
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error("Couldn't load your backups.");
    return (rows ?? []).map((row) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      organizationName:
        ((row as { organizations?: { name?: string } }).organizations?.name as string) ?? null,
      kind: row.kind as string,
      label: (row.label as string | null) ?? null,
      totalRows: Number((row.row_counts as Record<string, number>)?.["total_rows"] ?? 0),
      sizeBytes: Number(row.size_bytes ?? 0),
      createdAt: row.created_at as string,
      restoredAt: (row.restored_at as string | null) ?? null,
    }));
  });

/** Takes a snapshot right now. */
export const runBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; label?: string }) => ({
    organizationId: uuid(input?.organizationId),
    label: (String(input?.label ?? "").slice(0, 120) || undefined) as string | undefined,
  }))
  .handler(async ({ data, context }) => {
    await assertBackupAccess(context.supabase, context.userId, data.organizationId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createBackup, pruneBackups } = await import("@/lib/backup.server");
    const backup = await createBackup(supabaseAdmin, data.organizationId, {
      kind: "manual",
      label: data.label,
      userId: context.userId,
    });
    await pruneBackups(supabaseAdmin, data.organizationId);
    return backup;
  });

/** Restores a snapshot after taking an automatic safety snapshot first. */
export const restoreFromBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { backupId: string; confirm: string }) => {
    if (
      String(input?.confirm ?? "")
        .trim()
        .toUpperCase() !== "RESTORE"
    ) {
      throw new Error("Type RESTORE to confirm.");
    }
    return { backupId: uuid(input?.backupId, "backup") };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: backup, error } = await supabaseAdmin
      .from("data_backups")
      .select("organization_id")
      .eq("id", data.backupId)
      .maybeSingle();
    if (error || !backup) throw new Error("That backup no longer exists.");
    await assertBackupAccess(context.supabase, context.userId, backup.organization_id as string);
    const { restoreBackup } = await import("@/lib/backup.server");
    return restoreBackup(supabaseAdmin, data.backupId, { userId: context.userId });
  });

export type AdminBackupOverview = {
  organizations: { id: string; name: string; lastBackupAt: string | null; backups: number }[];
};

/** Platform-wide backup coverage, for the admin screen. */
export const getBackupOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBackupOverview> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [orgs, backups] = await Promise.all([
      supabaseAdmin.from("organizations").select("id, name").order("name"),
      supabaseAdmin
        .from("data_backups")
        .select("organization_id, created_at")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    const rows = backups.data ?? [];
    return {
      organizations: (orgs.data ?? []).map((org) => {
        const mine = rows.filter((row) => row.organization_id === org.id);
        return {
          id: org.id as string,
          name: (org.name as string) ?? "Client",
          lastBackupAt: (mine[0]?.created_at as string) ?? null,
          backups: mine.length,
        };
      }),
    };
  });
