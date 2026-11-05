import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SiteMonitorFindingView = { id: string; host: string; check: string; state: "new" | "seen"; title: string; detail: string; firstSeenAt: string; lastSeenAt: string };

/** Open live-site monitor findings (LOV-3) for the owner's dashboard, newest first. Read-only. */
export const getSiteMonitorFindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: String(input?.organizationId ?? "") }))
  .handler(async ({ data, context }): Promise<{ findings: SiteMonitorFindingView[] }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, context.userId, "viewer");
    const { data: rows, error } = await (context.supabase as never as import("@supabase/supabase-js").SupabaseClient)
      .from("site_monitor_findings")
      .select("id, host, check_key, state, title, detail, first_seen_at, last_seen_at")
      .eq("organization_id", orgId)
      .neq("state", "fixed")
      .order("first_seen_at", { ascending: false })
      .limit(20);
    // Table ships with this PR's migration; until it is applied, show nothing rather than an error.
    if (error) return { findings: [] };
    return {
      findings: (rows ?? []).map((r) => ({ id: r.id, host: r.host, check: r.check_key, state: r.state, title: r.title, detail: r.detail, firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at })),
    };
  });
