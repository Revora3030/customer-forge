import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * /admin view of the lead-delivery watchdog. Super-admin only. Returns counts,
 * workspace names, problems and ages: never a lead's name, email or phone.
 */
export const getLeadDeliveryHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const { WATCHDOG_STALE_RUN_MS, PROBLEM_COPY } = await import("@/lib/lead-delivery-watchdog");
    const now = Date.now();
    const since = new Date(now - 24 * 3_600_000).toISOString();

    const [open, runs, events] = await Promise.all([
      db
        .from("lead_delivery_watch")
        .select("lead_id, organization_id, problem, reason, attempts, first_flagged_at, last_checked_at")
        .eq("state", "open")
        .order("first_flagged_at", { ascending: true })
        .limit(100),
      db.from("lead_watchdog_events").select("created_at, detail").eq("event", "run").order("created_at", { ascending: false }).limit(1),
      db.from("lead_watchdog_events").select("event").gte("created_at", since).neq("event", "run").limit(5000),
    ]);
    if (open.error || runs.error || events.error) throw new Error("Couldn't load lead delivery health.");

    const orgIds = [...new Set((open.data ?? []).map((r) => String(r.organization_id)))];
    const names = new Map<string, string>();
    if (orgIds.length) {
      const { data } = await db.from("organizations").select("id, name").in("id", orgIds);
      for (const org of data ?? []) names.set(String(org.id), String(org.name ?? "Workspace"));
    }

    const lastRun = runs.data?.[0] ?? null;
    const lastRunAt = (lastRun?.created_at as string | undefined) ?? null;
    const counts: Record<string, number> = {};
    for (const row of events.data ?? []) counts[String(row.event)] = (counts[String(row.event)] ?? 0) + 1;

    return {
      lastRunAt,
      lastRunSummary: (lastRun?.detail as string | undefined) ?? null,
      stale: !lastRunAt || now - Date.parse(lastRunAt) > WATCHDOG_STALE_RUN_MS,
      last24h: {
        flagged: counts["flagged"] ?? 0,
        retrySent: counts["retry_sent"] ?? 0,
        retryFailed: counts["retry_failed"] ?? 0,
        resolved: counts["resolved"] ?? 0,
        errors: counts["error"] ?? 0,
      },
      open: (open.data ?? []).map((r) => ({
        leadId: String(r.lead_id),
        organizationId: String(r.organization_id),
        workspace: names.get(String(r.organization_id)) ?? "Workspace",
        problem: String(r.problem),
        explanation: PROBLEM_COPY[r.problem as keyof typeof PROBLEM_COPY]?.admin ?? String(r.problem),
        reason: (r.reason as string | null) ?? null,
        attempts: Number(r.attempts ?? 0),
        firstFlaggedAt: String(r.first_flagged_at),
      })),
    };
  });
