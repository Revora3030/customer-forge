import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * Reads the real activity trail for one workspace.
 *
 * Runs as the signed-in user, so RLS keeps every read inside workspaces they
 * belong to. Any source that fails to read is reported as unavailable rather
 * than silently treated as "nothing happened".
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildTimeline,
  systemHealth,
  type ActivityEvent,
  type AuditRow,
  type AutomationRunRow,
  type GenerationJobRow,
  type SystemHealth,
} from "@/lib/observability";

const orgIdOf = (input: { organizationId?: unknown }) => {
  const id = String(input?.organizationId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid workspace");
  return id;
};

export type ActivityFeed = {
  events: ActivityEvent[];
  health: SystemHealth;
  /** Sources Revora could not read right now, named honestly for the owner. */
  unavailable: string[];
};

export const getActivityFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: orgIdOf(input),
  }))
  .handler(async ({ data, context }): Promise<ActivityFeed> => {
    const supabase = context.supabase as Pick<SupabaseClient, "from">;
    const orgId = data.organizationId;

    const [jobs, runs, audits] = await Promise.all([
      supabase
        .from("generation_jobs")
        .select("id, status, progress, current_step, error_message, created_at, completed_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("automation_runs")
        .select("id, action_type, status, trigger_event, recipient, scheduled_for, sent_at")
        .eq("organization_id", orgId)
        .order("scheduled_for", { ascending: false })
        .limit(15),
      supabase
        .from("audit_logs")
        .select("id, action, entity, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const unavailable: string[] = [];
    if (jobs.error) unavailable.push("website builds");
    if (runs.error) unavailable.push("automated follow-ups");
    if (audits.error) unavailable.push("account history");

    const events = buildTimeline({
      jobs: (jobs.data ?? []) as GenerationJobRow[],
      runs: (runs.data ?? []) as AutomationRunRow[],
      audits: (audits.data ?? []) as AuditRow[],
      limit: 20,
    });

    return { events, health: systemHealth(events), unavailable };
  });
