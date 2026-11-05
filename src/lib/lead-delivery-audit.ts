import { alertInbox, LEAD_ALERT_EMAIL, type LeadAlertProfile } from "@/lib/lead-alert-recipient";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";

/**
 * Lead-delivery routing audit. Pure and browser-safe.
 *
 * The runtime watchdog (lead-delivery-watchdog.ts) asks "did an owner alert get
 * accepted, and if not, retry it". This audit asks the independent question:
 * "did every accepted form reach the RIGHT workspace and the RIGHT recipient".
 * It reads stored rows only (leads, lead_alert_log, lead_delivery_logs,
 * business_profiles, website_settings, lead_delivery_watch), sends nothing and
 * writes nothing, so it can be run from tests, from /admin or from a script
 * without ever touching a customer.
 *
 * Findings never carry a lead's name, email or phone. A recipient address is
 * shown masked ("o***@acme.test"), enough for an admin to recognise it.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Looks back as far as the watchdog does. */
export const AUDIT_LOOKBACK_MS = 72 * HOUR;
/** The submit path sends the alert inline and the watchdog retries after 5 minutes; give both a full cycle before calling a lead unrouted. */
export const AUDIT_GRACE_MS = 20 * MINUTE;
/**
 * Webhook attempts made before `pickWebhookRetries` stops retrying (the inline
 * attempt plus one per backoff step). Kept in step with
 * WEBHOOK_RETRY_BACKOFF_MS by lead-delivery-audit.test.ts.
 */
export const AUDIT_WEBHOOK_MAX_ATTEMPTS = 6;

export type AuditKind =
  | "alert_wrong_workspace"
  | "alert_wrong_recipient"
  | "alert_missing"
  | "alert_failed"
  | "no_alert_inbox"
  | "webhook_wrong_workspace"
  | "webhook_missing"
  | "webhook_failed";

export type AuditSeverity = "critical" | "high" | "medium";

export type AuditLead = { id: string; organization_id: string; created_at: string; source: string | null };
export type AuditOrg = { id: string; name: string | null; is_demo?: boolean | null; is_suspended?: boolean | null };
export type AuditProfile = LeadAlertProfile & { organization_id: string; updated_at?: string | null };
export type AuditAlertRow = {
  lead_id: string | null;
  organization_id: string;
  recipient: string | null;
  status: string;
  reason: string | null;
  created_at: string;
};
export type AuditWebhookRow = {
  lead_id: string;
  organization_id: string;
  delivery_status: string;
  retryable: boolean | null;
  reason: string | null;
  attempted_at: string;
};
/** Whether a workspace routes leads to a webhook, and when that setting last changed (so older leads are not judged against it). */
export type AuditWebhookConfig = { organization_id: string; configured: boolean; updated_at?: string | null };
export type AuditWatchRow = { lead_id: string; state: string };

export type AuditInput = {
  leads: readonly AuditLead[];
  orgs: readonly AuditOrg[];
  profiles: readonly AuditProfile[];
  alertRows: readonly AuditAlertRow[];
  /** null = the lead_delivery_logs table is not available in this database yet; webhook checks are then reported as skipped, never as a pass. */
  webhookRows: readonly AuditWebhookRow[] | null;
  webhookConfigs: readonly AuditWebhookConfig[];
  /** null = the watchdog table is not available; findings then cannot say whether the watchdog already covers them. */
  watchRows: readonly AuditWatchRow[] | null;
  now: number;
};

export type AuditFinding = {
  kind: AuditKind;
  severity: AuditSeverity;
  leadId: string;
  organizationId: string;
  workspace: string;
  leadCreatedAt: string;
  /** Plain-language explanation with any address masked. */
  detail: string;
  /** True when the runtime watchdog already has an open flag on this lead. */
  watchdogOpen: boolean;
};

export type AuditReport = {
  checkedAt: string;
  leadsChecked: number;
  alertRowsChecked: number;
  webhookRowsChecked: number | null;
  /** Webhook routing could not be checked (table missing); never a pass. */
  webhookSkipped: boolean;
  findings: AuditFinding[];
  counts: Record<AuditSeverity, number>;
  /** No finding at all, over at least one checked lead. */
  clean: boolean;
};

export const AUDIT_KIND_COPY: Record<AuditKind, string> = {
  alert_wrong_workspace: "Alert recorded under a different workspace than the lead",
  alert_wrong_recipient: "Alert went to an address that is not this workspace's alert inbox",
  alert_missing: "No alert attempt recorded for this lead",
  alert_failed: "Every alert attempt failed",
  no_alert_inbox: "Workspace has alerts on but no valid alert inbox",
  webhook_wrong_workspace: "Webhook delivery recorded under a different workspace than the lead",
  webhook_missing: "Workspace has a lead webhook but no delivery was recorded",
  webhook_failed: "Lead webhook was never delivered",
};

const SEVERITY_ORDER: Record<AuditSeverity, number> = { critical: 0, high: 1, medium: 2 };

const time = (value: string | null | undefined) => (value ? Date.parse(value) : Number.NaN);
const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** "owner@acme.test" -> "o***@acme.test". Anything that is not an address is described, not echoed. */
export function maskAddress(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!LEAD_ALERT_EMAIL.test(v)) return v ? "an invalid address" : "no address";
  const at = v.lastIndexOf("@");
  return `${v.slice(0, 1)}***${v.slice(at)}`;
}

function candidateAddresses(profile: LeadAlertProfile | undefined): Set<string> {
  const out = new Set<string>();
  if (!profile) return out;
  for (const value of [profile.notification_email, profile.email, profile.owner_email]) {
    const v = norm(value);
    if (LEAD_ALERT_EMAIL.test(v)) out.add(v);
  }
  return out;
}

export function auditLeadDelivery(input: AuditInput): AuditReport {
  const { now } = input;
  const orgs = new Map(input.orgs.map((o) => [o.id, o]));
  const profiles = new Map(input.profiles.map((p) => [p.organization_id, p]));
  const webhookConfigs = new Map(input.webhookConfigs.map((c) => [c.organization_id, c]));
  const openFlags = new Set((input.watchRows ?? []).filter((r) => r.state === "open").map((r) => r.lead_id));

  // Which workspaces use each address, so a recipient that belongs to ANOTHER workspace is called out.
  const addressOwners = new Map<string, Set<string>>();
  for (const profile of input.profiles)
    for (const address of candidateAddresses(profile)) {
      const set = addressOwners.get(address) ?? new Set<string>();
      set.add(profile.organization_id);
      addressOwners.set(address, set);
    }

  const alertsByLead = new Map<string, AuditAlertRow[]>();
  for (const row of input.alertRows) {
    if (!row.lead_id) continue;
    alertsByLead.set(row.lead_id, [...(alertsByLead.get(row.lead_id) ?? []), row]);
  }
  const webhooksByLead = new Map<string, AuditWebhookRow[]>();
  for (const row of input.webhookRows ?? [])
    webhooksByLead.set(row.lead_id, [...(webhooksByLead.get(row.lead_id) ?? []), row]);

  const findings: AuditFinding[] = [];
  let leadsChecked = 0;

  for (const lead of input.leads) {
    // Test leads are never alerted, never counted: out of this audit by design.
    if (lead.source === TEST_LEAD_SOURCE) continue;
    const org = orgs.get(lead.organization_id);
    if (!org || org.is_demo === true || org.is_suspended === true) continue;
    leadsChecked += 1;

    const workspace = org.name?.trim() || "Workspace";
    const age = now - time(lead.created_at);
    const pastGrace = Number.isFinite(age) && age >= AUDIT_GRACE_MS;
    const profile = profiles.get(lead.organization_id);
    const watchdogOpen = openFlags.has(lead.id);
    const add = (kind: AuditKind, severity: AuditSeverity, detail: string) =>
      findings.push({
        kind,
        severity,
        leadId: lead.id,
        organizationId: lead.organization_id,
        workspace,
        leadCreatedAt: lead.created_at,
        detail,
        watchdogOpen,
      });

    // ---- Owner alert ------------------------------------------------------
    const allAlertRows = alertsByLead.get(lead.id) ?? [];
    const foreignAlerts = allAlertRows.filter((r) => r.organization_id !== lead.organization_id);
    const ownAlerts = allAlertRows.filter((r) => r.organization_id === lead.organization_id);

    if (foreignAlerts.length > 0) {
      add(
        "alert_wrong_workspace",
        "critical",
        `${foreignAlerts.length} alert log row${foreignAlerts.length === 1 ? "" : "s"} for this lead sit under a different workspace (${foreignAlerts
          .map((r) => r.status)
          .join(", ")}).`,
      );
    }

    const expected = profile ? alertInbox(profile) : null;
    const own = candidateAddresses(profile);

    // Wrong recipient: every attempt must have gone to this workspace's alert inbox.
    const reported = new Set<string>();
    for (const row of ownAlerts) {
      const to = norm(row.recipient);
      if (!to || (expected && to === expected) || reported.has(to)) continue;
      reported.add(to);
      const profileChangedSince = time(profile?.updated_at) > time(row.created_at);
      const owners = addressOwners.get(to);
      const foreign = !!owners && !owners.has(lead.organization_id);
      if (foreign) {
        add("alert_wrong_recipient", "critical", `Alert (${row.status}) went to ${maskAddress(to)}, which is another workspace's address.`);
      } else if (profileChangedSince) {
        add(
          "alert_wrong_recipient",
          "medium",
          `Alert (${row.status}) went to ${maskAddress(to)}; the workspace's contact settings changed afterwards, so confirm that was the inbox at the time.`,
        );
      } else if (own.has(to)) {
        add(
          "alert_wrong_recipient",
          "high",
          `Alert (${row.status}) went to ${maskAddress(to)}, but the workspace's alert inbox is ${maskAddress(expected)}.`,
        );
      } else {
        add(
          "alert_wrong_recipient",
          "critical",
          `Alert (${row.status}) went to ${maskAddress(to)}, which is not any address on this workspace.`,
        );
      }
    }

    // Missing / failed / no inbox: only once the grace period has passed and the owner wants alerts.
    if (pastGrace && profile?.notify_on_lead !== false && !ownAlerts.some((r) => r.status === "sent")) {
      if (!expected) {
        add("no_alert_inbox", "high", "Alerts are on but no notification, contact or owner email is a valid address.");
      } else if (ownAlerts.length === 0) {
        add("alert_missing", "high", `No alert attempt to ${maskAddress(expected)} is recorded.`);
      } else {
        const last = [...ownAlerts].sort((a, b) => time(b.created_at) - time(a.created_at))[0]!;
        add(
          "alert_failed",
          "high",
          `${ownAlerts.length} attempt${ownAlerts.length === 1 ? "" : "s"}, none accepted${last.reason ? ` (last: ${last.reason})` : ""}.`,
        );
      }
    }

    // ---- Lead webhook -----------------------------------------------------
    if (input.webhookRows === null) continue;
    const allHooks = webhooksByLead.get(lead.id) ?? [];
    const foreignHooks = allHooks.filter((r) => r.organization_id !== lead.organization_id);
    const ownHooks = allHooks.filter((r) => r.organization_id === lead.organization_id);
    if (foreignHooks.length > 0) {
      add(
        "webhook_wrong_workspace",
        "critical",
        `${foreignHooks.length} webhook delivery row${foreignHooks.length === 1 ? "" : "s"} for this lead sit under a different workspace.`,
      );
    }
    const config = webhookConfigs.get(lead.organization_id);
    // A webhook added after the lead arrived was never owed that lead.
    const configuredBefore = config?.configured === true && !(time(config.updated_at) > time(lead.created_at));
    if (pastGrace && configuredBefore && !ownHooks.some((r) => r.delivery_status === "delivered")) {
      const failures = ownHooks.filter((r) => r.delivery_status === "failed");
      if (ownHooks.length === 0) {
        add("webhook_missing", "high", "The workspace routes leads to a webhook, but no delivery attempt was recorded.");
      } else if (failures.length > 0) {
        const newest = [...failures].sort((a, b) => time(b.attempted_at) - time(a.attempted_at))[0]!;
        const stillRetrying = newest.retryable === true && failures.length < AUDIT_WEBHOOK_MAX_ATTEMPTS;
        // A transient failure the retry sweep is still working on is not yet a failure of routing.
        if (!stillRetrying) {
          add(
            "webhook_failed",
            "high",
            `${failures.length} attempt${failures.length === 1 ? "" : "s"} failed${newest.reason ? ` (last: ${newest.reason})` : ""}${newest.retryable === true ? "; retries are used up" : "; not retryable"}.`,
          );
        }
      }
    }
  }

  findings.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      time(b.leadCreatedAt) - time(a.leadCreatedAt) ||
      a.kind.localeCompare(b.kind),
  );
  const counts: Record<AuditSeverity, number> = { critical: 0, high: 0, medium: 0 };
  for (const f of findings) counts[f.severity] += 1;

  return {
    checkedAt: new Date(now).toISOString(),
    leadsChecked,
    alertRowsChecked: input.alertRows.length,
    webhookRowsChecked: input.webhookRows ? input.webhookRows.length : null,
    webhookSkipped: input.webhookRows === null,
    findings,
    counts,
    clean: leadsChecked > 0 && findings.length === 0,
  };
}
