/**
 * 5-minute speed-to-lead escalation (Lovable round 10, item 6).
 *
 * Runs with the lead-delivery watchdog (every 5 minutes, cron-authenticated).
 * A real lead that is 5–60 minutes old, still `new`, with no first_response_at,
 * gets ONE "still waiting" email to every inbox on the business profile. The
 * lead row is claimed (response_escalated_at) before sending, so overlapping
 * runs never send twice. Email only; nothing goes to the lead's visitor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TEST_LEAD_SOURCE } from "@/lib/test-lead";
import {
  ESCALATE_AFTER_MINUTES,
  ESCALATION_WINDOW_MINUTES,
  dueForEscalation,
  escalationRecipients,
  responseStatus,
} from "@/lib/lead-first-response";

type Db = Pick<SupabaseClient, "from">;
type Row = Record<string, unknown>;
type DeliveryResult = { ok: true; skipped?: boolean } | { ok: false; retry: boolean; reason: string };

export type EscalationDeps = {
  sendLeadAlert: (to: string, data: Record<string, unknown>, key: string) => Promise<DeliveryResult>;
  leadUrlFor: (leadId: string) => string;
};

export type EscalationRun = { scanned: number; escalated: number; emailed: number; failed: number; skipped: number };

const MAX_PER_RUN = 100;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function runLeadResponseEscalation(db: Db, deps: EscalationDeps, now = Date.now()): Promise<EscalationRun> {
  const run: EscalationRun = { scanned: 0, escalated: 0, emailed: 0, failed: 0, skipped: 0 };
  const iso = (t: number) => new Date(t).toISOString();
  const { data, error } = await db
    .from("leads")
    .select("id, organization_id, created_at, status, source, name, email, phone, city, service_interest, message, first_response_at, response_escalated_at")
    .is("first_response_at", null)
    .is("response_escalated_at", null)
    .eq("status", "new")
    .neq("source", TEST_LEAD_SOURCE)
    .gte("created_at", iso(now - ESCALATION_WINDOW_MINUTES * 60_000))
    .lte("created_at", iso(now - ESCALATE_AFTER_MINUTES * 60_000))
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) throw new Error(`leads: ${error.message}`);
  const leads = ((data ?? []) as Row[]).filter((l) => dueForEscalation(l as never, now));
  run.scanned = leads.length;
  if (!leads.length) return run;

  const orgIds = [...new Set(leads.map((l) => String(l["organization_id"])))];
  const [{ data: orgs, error: orgError }, { data: profiles, error: profileError }] = await Promise.all([
    db.from("organizations").select("id, name, is_demo, is_suspended").in("id", orgIds),
    db.from("business_profiles").select("organization_id, notification_email, email, owner_email, notify_on_lead").in("organization_id", orgIds),
  ]);
  if (orgError) throw new Error(`organizations: ${orgError.message}`);
  if (profileError) throw new Error(`business_profiles: ${profileError.message}`);
  const orgById = new Map(((orgs ?? []) as Row[]).map((o) => [String(o["id"]), o]));
  const profileByOrg = new Map(((profiles ?? []) as Row[]).map((p) => [String(p["organization_id"]), p]));

  for (const lead of leads) {
    const id = String(lead["id"]);
    const orgId = String(lead["organization_id"]);
    const org = orgById.get(orgId);
    const recipients = escalationRecipients((profileByOrg.get(orgId) ?? {}) as never);
    if (!org || org["is_demo"] === true || org["is_suspended"] === true || !recipients.length) {
      run.skipped += 1;
      continue;
    }
    // Claim first: only the run whose update matched still-unanswered, unescalated row sends.
    const { data: claimed, error: claimError } = await db
      .from("leads")
      .update({ response_escalated_at: iso(now) } as never)
      .eq("id", id)
      .eq("organization_id", orgId)
      .is("first_response_at", null)
      .is("response_escalated_at", null)
      .select("id");
    if (claimError) throw new Error(`claim: ${claimError.message}`);
    if (!claimed?.length) {
      run.skipped += 1;
      continue;
    }
    run.escalated += 1;
    const status = responseStatus(lead as never, now);
    const minutes = status.kind === "waiting" ? status.minutes : ESCALATE_AFTER_MINUTES;
    const data = {
      businessName: str(org["name"]),
      kind: `Still waiting ${minutes} min, no reply yet`,
      leadName: str(lead["name"]) ?? "A new lead",
      leadEmail: str(lead["email"]),
      leadPhone: str(lead["phone"]),
      city: str(lead["city"]),
      service: str(lead["service_interest"]),
      message: str(lead["message"]),
      leadUrl: deps.leadUrlFor(id),
    };
    for (const to of recipients) {
      const result = await deps.sendLeadAlert(to, data, `lead-escalation-${id}-${to.toLowerCase()}`);
      if (result.ok) run.emailed += 1;
      else {
        run.failed += 1;
        console.error("[lead-escalation] send failed", result.reason);
      }
    }
  }
  return run;
}
