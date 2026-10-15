import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { readProspectDemoMarker } from "@/lib/jarvis-demo-site";
import { claimErrorMessage, isClaimToken, NOT_CLAIMABLE, type ProspectClaimInfo } from "@/lib/prospect-claim";

const parseToken = (input: { token?: unknown } | undefined) => {
  const token = input?.token;
  if (!isClaimToken(token)) throw new Error("Invalid preview link");
  return { token };
};

/**
 * Public: whether a preview link belongs to an unclaimed prospect demo, plus the
 * business facts already shown on that preview (used to pre-fill signup).
 */
export const getProspectClaim = createServerFn({ method: "GET" })
  .validator(parseToken)
  .handler(async ({ data }): Promise<ProspectClaimInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("website_preview_links")
      .select("organization_id, revoked, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!link || link.revoked || new Date(link.expires_at).getTime() <= Date.now()) return NOT_CLAIMABLE;

    const orgId = link.organization_id as string;
    const [org, settings, profile, services] = await Promise.all([
      supabaseAdmin.from("organizations").select("name, industry, is_demo").eq("id", orgId).maybeSingle(),
      supabaseAdmin.from("website_settings").select("generation").eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin.from("business_profiles").select("city, state, phone").eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin
        .from("services")
        .select("name")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order")
        .limit(8),
    ]);
    const rawMarker = (settings.data?.generation as Record<string, unknown> | null)?.["prospectDemo"];
    const marker = readProspectDemoMarker(rawMarker);
    const claimed = Boolean(rawMarker && typeof rawMarker === "object" && "claimedAt" in rawMarker);
    if (!org.data?.is_demo || !marker || marker.previewToken !== data.token || claimed) return NOT_CLAIMABLE;

    return {
      claimable: true,
      businessName: (org.data.name as string) ?? null,
      industry: (org.data.industry as string | null) ?? null,
      city: (profile.data?.city as string | null) ?? null,
      state: (profile.data?.state as string | null) ?? null,
      phone: (profile.data?.phone as string | null) ?? null,
      services: (services.data ?? []).map((row) => String(row.name)),
    };
  });

/**
 * Signed-in: hands the prospect demo workspace to the caller and starts the
 * standard full-access trial. Atomic and single-use in the database.
 */
export const claimProspectDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(parseToken)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The RPC is newer than the generated types; its signature is fixed in
    // supabase/migrations/20261016090000_claim_prospect_demo.sql.
    const rpc = supabaseAdmin.rpc as unknown as (
      fn: "claim_prospect_demo_server",
      args: { _token: string; _user_id: string; _trial_days: number },
    ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
    const { data: organizationId, error } = await rpc.call(supabaseAdmin, "claim_prospect_demo_server", {
      _token: data.token,
      _user_id: String(context.userId),
      _trial_days: GROWTH_SYSTEM.fullAccessTrialDays,
    });
    if (error || typeof organizationId !== "string") {
      console.error("[claim] claim_prospect_demo failed", error?.code ?? error?.message ?? "empty");
      throw new Error(claimErrorMessage(error));
    }
    return { organizationId };
  });
