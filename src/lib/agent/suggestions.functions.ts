/**
 * Owner dashboard wiring for PAI-21 suggestions. Read: any member (RLS).
 * Do it / Dismiss / Snooze: owner only. "Do it" ONLY creates an approval;
 * nothing runs and nothing reaches a customer until the owner approves it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /^[0-9a-f-]{36}$/i;

type Fact = string | number | boolean | null;
export type WireSuggestion = { id: string; signal: string; title: string; body: string; evidence: Record<string, Fact | Fact[]>; created_at: string };

export const listAgentSuggestionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!UUID.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(async ({ data, context }): Promise<{ suggestions: WireSuggestion[] }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase as never, data.organizationId, String(context.userId), "viewer");
    const { data: rows, error } = await (context.supabase as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("agent_suggestions")
      .select("id, signal, title, body, evidence, created_at")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) throw new Error("Couldn't load suggestions.");
    return { suggestions: (rows ?? []) as WireSuggestion[] };
  });

export const actOnAgentSuggestionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; id: string; action: "do" | "dismiss" | "snooze" }) => {
    const organizationId = String(input?.organizationId ?? "");
    const id = String(input?.id ?? "");
    const action = input?.action;
    if (!UUID.test(organizationId) || !UUID.test(id)) throw new Error("Invalid suggestion");
    if (action !== "do" && action !== "dismiss" && action !== "snooze") throw new Error("Invalid action");
    return { organizationId, id, action };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; approvalId?: string } | { ok: false; message: string }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase as never, data.organizationId, String(context.userId), "owner");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await import("@/lib/agent/suggestions.server");
    const repo = s.supabaseSuggestionRepo(supabaseAdmin);
    let res;
    if (data.action === "dismiss") res = await s.dismissSuggestion(repo, orgId, data.id);
    else if (data.action === "snooze") res = await s.snoozeSuggestion(repo, orgId, data.id, 7);
    else {
      const { supabaseApprovalRepo } = await import("@/lib/agent/approvals.server");
      res = await s.acceptSuggestion(repo, { repo: supabaseApprovalRepo(supabaseAdmin) }, orgId, data.id, String(context.userId));
    }
    return res.ok ? res : { ok: false, message: res.message };
  });
