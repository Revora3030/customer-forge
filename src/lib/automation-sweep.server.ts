/**
 * Scheduled delivery of automation steps that have come due.
 *
 * Follow-up sequences queue their later steps with a delay (1 hour, 2 days,
 * 5 days, review requests after a job). Before this sweep those steps were only
 * delivered when the owner happened to open the Automations page or a new lead
 * arrived for the same workspace, so a quiet business's follow-ups never went
 * out. This pass finds every workspace with due runs and delivers them through
 * the same `processDueRuns` + `deliverRun` path the app already uses (claim on
 * the queued status, provider idempotency per run).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { processDueRuns, type RunDelivery } from "@/lib/automation-engine";

type Db = SupabaseClient<Database>;

export type SweepResult = {
  workspaces: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: number;
  /** More workspaces were due than one pass handles; the next pass continues. */
  more: boolean;
};

export type SweepDeps = {
  deliverFor: (ctx: { businessName: string; replyTo: string | null; businessState: string | null }) => RunDelivery;
  now?: () => Date;
};

/** Workspaces handled per pass, so one run stays well inside the job timeout. */
export const SWEEP_WORKSPACES_PER_PASS = 25;

export async function runDueAutomationSweep(admin: Db, deps: SweepDeps): Promise<SweepResult> {
  const now = (deps.now?.() ?? new Date()).toISOString();
  const { data: dueRows, error } = await admin
    .from("automation_runs")
    .select("organization_id")
    .eq("status", "queued")
    .lte("scheduled_for", now)
    .order("scheduled_for")
    .limit(1000);
  if (error) throw new Error(`automation sweep lookup failed: ${error.message}`);

  const orgIds = [...new Set((dueRows ?? []).map((row) => row.organization_id).filter(Boolean))] as string[];
  const batch = orgIds.slice(0, SWEEP_WORKSPACES_PER_PASS);
  const result: SweepResult = { workspaces: 0, sent: 0, skipped: 0, failed: 0, errors: 0, more: orgIds.length > batch.length };
  if (!batch.length) return result;

  const [{ data: orgs, error: orgError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.from("organizations").select("id, name, is_suspended").in("id", batch),
    admin.from("business_profiles").select("organization_id, email, owner_email, state").in("organization_id", batch),
  ]);
  if (orgError || profileError) throw new Error("automation sweep workspace lookup failed");
  const profileByOrg = new Map((profiles ?? []).map((p) => [p.organization_id as string, p]));

  for (const org of orgs ?? []) {
    // A suspended workspace sends nothing; its runs stay queued for review.
    if (!org?.id || org.is_suspended) continue;
    const profile = profileByOrg.get(org.id);
    const businessName = org.name ?? "";
    try {
      const outcome = await processDueRuns(admin, org.id, {
        businessName,
        deliver: deps.deliverFor({
          businessName,
          replyTo: profile?.email ?? profile?.owner_email ?? null,
          businessState: profile?.state ?? null,
        }),
      });
      result.workspaces += 1;
      result.sent += outcome.sent;
      result.skipped += outcome.skipped;
      result.failed += outcome.failed;
    } catch (cause) {
      // One workspace's failure never blocks the rest of the pass.
      result.errors += 1;
      console.error("[automation-sweep] workspace failed", org.id, cause instanceof Error ? cause.message : "unknown");
    }
  }
  return result;
}
