import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the signed-in caller is a platform admin (RLS shows only own rows). */
export async function callerIsPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("role", "super_admin")
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}

/** True when a platform admin owns or manages this workspace — admins are never paywalled. */
export async function orgHasPlatformAdmin(organizationId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");
  const ids = (admins ?? []).map((row) => row.user_id as string);
  if (!ids.length) return false;
  const { data } = await supabaseAdmin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("user_id", ids)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
