import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/paginate";
import { customerOrgIds } from "@/lib/customer-orgs";

/** Loads customer workspace ids with elevated access. Caller must be a verified super admin. */
export async function loadCustomerOrgIds(admin: SupabaseClient): Promise<Set<string>> {
  const [orgs, members, roles] = await Promise.all([
    fetchAllRows<{ id: string; is_demo: boolean | null }>((from, to) =>
      admin.from("organizations").select("id, is_demo").order("id").range(from, to),
    ),
    fetchAllRows<{ organization_id: string; user_id: string }>((from, to) =>
      admin.from("memberships").select("organization_id, user_id").order("organization_id").range(from, to),
    ),
    admin.from("user_roles").select("user_id").eq("role", "super_admin"),
  ]);
  if (orgs.error || members.error || roles.error) throw new Error("Couldn't work out which workspaces are customers.");
  return customerOrgIds(orgs.rows, members.rows, ((roles.data ?? []) as { user_id: string }[]).map((r) => r.user_id));
}
