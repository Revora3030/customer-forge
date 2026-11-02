import { alertInbox, type LeadAlertProfile } from "@/lib/lead-alert-recipient";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";

/**
 * Lead-delivery watchdog policy. Pure and browser-safe: given a lead, its
 * alert log rows, the workspace's alert settings and any existing flag, it
 * decides what the watchdog does. The server runner applies the decision.
 *
 * What "delivered" means here: lead_alert_log has a row with status "sent",
 * written when the email provider accepted the message. The provider gives no
 * inbox-delivery or bounce receipt, so this is the strongest confirmation the
 * system can have. The watchdog never claims more than that.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A new lead's alert is sent in the same request that saves it. Not accepted after this long = delayed. */
export const WATCHDOG_GRACE_MS = 5 * MINUTE;
/** Leads older than this are no longer examined, unless they still have an open flag. */
export const WATCHDOG_LOOKBACK_MS = 72 * HOUR;
/** Wait before the Nth watchdog retry (index = attempts already made). */
export const WATCHDOG_BACKOFF_MS = [0, 10 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR] as const;
export const WATCHDOG_MAX_ATTEMPTS = WATCHDOG_BACKOFF_MS.length;
/** /admin shows the watchdog itself as stale after this long without a heartbeat (it runs every 5 minutes). */
export const WATCHDOG_STALE_RUN_MS = 20 * MINUTE;

/** Reasons a resend cannot fix; retrying only repeats the failure. */
export const PERMANENT_ALERT_REASONS = new Set(["recipient_suppressed", "no_email_address"]);

export type WatchdogProblem =
  | "never_attempted"
  | "failed_retrying"
  | "failed_permanent"
  | "no_alert_inbox"
  | "exhausted";

/** Problems that need the owner (or Revora) to act; a retry will not fix them. */
export const OWNER_ACTION_PROBLEMS: ReadonlySet<WatchdogProblem> = new Set([
  "failed_permanent",
  "no_alert_inbox",
  "exhausted",
]);

export type WatchLead = { id: string; created_at: string; source: string | null };
export type WatchLogRow = { status: string; reason: string | null; recipient: string | null; created_at: string };
export type WatchFlag = {
  state: string;
  problem: string;
  attempts: number;
  next_attempt_at: string | null;
};

export type WatchDecision =
  | { action: "none" }
  | { action: "resolve"; resolution: "alert_sent" | "owner_alerts_off" }
  | { action: "flag"; problem: WatchdogProblem; reason: string | null }
  | { action: "retry"; problem: WatchdogProblem; reason: string | null; recipient: string };

const time = (value: string | null | undefined) => (value ? Date.parse(value) : Number.NaN);

export function decideLeadDelivery(input: {
  lead: WatchLead;
  logs: readonly WatchLogRow[];
  profile: (LeadAlertProfile & Record<string, unknown>) | null;
  flag: WatchFlag | null;
  now: number;
}): WatchDecision {
  const { lead, logs, profile, flag, now } = input;
  const open = flag?.state === "open";

  // Test leads never alert the owner by design.
  if (lead.source === TEST_LEAD_SOURCE) return open ? { action: "resolve", resolution: "alert_sent" } : { action: "none" };

  if (logs.some((row) => row.status === "sent")) {
    return open ? { action: "resolve", resolution: "alert_sent" } : { action: "none" };
  }

  // The owner switched alerts off on purpose: nothing is owed.
  if (profile?.notify_on_lead === false) {
    return open ? { action: "resolve", resolution: "owner_alerts_off" } : { action: "none" };
  }

  if (now - time(lead.created_at) < WATCHDOG_GRACE_MS) return { action: "none" };

  const inbox = profile ? alertInbox(profile) : null;
  if (!inbox) return { action: "flag", problem: "no_alert_inbox", reason: "no_alert_inbox" };

  const failed = logs
    .filter((row) => row.status !== "sent")
    .sort((a, b) => time(b.created_at) - time(a.created_at))[0];
  const reason = failed?.reason ?? null;
  const recipientChanged =
    !!failed?.recipient && failed.recipient.trim().toLowerCase() !== inbox.toLowerCase();

  // A suppressed or missing address stays broken until the owner changes it; a
  // changed inbox is a fresh chance, so it falls through to a retry.
  if (failed && reason && PERMANENT_ALERT_REASONS.has(reason) && !recipientChanged) {
    return { action: "flag", problem: "failed_permanent", reason };
  }

  const attempts = flag?.attempts ?? 0;
  const currentProblem = (flag?.problem ?? "never_attempted") as WatchdogProblem;
  if (attempts >= WATCHDOG_MAX_ATTEMPTS) return { action: "flag", problem: "exhausted", reason };

  const nextAt = time(flag?.next_attempt_at);
  const due = !flag || !Number.isFinite(nextAt) || nextAt <= now || flag.problem === "no_alert_inbox" || flag.problem === "failed_permanent";
  if (!due) return { action: "flag", problem: currentProblem, reason };

  return {
    action: "retry",
    problem: failed ? "failed_retrying" : "never_attempted",
    reason,
    recipient: inbox,
  };
}

/** When the next retry is allowed once `attemptsMade` have been used. */
export function nextAttemptAt(attemptsMade: number, now: number): string | null {
  const wait = WATCHDOG_BACKOFF_MS[attemptsMade];
  return wait === undefined ? null : new Date(now + wait).toISOString();
}

export const PROBLEM_COPY: Record<WatchdogProblem, { owner: string; admin: string }> = {
  never_attempted: {
    owner: "We haven't been able to email you about this lead yet. We're retrying.",
    admin: "No alert attempt was recorded",
  },
  failed_retrying: {
    owner: "The email about this lead didn't go through. We're retrying.",
    admin: "Alert failed, watchdog retrying",
  },
  failed_permanent: {
    owner:
      "Your alert email address is not accepting our emails. Update it in Settings → Lead notifications.",
    admin: "Alert inbox rejects mail (suppressed or missing); needs the owner to change it",
  },
  no_alert_inbox: {
    owner: "You don't have an email address set for lead alerts. Add one in Settings → Lead notifications.",
    admin: "Workspace has no valid alert inbox",
  },
  exhausted: {
    owner:
      "We couldn't email you about this lead after several tries. Check it in Leads and your alert email in Settings.",
    admin: "Retries exhausted; lead still has no accepted alert",
  },
};
