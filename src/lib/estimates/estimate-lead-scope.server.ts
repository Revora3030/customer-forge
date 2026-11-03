/**
 * The signature row is written with the service role, so the database will not
 * stop a browser-supplied `leadId` from another workspace being attached to this
 * workspace's audit record (estimate_signatures has no lead/org consistency
 * constraint). Check it here, with the caller's own credentials (RLS applies),
 * scoped to the workspace they already passed `requireOrgRole` for.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const LEAD_NOT_IN_WORKSPACE = "That lead wasn't found in this workspace.";

export async function assertLeadInOrg(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  leadId: string | null,
): Promise<void> {
  if (!leadId) return;
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't check that lead: ${error.message}`);
  if (!data) throw new Error(LEAD_NOT_IN_WORKSPACE);
}
