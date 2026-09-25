/**
 * Scheduled tenant backups.
 *
 * Called by the platform scheduler with the cron bearer secret. Snapshots every
 * active workspace, keeps the most recent 14 snapshots each, and records any
 * failure in the error tracker instead of failing silently.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createBackup, pruneBackups } = await import("@/lib/backup.server");
  const { captureError } = await import("@/lib/monitoring.server");

  const { data: orgs, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .order("created_at");
  if (error) throw new Error(error.message);

  const results: { organizationId: string; ok: boolean; rows?: number; error?: string }[] = [];
  for (const org of orgs ?? []) {
    try {
      const backup = await createBackup(supabaseAdmin, org.id as string, { kind: "scheduled" });
      await pruneBackups(supabaseAdmin, org.id as string);
      results.push({
        organizationId: org.id as string,
        ok: true,
        rows: Number(backup.rowCounts["total_rows"] ?? 0),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await captureError({
        message: `Scheduled backup failed: ${message}`,
        source: "job",
        level: "error",
        route: "/api/public/jobs/backup",
        organizationId: org.id as string,
      });
      results.push({ organizationId: org.id as string, ok: false, error: message });
    }
  }

  // Retention: remove old build-progress, error and usage rows (never customer
  // content, leads, bookings, billing or analytics). Failure is recorded, not hidden.
  let pruned: unknown = null;
  const { data: prunedRows, error: pruneError } = await supabaseAdmin.rpc("prune_old_operational_records" as never);
  if (pruneError) {
    await captureError({ message: `Record clean-up failed: ${pruneError.message}`, source: "job", level: "error", route: "/api/public/jobs/backup" });
  } else pruned = prunedRows;

  return {
    pruned,
    backedUp: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}

async function handler({ request }: { request: Request }) {
  const unauthorized = await authenticateCronRequest(request);
  if (unauthorized) return unauthorized;
  try {
    const summary = await run();
    return Response.json({ ok: true, ...summary });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const { captureError } = await import("@/lib/monitoring.server");
    await captureError({
      message: `Backup job crashed: ${message}`,
      source: "job",
      level: "fatal",
      route: "/api/public/jobs/backup",
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/backup")({
  server: { handlers: { POST: handler, GET: handler } },
});
