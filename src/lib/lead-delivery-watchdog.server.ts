import type { SupabaseClient } from "@supabase/supabase-js";
import { sendLeadAlert } from "@/lib/messaging.server";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";
import { REVORA } from "@/lib/brand";
import { sendOnce, type ReportRun } from "@/lib/owner-reports.server";
import {
  OWNER_ACTION_PROBLEMS,
  PROBLEM_COPY,
  WATCHDOG_LOOKBACK_MS,
  WATCHDOG_MAX_ATTEMPTS,
  decideLeadDelivery,
  nextAttemptAt,
  type WatchFlag,
  type WatchLogRow,
  type WatchdogProblem,
} from "@/lib/lead-delivery-watchdog";

/**
 * Lead-delivery watchdog (runs every 5 minutes, pg_cron -> call_revora_job ->
 * /api/public/jobs/lead-delivery-watchdog).
 *
 * For every real lead from the last 72 hours (plus any lead that still has an
 * open flag) it checks lead_alert_log for an accepted owner alert. When there is
 * none after a 5 minute grace period it retries with the lead's ORIGINAL
 * idempotency key (so a retry can never become a second email), records a flag
 * the owner sees on their dashboard and /admin sees on its overview, and writes
 * every action to lead_watchdog_events.
 *
 * It never emails a customer or a lead's visitor. The only email it sends is a
 * once-a-day summary (no lead details) to Revora's own inbox when something
 * still needs a person.
 */

type Db = Pick<SupabaseClient, "from">;
type Row = Record<string, unknown>;

const MAX_LEADS = 2000;
const MAX_RETRIES_PER_RUN = 25;
const IN_CHUNK = 150;

export type WatchdogRun = ReportRun & {
  flagged: number;
  retried: number;
  resolved: number;
  needsAction: number;
};

const ALERT_TITLE = "New lead";

const chunks = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function selectIn(db: Db, table: string, columns: string, column: string, ids: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const part of chunks(ids, IN_CHUNK)) {
    const { data, error } = await db.from(table).select(columns).in(column, part).limit(10_000);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
  }
  return rows;
}

export async function runLeadDeliveryWatchdog(db: Db, now = Date.now()): Promise<WatchdogRun> {
  const run: WatchdogRun = {
    job: "lead-delivery-watchdog",
    scanned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    details: [],
    flagged: 0,
    retried: 0,
    resolved: 0,
    needsAction: 0,
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  const event = async (organizationId: string | null, leadId: string | null, name: string, detail?: string) => {
    const { error } = await db.from("lead_watchdog_events").insert({
      organization_id: organizationId,
      lead_id: leadId,
      event: name,
      detail: detail ? detail.slice(0, 300) : null,
    });
    if (error) console.error("[lead-delivery-watchdog] event log failed", error.message);
  };

  // 1. Candidate leads: recent ones, plus older ones that still carry an open flag.
  const { data: recent, error: recentError } = await db
    .from("leads")
    .select("id, organization_id, created_at, source, name, email, phone, city, service_interest, message, estimated_value")
    .gte("created_at", iso(now - WATCHDOG_LOOKBACK_MS))
    .order("created_at", { ascending: false })
    .limit(MAX_LEADS);
  if (recentError) throw new Error(`leads: ${recentError.message}`);
  const leads = new Map<string, Row>();
  for (const lead of (recent ?? []) as unknown as Row[]) leads.set(String(lead["id"]), lead);

  const { data: openRows, error: openError } = await db
    .from("lead_delivery_watch")
    .select("lead_id")
    .eq("state", "open")
    .limit(500);
  if (openError) throw new Error(`lead_delivery_watch: ${openError.message}`);
  const missing = ((openRows ?? []) as unknown as Row[]).map((r) => String(r["lead_id"])).filter((id) => !leads.has(id));
  for (const lead of await selectIn(
    db,
    "leads",
    "id, organization_id, created_at, source, name, email, phone, city, service_interest, message, estimated_value",
    "id",
    missing,
  ))
    leads.set(String(lead["id"]), lead);

  const leadIds = [...leads.keys()];
  const orgIds = [...new Set([...leads.values()].map((l) => String(l["organization_id"])))];

  // 2. Context rows, loaded once per run.
  const orgs = new Map<string, Row>();
  for (const org of await selectIn(db, "organizations", "id, name, is_demo, is_suspended", "id", orgIds)) orgs.set(String(org["id"]), org);
  const profiles = new Map<string, Row>();
  for (const p of await selectIn(db, "business_profiles", "organization_id, notification_email, email, owner_email, notify_on_lead", "organization_id", orgIds))
    profiles.set(String(p["organization_id"]), p);
  const logs = new Map<string, WatchLogRow[]>();
  for (const row of await selectIn(db, "lead_alert_log", "lead_id, status, reason, recipient, created_at, organization_id", "lead_id", leadIds)) {
    const lead = leads.get(String(row["lead_id"]));
    // A log row only counts for the workspace that owns the lead.
    if (!lead || lead["organization_id"] !== row["organization_id"]) continue;
    const key = String(row["lead_id"]);
    logs.set(key, [...(logs.get(key) ?? []), row as unknown as WatchLogRow]);
  }
  const flags = new Map<string, Row>();
  for (const f of await selectIn(db, "lead_delivery_watch", "lead_id, organization_id, state, problem, reason, attempts, next_attempt_at, owner_notified_at, first_flagged_at", "lead_id", leadIds))
    flags.set(String(f["lead_id"]), f);

  const needsAction: { orgName: string; problem: WatchdogProblem }[] = [];
  let retriesLeft = MAX_RETRIES_PER_RUN;

  for (const [leadId, lead] of leads) {
    const organizationId = String(lead["organization_id"]);
    const org = orgs.get(organizationId);
    if (!org || org["is_demo"] === true || org["is_suspended"] === true) continue;
    run.scanned += 1;

    const flagRow = flags.get(leadId) ?? null;
    const flag = flagRow
      ? ({
          state: String(flagRow["state"]),
          problem: String(flagRow["problem"]),
          attempts: Number(flagRow["attempts"] ?? 0),
          next_attempt_at: (flagRow["next_attempt_at"] as string | null) ?? null,
        } satisfies WatchFlag)
      : null;
    const open = flag?.state === "open";

    let decision = decideLeadDelivery({
      lead: { id: leadId, created_at: String(lead["created_at"]), source: (lead["source"] as string | null) ?? null },
      logs: logs.get(leadId) ?? [],
      profile: (profiles.get(organizationId) ?? null) as never,
      flag,
      now,
    });

    try {
      // One retry per pass at most; the cap keeps a bad day from running past the job timeout.
      if (decision.action === "retry" && retriesLeft <= 0) {
        decision = { action: "flag", problem: decision.problem, reason: decision.reason };
      }

      let problem: WatchdogProblem | null = null;
      let reason: string | null = null;
      let attempts = flag?.attempts ?? 0;
      let nextAt: string | null = flag?.next_attempt_at ?? null;
      let lastAttemptAt: string | null = null;

      if (decision.action === "none") continue;

      if (decision.action === "resolve") {
        if (open) {
          const { error } = await db
            .from("lead_delivery_watch")
            .update({ state: "resolved", resolved_at: iso(now), resolution: decision.resolution, last_checked_at: iso(now), updated_at: iso(now) })
            .eq("lead_id", leadId)
            .eq("organization_id", organizationId);
          if (error) throw new Error(error.message);
          run.resolved += 1;
          await event(organizationId, leadId, "resolved", decision.resolution);
        }
        continue;
      }

      problem = decision.problem;
      reason = decision.reason;

      if (decision.action === "retry") {
        retriesLeft -= 1;
        run.retried += 1;
        attempts += 1;
        lastAttemptAt = iso(now);
        nextAt = nextAttemptAt(attempts, now);
        const result = await sendLeadAlert(
          decision.recipient,
          {
            businessName: String(org["name"] ?? "") || "Your business",
            kind: ALERT_TITLE,
            leadName: (lead["name"] as string | null) ?? "someone",
            leadEmail: (lead["email"] as string | null) || undefined,
            leadPhone: (lead["phone"] as string | null) || undefined,
            city: (lead["city"] as string | null) || undefined,
            service: (lead["service_interest"] as string | null) || undefined,
            estimate: lead["estimated_value"] ? `$${lead["estimated_value"]}` : undefined,
            message: (lead["message"] as string | null) || undefined,
          },
          // The SAME key as the original send: the provider dedupes, so this can never be a second email.
          `lead-alert-${leadId}`,
        );
        await db.from("lead_alert_log").insert({
          organization_id: organizationId,
          lead_id: leadId,
          recipient: decision.recipient,
          kind: "inquiry",
          status: result.ok ? "sent" : "failed",
          reason: result.ok ? null : result.reason,
        });
        await event(organizationId, leadId, result.ok ? "retry_sent" : "retry_failed", result.ok ? `attempt ${attempts}` : `attempt ${attempts}: ${result.reason}`);
        if (result.ok) {
          run.sent += 1;
          problem = null;
        } else {
          run.failed += 1;
          reason = result.reason;
          problem = attempts >= WATCHDOG_MAX_ATTEMPTS ? "exhausted" : "failed_retrying";
        }
      }

      if (problem === null) {
        // Retry got an accepted alert: close the flag (it only exists if one was opened earlier).
        if (open) {
          await db
            .from("lead_delivery_watch")
            .update({ state: "resolved", resolved_at: iso(now), resolution: "alert_sent_by_retry", attempts, last_attempt_at: lastAttemptAt, last_checked_at: iso(now), updated_at: iso(now) })
            .eq("lead_id", leadId)
            .eq("organization_id", organizationId);
          run.resolved += 1;
          await event(organizationId, leadId, "resolved", "alert_sent_by_retry");
        } else {
          // Never flagged to the owner (fixed within this pass): keep an audit row of the save.
          await db.from("lead_delivery_watch").upsert(
            {
              lead_id: leadId,
              organization_id: organizationId,
              state: "resolved",
              problem: decision.action === "retry" ? decision.problem : "never_attempted",
              reason: decision.action === "retry" ? decision.reason : null,
              attempts,
              last_attempt_at: lastAttemptAt,
              resolved_at: iso(now),
              resolution: "alert_sent_by_retry",
              last_checked_at: iso(now),
              updated_at: iso(now),
            },
            { onConflict: "lead_id" },
          );
          run.resolved += 1;
        }
        continue;
      }

      // Still unresolved: write or update the flag.
      const firstTime = !open;
      const row = {
        lead_id: leadId,
        organization_id: organizationId,
        state: "open",
        problem,
        reason,
        attempts,
        last_attempt_at: lastAttemptAt ?? undefined,
        next_attempt_at: OWNER_ACTION_PROBLEMS.has(problem) && problem !== "exhausted" ? null : nextAt,
        last_checked_at: iso(now),
        updated_at: iso(now),
        ...(firstTime ? { first_flagged_at: iso(now), resolved_at: null, resolution: null, owner_notified_at: null } : {}),
      };
      const { error: upsertError } = await db.from("lead_delivery_watch").upsert(row, { onConflict: "lead_id" });
      if (upsertError) throw new Error(upsertError.message);
      if (firstTime) {
        run.flagged += 1;
        await event(organizationId, leadId, "flagged", `${problem}${reason ? `: ${reason}` : ""}`);
      } else if (flag?.problem !== problem) {
        await event(organizationId, leadId, "problem_changed", `${flag?.problem} -> ${problem}`);
      }

      if (OWNER_ACTION_PROBLEMS.has(problem)) {
        needsAction.push({ orgName: String(org["name"] ?? "A workspace"), problem });
        if (!flagRow?.["owner_notified_at"] || firstTime) {
          const { error: noteError } = await db.from("notifications").insert({
            organization_id: organizationId,
            kind: "lead_alert_failed",
            title: "We couldn't email you about a new lead",
            body: PROBLEM_COPY[problem].owner,
            link: `/app/leads`,
          });
          if (noteError) console.error("[lead-delivery-watchdog] owner notification failed", noteError.message);
          else {
            await db.from("lead_delivery_watch").update({ owner_notified_at: iso(now) }).eq("lead_id", leadId);
            await event(organizationId, leadId, "owner_notified", problem);
          }
        }
      }
    } catch (error) {
      run.failed += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      run.details.push({ organizationId, status: "error", reason: message.slice(0, 120) });
      await event(organizationId, leadId, "error", message);
    }
  }

  run.needsAction = needsAction.length;

  // 3. At most one summary a day to Revora's own inbox, only while something still needs a person.
  if (needsAction.length) {
    const { data: platform } = await db.from("organizations").select("id").eq("id", PLATFORM_OWNER_ORG_ID).maybeSingle();
    if (platform?.id) {
      const byOrg = new Map<string, number>();
      for (const item of needsAction) byOrg.set(item.orgName, (byOrg.get(item.orgName) ?? 0) + 1);
      await sendOnce(db, run, {
        organizationId: platform.id as string,
        kind: "lead_delivery_watchdog_alert",
        windowKey: iso(now).slice(0, 10),
        recipient: REVORA.email,
        businessName: "Revora",
        heading: `${needsAction.length} lead${needsAction.length === 1 ? "" : "s"} still without an owner alert`,
        message: [
          "The lead-delivery watchdog retried these and an owner alert still has not been accepted by the email provider:",
          [...byOrg].map(([name, count]) => `• ${name}: ${count}`).join("\n"),
          "Open /admin for the reason on each one. This summary sends at most once a day.",
        ].join("\n\n"),
      });
    }
  }

  // 4. Heartbeat for /admin, then prune old log rows.
  await event(
    null,
    null,
    "run",
    `scanned=${run.scanned} flagged=${run.flagged} retried=${run.retried} sent=${run.sent} resolved=${run.resolved} needs_action=${run.needsAction}`,
  );
  await db.from("lead_watchdog_events").delete().eq("event", "run").lt("created_at", iso(now - 14 * 86_400_000));
  await db.from("lead_watchdog_events").delete().lt("created_at", iso(now - 90 * 86_400_000));
  return run;
}
