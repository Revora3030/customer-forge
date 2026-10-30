/**
 * ONE place that decides whether the signed-in person may perform a sensitive
 * action inside a workspace.
 *
 * Authentication alone is never sufficient: a bearer token proves who someone
 * is, not which workspace they belong to or what they are allowed to do there.
 * Every mutating server function that accepts an `organizationId` from the
 * browser runs it through here first, so a changed id in a request body can
 * never reach another organization's data (IDOR), and a viewer can never
 * perform an owner's action.
 *
 * Roles, strongest first: owner > admin > manager > staff > viewer.
 * The same ladder is enforced in the database (see `private.org_role_at_least`),
 * so this check is a clear error message rather than the only line of defence.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type OrgRole = Database["public"]["Enums"]["app_role"];

const LEVEL: Record<string, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  staff: 1,
  viewer: 0,
};

export type MinRole = "owner" | "admin" | "manager" | "staff" | "viewer";

/** Deliberately vague: never reveal whether a workspace id exists. */
const DENIED = "You don't have permission to do that in this workspace.";

export function roleAtLeast(role: string | null | undefined, min: MinRole) {
  return (LEVEL[String(role ?? "")] ?? -1) >= (LEVEL[min] ?? 0);
}

/**
 * Resolves the caller's role in a workspace using their OWN credentials, so row
 * level security applies to the lookup too. Returns null when they are not a
 * member — including when the workspace does not exist.
 */
export async function orgRole(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  userId: string,
): Promise<OrgRole | null> {
  const org = String(organizationId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(org)) return null;
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", org)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data?.role as OrgRole | undefined) ?? null;
  if (role) return role;
  // A platform super admin in an open, audited support session for THIS
  // workspace acts as its admin — exactly what the database grants through
  // `private.has_support_access` (which `org_role_at_least` honours). Without
  // this the app refused builds and saves that RLS would have allowed.
  // Never "owner": owner-only actions stay with the workspace's own owner.
  return (await hasActiveSupportSession(supabase, org, userId)) ? "admin" : null;
}

/**
 * Mirrors `private.has_support_access`: support grants last at most this long
 * after the session starts, even if nobody ends it.
 */
export const SUPPORT_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/**
 * True only when the caller is a super admin AND holds an open support session
 * for this exact workspace that started within the last four hours. Both reads
 * use the caller's own credentials (RLS applies) and any error fails closed.
 */
export async function hasActiveSupportSession(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  userId: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!userId) return false;
  try {
    const since = new Date(now - SUPPORT_SESSION_MAX_AGE_MS).toISOString();
    const [roleRead, sessionRead] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .limit(1),
      supabase
        .from("support_sessions")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("admin_id", userId)
        .is("ended_at", null)
        .gt("started_at", since)
        .limit(1),
    ]);
    if (roleRead.error || sessionRead.error) return false;
    return (roleRead.data?.length ?? 0) > 0 && (sessionRead.data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Throws a safe, non-revealing error unless the caller holds at least `min` in
 * that workspace. Returns the verified organization id so callers use the
 * validated value rather than the raw request field.
 */
export async function requireOrgRole(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  userId: string,
  min: MinRole,
): Promise<string> {
  const role = await orgRole(supabase, organizationId, userId);
  if (!role || !roleAtLeast(role, min)) throw new Error(DENIED);
  return String(organizationId).trim();
}
