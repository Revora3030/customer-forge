import type { SupabaseClient } from "@supabase/supabase-js";

/**

 * Revora's own staff (super admins) test the signup and checkout flow. Every
 * row from a browser session in which a staff email appears is staff activity,
 * so funnel reports drop the whole session instead of counting it as a
 * prospect who started signing up or paying.
 */

/**
 * Browser addresses the owner confirmed as Revora test accounts on 2026-10-29.
 * The auth accounts behind them are gone, but their recorded funnel events
 * would otherwise keep showing up as signups and checkouts that never happened.
 */
export const TEST_ACCOUNT_EMAILS = [
  "bigdawg09091@gmail.com",
  "danaysiaingram42@gmail.com",
] as const;

export function staffSessionIds(
  rows: { session_id?: string | null; email?: string | null }[],
  staffEmails: Iterable<string>,
): Set<string> {
  const staff = new Set([...staffEmails].map((e) => e.trim().toLowerCase()).filter(Boolean));
  const out = new Set<string>();
  if (staff.size === 0) return out;
  for (const row of rows) {
    const email = row.email?.trim().toLowerCase();
    if (row.session_id && email && staff.has(email)) out.add(row.session_id);
  }
  return out;
}

export function isStaffRow(
  row: { session_id?: string | null; email?: string | null },
  staffSessions: Set<string>,
  staffEmails: Set<string>,
): boolean {
  const email = row.email?.trim().toLowerCase();
  if (email && staffEmails.has(email)) return true;
  return !!row.session_id && staffSessions.has(row.session_id);
}

/**
 * Emails whose activity is Revora's own: every super admin plus the owner's
 * confirmed test accounts. A report that loads this set drops the whole browser
 * session of any row carrying one, so staff and test runs never look like
 * prospects in the owner's funnel numbers.
 */
export async function staffEmailAddresses(db: SupabaseClient): Promise<Set<string>> {
  const emails = new Set<string>(TEST_ACCOUNT_EMAILS);
  const { data: staffRoles, error } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");
  if (error) throw new Error("Analytics unavailable");
  for (const role of staffRoles ?? []) {
    const { data: user } = await db.auth.admin.getUserById(role.user_id);
    if (user?.user?.email) emails.add(user.user.email.toLowerCase());
  }
  return emails;
}

