import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { healthSummary, type HealthSummary } from "@/lib/live-site-health";

/** COMP-4: the owner's post-publish health, from measured LOV-3 checks only. Read-only. */
export const getSiteHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: String(input?.organizationId ?? "") }))
  .handler(async ({ data, context }): Promise<{ health: HealthSummary | null; host: string | null }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, context.userId, "viewer");
    const { data: rows, error } = await (context.supabase as never as import("@supabase/supabase-js").SupabaseClient)
      .from("site_monitor_checks")
      .select("host, check_key, status, checked_at")
      .eq("organization_id", orgId)
      .order("checked_at", { ascending: false })
      .limit(50);
    // Until the migration is applied (or nothing was ever checked) there is no health to show.
    if (error || !rows?.length) return { health: null, host: null };
    const host = rows[0]!.host as string;
    const mine = rows.filter((r) => r.host === host).map((r) => ({ check: r.check_key as string, status: r.status as string, checkedAt: r.checked_at as string }));
    return { health: healthSummary(mine), host };
  });
