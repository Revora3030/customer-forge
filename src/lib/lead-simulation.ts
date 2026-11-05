/**
 * B12-3 in-chat lead simulation: the checklist the owner sees after sending
 * one labeled test lead through the real lead path. Pure and browser-safe.
 *
 * Every line is read from a stored row (the lead, its alert log row, its
 * webhook delivery log row). Nothing is assumed: a missing row is "not found",
 * a failed send shows as failed.
 */

export type SimulationStatus = "pass" | "fail" | "skipped";

export type SimulationCheck = {
  key: "validation" | "lead_saved" | "owner_alert" | "alert_latency" | "webhook" | "kept_out";
  label: string;
  status: SimulationStatus;
  detail: string;
};

export type SimulationRows = {
  validationError: string | null;
  lead: { id: string; status: string | null; source: string | null; created_at: string } | null;
  /** Newest lead_alert_log row for the test lead, if any. */
  alertLog: { status: string; reason: string | null; recipient: string | null; created_at: string } | null;
  /** Whether the workspace has an alert inbox with alerts on. */
  alertConfigured: boolean;
  /** Newest lead_delivery_logs row for the test lead, if any. */
  webhookLog: { delivery_status: string; http_status: number | null; reason: string | null; attempted_at: string } | null;
  webhookConfigured: boolean;
  testSource: string;
};

/** Milliseconds from the lead row being created to the alert being accepted, or null. */
export function alertLatencyMs(leadCreatedAt: string | null | undefined, alertLoggedAt: string | null | undefined): number | null {
  if (!leadCreatedAt || !alertLoggedAt) return null;
  const start = Date.parse(leadCreatedAt);
  const end = Date.parse(alertLoggedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

const REASONS: Record<string, string> = {
  no_email_address: "no alert inbox is set up",
  recipient_suppressed: "the alert inbox is blocked by the email provider (earlier bounce or complaint)",
  email_not_configured: "email sending is not set up on Revora yet",
  not_configured: "no webhook is set up",
  invalid_webhook_url: "the webhook address is not a valid https URL",
  unsafe_webhook_target: "the webhook address points somewhere we can't send to",
  timeout: "the webhook did not answer within 5 seconds",
  webhook_transport_error: "the webhook could not be reached",
};

export function reasonText(reason: string | null | undefined): string {
  if (!reason) return "no reason given";
  if (REASONS[reason]) return REASONS[reason];
  const http = /^http_(\d{3})$/.exec(reason);
  if (http) return `the webhook answered HTTP ${http[1]}`;
  return reason.replace(/_/g, " ");
}

export function buildSimulationChecklist(rows: SimulationRows): SimulationCheck[] {
  const checks: SimulationCheck[] = [];
  checks.push(
    rows.validationError
      ? { key: "validation", label: "Form checks", status: "fail", detail: rows.validationError }
      : { key: "validation", label: "Form checks", status: "pass", detail: "Passed the same checks your website form uses." },
  );
  if (rows.validationError) return checks;

  const lead = rows.lead;
  if (!lead) {
    checks.push({ key: "lead_saved", label: "Lead saved", status: "fail", detail: "No lead row was found after sending." });
    return checks;
  }
  const isNew = (lead.status ?? "").toLowerCase() === "new";
  checks.push({
    key: "lead_saved",
    label: "Lead saved",
    status: isNew ? "pass" : "fail",
    detail: isNew ? "Saved in Leads with stage New." : `Saved, but stage is "${lead.status ?? "empty"}" instead of New.`,
  });

  const alert = rows.alertLog;
  if (!rows.alertConfigured) {
    checks.push({
      key: "owner_alert",
      label: "Alert to you",
      status: "skipped",
      detail: "No alert inbox is set up (or lead alerts are off), so no email was sent. Add one in Settings to get alerts.",
    });
  } else if (!alert) {
    checks.push({ key: "owner_alert", label: "Alert to you", status: "fail", detail: "No alert record was found for this lead." });
  } else if (alert.status === "sent") {
    checks.push({
      key: "owner_alert",
      label: "Alert to you",
      status: "pass",
      detail: `Email provider accepted the alert to ${alert.recipient ?? "your inbox"}.`,
    });
  } else {
    checks.push({
      key: "owner_alert",
      label: "Alert to you",
      status: "fail",
      detail: `Alert not sent: ${reasonText(alert.reason)}.`,
    });
  }

  const latency = alert?.status === "sent" ? alertLatencyMs(lead.created_at, alert.created_at) : null;
  if (latency !== null) {
    checks.push({
      key: "alert_latency",
      label: "Alert speed",
      status: "pass",
      detail: `Alert accepted ${formatLatency(latency)} after the lead was saved.`,
    });
  }

  const hook = rows.webhookLog;
  if (!rows.webhookConfigured) {
    checks.push({ key: "webhook", label: "Webhook", status: "skipped", detail: "No webhook is set up, so nothing was sent." });
  } else if (!hook) {
    checks.push({ key: "webhook", label: "Webhook", status: "fail", detail: "No webhook delivery record was found." });
  } else if (hook.delivery_status === "delivered") {
    checks.push({ key: "webhook", label: "Webhook", status: "pass", detail: "Your webhook accepted the test lead (marked as a test)." });
  } else if (hook.delivery_status === "skipped") {
    checks.push({ key: "webhook", label: "Webhook", status: "skipped", detail: "Webhook was skipped." });
  } else {
    checks.push({ key: "webhook", label: "Webhook", status: "fail", detail: `Webhook failed: ${reasonText(hook.reason)}.` });
  }

  const keptOut = lead.source === rows.testSource;
  checks.push({
    key: "kept_out",
    label: "Kept out of your numbers",
    status: keptOut ? "pass" : "fail",
    detail: keptOut ? "Labeled TEST, so reports and counts skip it." : "This lead is not labeled as a test.",
  });
  return checks;
}

export function simulationPassed(checks: SimulationCheck[]): boolean {
  return checks.every((check) => check.status !== "fail");
}
