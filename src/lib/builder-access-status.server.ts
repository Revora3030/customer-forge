import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BuilderAccessStatus } from "@/lib/builder-access-status";
import { orgRole, roleAtLeast } from "@/lib/org-authz.server";
import { orgEntitlement } from "@/lib/entitlement.server";

/** Authenticated metadata read only. Never bypasses authorization for an edit. */
export async function readBuilderAccessStatus(
  supabase: SupabaseClient<Database>, userId: string, organizationId: string,
): Promise<BuilderAccessStatus> {
  const { data: adminRows, error } = await supabase.from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "super_admin").limit(1);
  if (error) throw new Error("We couldn't verify workspace access.");
  const verifiedAdmin = Boolean(adminRows?.length);
  const role = verifiedAdmin ? null : await orgRole(supabase, organizationId, userId);
  if (!verifiedAdmin && !roleAtLeast(role, "viewer"))
    throw new Error("You don't have permission to do that in this workspace.");
  const entitlement = await orgEntitlement(supabase, organizationId);
  if (entitlement.reason === "We couldn't verify your workspace.")
    throw new Error("We couldn't verify workspace access.");
  return { allowed: entitlement.allowed, canManage: verifiedAdmin || roleAtLeast(role, "manager"), state: entitlement.state, reason: entitlement.reason };
}
