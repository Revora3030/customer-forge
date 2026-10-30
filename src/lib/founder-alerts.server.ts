/**
 * Founder alerts: email the platform owner about new signups, completed and
 * failed payments, and finished or failed website builds.
 *
 * Uses the existing managed email sender (no new paid service) and the
 * existing audit_logs table for throttle markers (no migration):
 *  - each event is sent at most once (marker per event id), and
 *  - at most FOUNDER_ALERT_HOURLY_CAP alerts go out per rolling hour, so a
 *    burst of failures can never flood the inbox.
 * An alert failure never breaks the caller.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = { from: SupabaseClient["from"] };

export const FOUNDER_ALERT_ENTITY = "founder_alert";
export const FOUNDER_ALERT_HOURLY_CAP = 20;
const ADMIN_URL = "https://revoragrowthsystems.com/admin";

export type FounderAlertKind =
  | "signup"
  | "payment_completed"
  | "payment_failed"
  | "payment_needs_review"
  | "build_completed"
  | "build_failed"
  | "ai_budget_reached";

export type FounderAlert = {
  kind: FounderAlertKind;
  /** Unique per event, e.g. `build:<jobId>:failed`. */
  marker: string;
  organizationId: string | null;
  title: string;
  summary?: string;
  rows?: [string, string][];
  link?: string;
};

export type FounderAlertOutcome = "sent" | "duplicate" | "throttled" | "failed";

/** Whether an alert may go out now: not sent before, and under the hourly cap. */
export async function founderAlertGate(
  db: Db,
  marker: string,
  now: number = Date.now(),
): Promise<"ok" | "duplicate" | "throttled"> {
  const { data: existing, error } = await db
    .from("audit_logs")
    .select("id")
    .eq("entity", FOUNDER_ALERT_ENTITY)
    .eq("entity_id", marker)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`founder alert lookup failed: ${error.message}`);
  if (existing) return "duplicate";
  const { count, error: countError } = await db
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("entity", FOUNDER_ALERT_ENTITY)
    .gte("created_at", new Date(now - 3_600_000).toISOString());
  if (countError) throw new Error(`founder alert throttle check failed: ${countError.message}`);
  return (count ?? 0) >= FOUNDER_ALERT_HOURLY_CAP ? "throttled" : "ok";
}

export async function sendFounderAlert(db: Db, alert: FounderAlert): Promise<FounderAlertOutcome> {
  try {
    const gate = await founderAlertGate(db, alert.marker);
    if (gate !== "ok") return gate;
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    // Claim the marker first so overlapping runs can't both send.
    await db.from("audit_logs").insert({
      organization_id: alert.organizationId,
      action: `founder_alert.${alert.kind}`,
      entity: FOUNDER_ALERT_ENTITY,
      entity_id: alert.marker,
      metadata: { kind: alert.kind },
    });
    await sendTemplateEmail("founder-alert", "", {
      templateData: {
        title: alert.title,
        summary: alert.summary,
        rows: alert.rows ?? [],
        link: alert.link ?? ADMIN_URL,
      },
      idempotencyKey: `founder:${alert.marker}`,
    });
    return "sent";
  } catch (error) {
    console.error(
      "[founder-alert] failed",
      alert.kind,
      error instanceof Error ? error.message : "unknown",
    );
    return "failed";
  }
}

const BUILD_WINDOW_MS = 30 * 60_000;
const BUILD_ALERTS_PER_SWEEP = 5;

/**
 * Alert on website builds that finished or failed recently. Called after each
 * site-engine worker run; markers make repeated sweeps send nothing new.
 */
export async function alertRecentBuildOutcomes(db: Db, now: number = Date.now()): Promise<number> {
  try {
    const { data: jobs, error } = await db
      .from("generation_jobs")
      .select("id, organization_id, status, error_message, failure_kind, completed_at")
      .in("status", ["completed", "failed"])
      .gte("completed_at", new Date(now - BUILD_WINDOW_MS).toISOString())
      .order("completed_at", { ascending: false })
      .limit(BUILD_ALERTS_PER_SWEEP);
    if (error || !jobs?.length) return 0;
    let sent = 0;
    for (const job of jobs as {
      id: string;
      organization_id: string;
      status: string;
      error_message: string | null;
      failure_kind: string | null;
    }[]) {
      const { data: org } = await db
        .from("organizations")
        .select("name, is_demo")
        .eq("id", job.organization_id)
        .maybeSingle();
      const failed = job.status === "failed";
      const outcome = await sendFounderAlert(db, {
        kind: failed ? "build_failed" : "build_completed",
        marker: `build:${job.id}:${job.status}`,
        organizationId: job.organization_id,
        title: failed ? "Website build failed" : "Website build finished",
        summary: failed
          ? "A website build stopped before finishing."
          : "A website build finished and is ready for review.",
        rows: [
          ["Business", (org as { name?: string } | null)?.name ?? job.organization_id],
          ["Demo workspace", (org as { is_demo?: boolean } | null)?.is_demo ? "yes" : ""],
          [
            "Reason",
            failed ? (job.failure_kind ?? job.error_message ?? "unknown").slice(0, 200) : "",
          ],
        ],
        link: `${ADMIN_URL}/websites`,
      });
      if (outcome === "sent") sent += 1;
      if (outcome === "throttled") break;
    }
    return sent;
  } catch (error) {
    console.error(
      "[founder-alert] build sweep failed",
      error instanceof Error ? error.message : "unknown",
    );
    return 0;
  }
}
