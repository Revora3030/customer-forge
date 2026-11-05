import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VisitorErrorGroup } from "@/lib/visitor-errors";

/** The owner's short list of problems real visitors hit on the published site (last 30 days). */
export const getVisitorErrorFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: String(input?.organizationId ?? "") }))
  .handler(async ({ data, context }): Promise<{ groups: VisitorErrorGroup[] }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, context.userId, "viewer");
    const { groupVisitorErrors, VISITOR_ERROR_RETENTION_DAYS } = await import("@/lib/visitor-errors");
    const since = new Date(Date.now() - VISITOR_ERROR_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    const { data: rows, error } = await (context.supabase as never as import("@supabase/supabase-js").SupabaseClient)
      .from("visitor_error_events")
      .select("day, kind, message_hash, message, page_path, occurrences, last_seen")
      .eq("organization_id", orgId)
      .gte("day", since)
      .limit(2000);
    if (error) throw new Error("Couldn't load visitor problems.");
    return { groups: groupVisitorErrors((rows ?? []) as never, new Date().toISOString().slice(0, 10)) };
  });
