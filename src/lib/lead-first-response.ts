/**
 * Speed to lead, per lead (Lovable round 10, item 6). Browser-safe helpers for
 * leads.first_response_at (stamped by the database when a call, email or text
 * is logged or the lead is marked contacted) and the 5-minute escalation.
 */
import { LEAD_ALERT_EMAIL, type LeadAlertProfile } from "@/lib/lead-alert-recipient";
import { SPEED_GOAL_MINUTES } from "@/lib/speed-to-lead";

/** A lead with no first reply this long after it arrived is escalated. Same goal as the speed card. */
export const ESCALATE_AFTER_MINUTES = SPEED_GOAL_MINUTES;
/** Leads older than this are not escalated (a missed window is not news an hour later). */
export const ESCALATION_WINDOW_MINUTES = 60;

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : null;
};

export type ResponseLead = { created_at: string; first_response_at?: string | null };

export type ResponseStatus =
  | { kind: "answered"; minutes: number; withinGoal: boolean }
  | { kind: "waiting"; minutes: number; overdue: boolean }
  | { kind: "unknown" };

/** How fast this lead was answered, or how long it has waited. */
export function responseStatus(lead: ResponseLead, now: number = Date.now()): ResponseStatus {
  const created = ms(lead.created_at);
  if (created === null) return { kind: "unknown" };
  const first = ms(lead.first_response_at);
  if (first !== null) {
    const minutes = Math.max(0, Math.round((first - created) / 60_000));
    return { kind: "answered", minutes, withinGoal: minutes <= ESCALATE_AFTER_MINUTES };
  }
  const minutes = Math.max(0, Math.floor((now - created) / 60_000));
  return { kind: "waiting", minutes, overdue: minutes >= ESCALATE_AFTER_MINUTES };
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `${Math.floor(hours / 24)}d`;
}

/** Short label for the lead card, e.g. "First reply in 3m" or "Waiting 12m". */
export function responseLabel(status: ResponseStatus): string | null {
  if (status.kind === "answered") return `First reply in ${formatMinutes(status.minutes)}`;
  if (status.kind === "waiting") return `Waiting ${formatMinutes(status.minutes)}`;
  return null;
}

/** Is this lead due for the one-time escalation right now? */
export function dueForEscalation(
  lead: ResponseLead & { response_escalated_at?: string | null; status?: string | null },
  now: number,
): boolean {
  if (lead.first_response_at || lead.response_escalated_at) return false;
  if (lead.status && lead.status !== "new") return false;
  const created = ms(lead.created_at);
  if (created === null) return false;
  const age = now - created;
  return age >= ESCALATE_AFTER_MINUTES * 60_000 && age <= ESCALATION_WINDOW_MINUTES * 60_000;
}

/**
 * Who gets the escalation: every distinct valid inbox on the profile
 * (notification, business, owner), so it reaches a second person when one is
 * set. Nobody when lead alerts are switched off.
 */
export function escalationRecipients(profile: LeadAlertProfile): string[] {
  if (profile.notify_on_lead === false) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of [profile.notification_email, profile.email, profile.owner_email]) {
    const email = typeof value === "string" ? value.trim() : "";
    if (!LEAD_ALERT_EMAIL.test(email) || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return out;
}
