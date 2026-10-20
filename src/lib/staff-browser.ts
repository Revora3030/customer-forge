/**
 * Marks a browser as Revora staff once a super admin signs in on it, so the
 * owner's own visits never count as marketing traffic — even later, signed out.
 * The mark only suppresses tracking; it grants no access.
 */
const KEY = "revora.staff.v1";

export function isStaffBrowser(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markStaffBrowser(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: nothing to remember.
  }
}

/** Checks the signed-in user's own role row (readable under RLS) and marks the browser. */
export async function detectStaffBrowser(): Promise<boolean> {
  if (isStaffBrowser()) return true;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (data) markStaffBrowser();
    return Boolean(data);
  } catch {
    return false;
  }
}
