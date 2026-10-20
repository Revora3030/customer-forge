import type { SupabaseClient } from "@supabase/supabase-js";
import { isDoNotContact, normalizeEmail, normalizePhone, type OutreachChannel, type OutreachMode } from "@/lib/prospect-outreach.server";

/**
 * The outreach send queue. Autopilot sends are spaced out instead of going
 * in a burst: each new item waits a random 0-20 minutes after the latest one
 * already waiting (not_before), and the prospect-replies job (every 10
 * minutes) drains what is due. Manual sends stay immediate and skip the queue.
 *
 * Claims are leases (claim_prospect_send_queue: UPDATE ... RETURNING with
 * FOR UPDATE SKIP LOCKED), so two overlapping drains never send the same
 * item, and a drain that died mid-send frees its items when the lease ends.
 * Every send still goes through sendDemoOutreach, which re-checks
 * do-not-contact, caps, the launch gate and one-send-per-channel.
 * Transient provider errors back off exponentially, at most MAX_QUEUE_ATTEMPTS.
 */

export const MAX_SPACING_MINUTES = 20;
export const MAX_QUEUE_ATTEMPTS = 3;
export const DRAIN_BATCH = 3;
export const LEASE_SECONDS = 300;

export type EnqueueOutreachItem = {
  organizationId: string;
  channel: OutreachChannel;
  to: string;
  subject?: string | null;
  body?: string | null;
  mode?: OutreachMode;
  /** Exact time; otherwise a random 0-20 minute gap after the latest waiting item. */
  notBefore?: Date;
};

export type EnqueueResult = { ok: true; id: string | null; notBefore: string; duplicate: boolean } | { ok: false; reason: string };

export type QueueRow = {
  id: string;
  organization_id: string;
  channel: OutreachChannel;
  recipient: string;
  subject: string | null;
  body: string | null;
  mode: OutreachMode;
  not_before: string;
  attempts: number;
  status: "queued" | "sent" | "failed" | "cancelled";
  last_error: string | null;
  leased_until: string | null;
  lease_owner: string | null;
};

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function randomSpacingMs(random: () => number = Math.random): number {
  return Math.floor(Math.max(0, Math.min(0.999999, random())) * (MAX_SPACING_MINUTES * 60_000 + 1));
}

export async function enqueueOutreach(
  db: SupabaseClient,
  item: EnqueueOutreachItem,
  options: { now?: Date; random?: () => number } = {},
): Promise<EnqueueResult> {
  if (!ORG_ID.test(item.organizationId) || (item.channel !== "email" && item.channel !== "sms")) return { ok: false, reason: "invalid_request" };
  const recipient = item.channel === "email" ? normalizeEmail(item.to) : normalizePhone(item.to);
  if (!recipient) return { ok: false, reason: "invalid_recipient" };
  if (await isDoNotContact(db, recipient)) return { ok: false, reason: "do_not_contact" };
  const now = options.now ?? new Date();
  let notBefore = item.notBefore;
  if (!notBefore) {
    const { data } = await db
      .from("prospect_send_queue")
      .select("not_before")
      .eq("status", "queued")
      .order("not_before", { ascending: false })
      .limit(1);
    const latest = Date.parse(String((data as Array<{ not_before?: string }> | null)?.[0]?.not_before ?? ""));
    const base = Number.isFinite(latest) && latest > now.getTime() ? latest : now.getTime();
    notBefore = new Date(base + randomSpacingMs(options.random));
  }
  const id = crypto.randomUUID();
  const { error } = await db.from("prospect_send_queue").insert({
    id,
    organization_id: item.organizationId,
    channel: item.channel,
    recipient,
    subject: item.subject?.trim() || null,
    body: item.body?.trim() || null,
    mode: item.mode ?? "autopilot",
    not_before: notBefore.toISOString(),
    status: "queued",
    attempts: 0,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: true, id: null, notBefore: notBefore.toISOString(), duplicate: true };
    return { ok: false, reason: "storage_error" };
  }
  return { ok: true, id, notBefore: notBefore.toISOString(), duplicate: false };
}

/** Leases up to `limit` due items for `owner`. Rows another drain holds are never returned. */
export async function claimQueuedOutreach(db: SupabaseClient, owner: string, limit = DRAIN_BATCH): Promise<QueueRow[]> {
  const { data, error } = await db.rpc("claim_prospect_send_queue", { p_owner: owner, p_limit: limit, p_lease_seconds: LEASE_SECONDS });
  if (error) throw new Error(`Couldn't claim queued outreach: ${error.message}`);
  return (Array.isArray(data) ? data : []) as QueueRow[];
}

/** Provider or storage trouble that may clear on its own: retried with backoff. */
export const TRANSIENT_SEND_REASONS = new Set(["rate_limited", "gmail_unavailable", "storage_error", "email_error_500", "email_error_502", "email_error_503"]);
/** "Not right now": rescheduled without spending an attempt. */
export const WAIT_SEND_REASONS = new Set(["quiet_hours", "daily_cap"]);
/** The send must never happen (or may already have): cancelled. unconfirmed_transport is recorded as sent. */
export const CANCEL_SEND_REASONS = new Set(["do_not_contact", "already_sent", "unconfirmed_transport", "demo_claimed", "recipient_suppressed", "recipient_opted_out", "no_consent", "quality_gate", "demo_not_found"]);

export const queueBackoffMs = (attempts: number) => 5 * 60_000 * 2 ** Math.max(0, attempts - 1);

const nextUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5));

export type DrainSummary = { claimed: number; sent: number; retried: number; failed: number; cancelled: number };

/** Sends what is due. Returns counts; never throws for one item's failure. */
export async function drainSendQueue(
  db: SupabaseClient,
  options: { owner?: string; limit?: number; now?: () => Date } = {},
): Promise<DrainSummary> {
  const now = options.now ?? (() => new Date());
  const owner = options.owner ?? `drain-${crypto.randomUUID()}`;
  const summary: DrainSummary = { claimed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0 };
  const rows = await claimQueuedOutreach(db, owner, options.limit ?? DRAIN_BATCH);
  summary.claimed = rows.length;
  if (!rows.length) return summary;
  const { sendDemoOutreach } = await import("@/lib/prospect-outreach.server");
  // The owner's autopilot switches are re-read at send time: turning autopilot
  // (or one channel) off stops already-queued automatic sends too. They wait
  // rather than being cancelled, so switching it back on resumes them.
  const switches = rows.some((row) => row.mode === "autopilot") ? await readAutopilotSwitches(db) : null;
  for (const row of rows) {
    const finish = (patch: Record<string, unknown>) =>
      db
        .from("prospect_send_queue")
        .update({ ...patch, leased_until: null, lease_owner: null, updated_at: now().toISOString() })
        .eq("id", row.id)
        .eq("lease_owner", owner);
    if (row.mode === "autopilot" && !autopilotChannelAllowed(switches, row.channel)) {
      summary.retried += 1;
      await finish({ not_before: new Date(now().getTime() + 60 * 60_000).toISOString(), attempts: Math.max(0, row.attempts - 1), last_error: "autopilot_paused" });
      continue;
    }
    let result;
    try {
      result = await sendDemoOutreach(db, {
        organizationId: row.organization_id,
        channel: row.channel,
        to: row.recipient,
        mode: row.mode,
        actorId: null,
        ...(row.subject ? { subject: row.subject } : {}),
        ...(row.body ? { body: row.body } : {}),
      });
    } catch (error) {
      result = { ok: false as const, reason: "storage_error", message: error instanceof Error ? error.message : "send failed" };
    }
    if (result.ok) {
      summary.sent += 1;
      await finish({ status: "sent", outreach_id: result.outreachId, last_error: null });
    } else if (WAIT_SEND_REASONS.has(result.reason)) {
      summary.retried += 1;
      const at = result.reason === "daily_cap" ? nextUtcDay(now()) : new Date(now().getTime() + 60 * 60_000);
      await finish({ not_before: at.toISOString(), attempts: Math.max(0, row.attempts - 1), last_error: result.reason });
    } else if (TRANSIENT_SEND_REASONS.has(result.reason) && row.attempts < MAX_QUEUE_ATTEMPTS) {
      summary.retried += 1;
      await finish({ not_before: new Date(now().getTime() + queueBackoffMs(row.attempts)).toISOString(), last_error: result.reason });
    } else if (CANCEL_SEND_REASONS.has(result.reason)) {
      summary.cancelled += 1;
      await finish({ status: "cancelled", last_error: result.reason });
    } else {
      summary.failed += 1;
      await finish({ status: "failed", last_error: result.reason });
    }
  }
  return summary;
}

/** Cancels every waiting send to an organization (a STOP reply, a claim). */
export async function cancelQueuedOutreach(db: SupabaseClient, organizationId: string, reason: string): Promise<void> {
  await db
    .from("prospect_send_queue")
    .update({ status: "cancelled", last_error: reason.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("status", "queued");
}

export type AutopilotSwitches = { enabled: boolean; sendEmail: boolean; sendSms: boolean };

/** Unreadable settings count as "off": an automatic send never goes out on a guess. */
export async function readAutopilotSwitches(db: SupabaseClient): Promise<AutopilotSwitches> {
  try {
    const { data, error } = await db.from("prospect_autopilot_settings").select("enabled, send_email, send_sms").eq("id", 1).maybeSingle();
    if (error || !data) return { enabled: false, sendEmail: false, sendSms: false };
    const row = data as { enabled?: unknown; send_email?: unknown; send_sms?: unknown };
    return { enabled: row.enabled === true, sendEmail: row.send_email === true, sendSms: row.send_sms === true };
  } catch {
    return { enabled: false, sendEmail: false, sendSms: false };
  }
}

export function autopilotChannelAllowed(switches: AutopilotSwitches | null, channel: string): boolean {
  if (!switches?.enabled) return false;
  return channel === "sms" ? switches.sendSms : channel === "email" ? switches.sendEmail : false;
}
