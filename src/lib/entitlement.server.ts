import { isPlatformOwnerOrg } from "@/lib/platform-owner";
/**
 * Server-side paywall. The dashboard also hides paid features in the UI, but
 * that is cosmetic — every paid server capability must call this, because a
 * client can call server functions directly.
 *
 * Billing state is read with the user's own client (RLS), and the columns it
 * reads can only be written by verified payment webhooks / platform admins.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAccess, type AccountState } from "@/lib/access-state";

export type Entitlement = { allowed: boolean; reason: string; state: AccountState | "DEMO" };

export async function orgEntitlement(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Entitlement> {
  const { data: org, error } = await supabase
    .from("organizations")
    .select(
      "id, is_demo, is_suspended, subscription_status, trial_ends_at, created_at, setup_paid_at, setup_payment_status",
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !org)
    return { allowed: false, reason: "We couldn't verify your workspace.", state: "EXPIRED" };
  if (org.is_demo) return { allowed: true, reason: "demo", state: "DEMO" };
  if (!org.is_suspended && isPlatformOwnerOrg(org.id))
    return { allowed: true, reason: "platform owner", state: "ACTIVE" };

  // Builder usage itself is never metered: access is the only gate.
  const access = resolveAccess(org as never);
  return { allowed: access.allowed, reason: access.reason, state: access.state };
}

/** Throws a plain, user-safe error when the workspace isn't entitled. */
export async function assertOrgEntitled(supabase: SupabaseClient, organizationId: string) {
  const result = await orgEntitlement(supabase, organizationId);
  if (!result.allowed) throw new Error(result.reason);
  return result;
}
