import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_GRACE_MS,
  AUDIT_WEBHOOK_MAX_ATTEMPTS,
  auditLeadDelivery,
  maskAddress,
  type AuditAlertRow,
  type AuditInput,
  type AuditWebhookRow,
} from "@/lib/lead-delivery-audit";
import { WEBHOOK_RETRY_BACKOFF_MS } from "@/lib/lead-webhook-retry.server";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const mins = (m: number) => new Date(NOW - m * 60_000).toISOString();
const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const LEAD = "11111111-1111-4111-8111-111111111111";

const alert = (over: Partial<AuditAlertRow> = {}): AuditAlertRow => ({
  lead_id: LEAD,
  organization_id: ORG_A,
  recipient: "owner@acme.test",
  status: "sent",
  reason: null,
  created_at: mins(58),
  ...over,
});
const hook = (over: Partial<AuditWebhookRow> = {}): AuditWebhookRow => ({
  lead_id: LEAD,
  organization_id: ORG_A,
  delivery_status: "delivered",
  retryable: false,
  reason: null,
  attempted_at: mins(58),
  ...over,
});

/** A healthy baseline: one real lead, alert accepted by the workspace's own inbox, webhook delivered. */
const base = (over: Partial<AuditInput> = {}): AuditInput => ({
  leads: [{ id: LEAD, organization_id: ORG_A, created_at: mins(60), source: "website" }],
  orgs: [
    { id: ORG_A, name: "Acme Plumbing" },
    { id: ORG_B, name: "Bravo Roofing" },
  ],
  profiles: [
    { organization_id: ORG_A, notification_email: "owner@acme.test", notify_on_lead: true, updated_at: mins(10_000) },
    { organization_id: ORG_B, notification_email: "boss@bravo.test", notify_on_lead: true, updated_at: mins(10_000) },
  ],
  alertRows: [alert()],
  webhookRows: [hook()],
  webhookConfigs: [{ organization_id: ORG_A, configured: true, updated_at: mins(10_000) }],
  watchRows: [],
  now: NOW,
  ...over,
});
const kinds = (input: AuditInput) => auditLeadDelivery(input).findings.map((f) => `${f.kind}:${f.severity}`);

describe("auditLeadDelivery: a correctly routed lead", () => {
  it("is clean, and says how much it verified", () => {
    const report = auditLeadDelivery(base());
    expect(report.findings).toEqual([]);
    expect(report.clean).toBe(true);
    expect(report).toMatchObject({ leadsChecked: 1, alertRowsChecked: 1, webhookRowsChecked: 1, webhookSkipped: false });
  });

  it("is not 'clean' when there was nothing to verify", () => {
    expect(auditLeadDelivery(base({ leads: [] })).clean).toBe(false);
  });

  it("accepts the same inbox in a different letter case", () => {
    expect(kinds(base({ alertRows: [alert({ recipient: " Owner@Acme.TEST " })] }))).toEqual([]);
  });

  it("falls back through email and owner_email exactly like the sender does", () => {
    const input = base({
      profiles: [{ organization_id: ORG_A, notification_email: null, email: "front@acme.test", owner_email: "own@acme.test", notify_on_lead: true }],
      alertRows: [alert({ recipient: "front@acme.test" })],
    });
    expect(kinds(input)).toEqual([]);
  });
});

describe("auditLeadDelivery: wrong workspace", () => {
  it("fails an alert row that belongs to a different workspace than the lead", () => {
    const input = base({ alertRows: [alert({ organization_id: ORG_B })] });
    const report = auditLeadDelivery(input);
    expect(report.findings.map((f) => f.kind)).toContain("alert_wrong_workspace");
    expect(report.findings.find((f) => f.kind === "alert_wrong_workspace")).toMatchObject({
      severity: "critical",
      organizationId: ORG_A,
      workspace: "Acme Plumbing",
    });
    expect(report.counts.critical).toBeGreaterThan(0);
  });

  it("does not let a foreign 'sent' row count as the lead's own accepted alert", () => {
    // Only a row under the other workspace exists: the lead's own workspace has no alert at all.
    expect(kinds(base({ alertRows: [alert({ organization_id: ORG_B, recipient: "boss@bravo.test" })] }))).toEqual(
      expect.arrayContaining(["alert_wrong_workspace:critical", "alert_missing:high"]),
    );
  });

  it("fails a webhook delivery row filed under a different workspace", () => {
    const found = kinds(base({ webhookRows: [hook({ organization_id: ORG_B })] }));
    expect(found).toContain("webhook_wrong_workspace:critical");
    // ...and the lead's own workspace still has no delivery.
    expect(found).toContain("webhook_missing:high");
  });
});

describe("auditLeadDelivery: wrong recipient", () => {
  it("fails an alert sent to another workspace's inbox as critical, naming it as foreign", () => {
    const report = auditLeadDelivery(base({ alertRows: [alert({ recipient: "boss@bravo.test" })] }));
    const f = report.findings.find((x) => x.kind === "alert_wrong_recipient")!;
    expect(f.severity).toBe("critical");
    expect(f.detail).toContain("another workspace");
    expect(f.detail).not.toContain("boss@bravo.test");
    expect(f.detail).toContain("b***@bravo.test");
  });

  it("fails an alert sent to an address that is on no workspace", () => {
    const f = auditLeadDelivery(base({ alertRows: [alert({ recipient: "stranger@elsewhere.test" })] })).findings.find(
      (x) => x.kind === "alert_wrong_recipient",
    )!;
    expect(f.severity).toBe("critical");
    expect(f.detail).toContain("not any address on this workspace");
  });

  it("flags an alert sent to a secondary workspace address instead of the alert inbox as high", () => {
    const input = base({
      profiles: [{ organization_id: ORG_A, notification_email: "owner@acme.test", email: "front@acme.test", notify_on_lead: true, updated_at: mins(10_000) }],
      alertRows: [alert({ recipient: "front@acme.test" })],
    });
    expect(kinds(input)).toEqual(["alert_wrong_recipient:high"]);
  });

  it("downgrades to medium, not silence, when the contact settings changed after the alert", () => {
    const input = base({
      profiles: [{ organization_id: ORG_A, notification_email: "new@acme.test", notify_on_lead: true, updated_at: mins(5) }],
      alertRows: [alert({ recipient: "old@acme.test", created_at: mins(58) })],
    });
    expect(kinds(input)).toContain("alert_wrong_recipient:medium");
  });

  it("still calls a foreign address critical even if settings changed afterwards", () => {
    const input = base({
      profiles: [
        { organization_id: ORG_A, notification_email: "owner@acme.test", notify_on_lead: true, updated_at: mins(5) },
        { organization_id: ORG_B, notification_email: "boss@bravo.test", notify_on_lead: true },
      ],
      alertRows: [alert({ recipient: "boss@bravo.test" })],
    });
    expect(kinds(input)).toContain("alert_wrong_recipient:critical");
  });

  it("tolerates two workspaces legitimately sharing one owner address", () => {
    const input = base({
      profiles: [
        { organization_id: ORG_A, notification_email: "shared@owner.test", notify_on_lead: true },
        { organization_id: ORG_B, notification_email: "shared@owner.test", notify_on_lead: true },
      ],
      alertRows: [alert({ recipient: "shared@owner.test" })],
    });
    expect(kinds(input)).toEqual([]);
  });
});

describe("auditLeadDelivery: missing and failed delivery", () => {
  it("fails a lead past the grace period with no alert attempt", () => {
    expect(kinds(base({ alertRows: [] }))).toEqual(["alert_missing:high"]);
  });

  it("waits out the grace period before calling it missing", () => {
    const young = base({
      alertRows: [],
      webhookRows: [],
      leads: [{ id: LEAD, organization_id: ORG_A, created_at: new Date(NOW - (AUDIT_GRACE_MS - 1000)).toISOString(), source: "website" }],
    });
    expect(kinds(young)).toEqual([]);
  });

  it("fails when every alert attempt failed, with the reason and no address", () => {
    const report = auditLeadDelivery(base({ alertRows: [alert({ status: "failed", reason: "recipient_suppressed" })] }));
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ kind: "alert_failed", severity: "high" });
    expect(report.findings[0]!.detail).toContain("recipient_suppressed");
  });

  it("passes once any attempt for the lead's own workspace was accepted", () => {
    expect(kinds(base({ alertRows: [alert({ status: "failed", reason: "x", created_at: mins(55) }), alert({ created_at: mins(40) })] }))).toEqual([]);
  });

  it("fails a workspace with alerts on and no valid alert inbox", () => {
    const input = base({
      alertRows: [],
      profiles: [{ organization_id: ORG_A, notification_email: "not an email", email: null, owner_email: "", notify_on_lead: true }],
    });
    expect(kinds(input)).toEqual(["no_alert_inbox:high"]);
  });

  it("owes nothing to an owner who switched alerts off", () => {
    const input = base({
      alertRows: [],
      profiles: [{ organization_id: ORG_A, notification_email: "owner@acme.test", notify_on_lead: false }],
    });
    expect(kinds(input)).toEqual([]);
  });

  it("notes when the runtime watchdog already has the lead flagged", () => {
    const f = auditLeadDelivery(base({ alertRows: [], watchRows: [{ lead_id: LEAD, state: "open" }] })).findings[0]!;
    expect(f.watchdogOpen).toBe(true);
    expect(auditLeadDelivery(base({ alertRows: [], watchRows: [{ lead_id: LEAD, state: "resolved" }] })).findings[0]!.watchdogOpen).toBe(false);
  });
});

describe("auditLeadDelivery: lead webhook", () => {
  it("fails a configured webhook with no delivery attempt recorded", () => {
    expect(kinds(base({ webhookRows: [] }))).toEqual(["webhook_missing:high"]);
  });

  it("does not judge a workspace without a webhook, or a lead older than the webhook setting", () => {
    expect(kinds(base({ webhookRows: [], webhookConfigs: [{ organization_id: ORG_A, configured: false }] }))).toEqual([]);
    expect(kinds(base({ webhookRows: [], webhookConfigs: [{ organization_id: ORG_A, configured: true, updated_at: mins(5) }] }))).toEqual([]);
  });

  it("leaves a retryable failure alone while the retry sweep is still working on it", () => {
    expect(kinds(base({ webhookRows: [hook({ delivery_status: "failed", retryable: true, reason: "http_503" })] }))).toEqual([]);
  });

  it("fails a non-retryable webhook failure", () => {
    expect(kinds(base({ webhookRows: [hook({ delivery_status: "failed", retryable: false, reason: "invalid_webhook_url" })] }))).toEqual(["webhook_failed:high"]);
  });

  it("fails a retryable webhook once its retries are used up", () => {
    const rows = Array.from({ length: AUDIT_WEBHOOK_MAX_ATTEMPTS }, (_, i) =>
      hook({ delivery_status: "failed", retryable: true, reason: "http_503", attempted_at: mins(55 - i) }),
    );
    expect(kinds(base({ webhookRows: rows }))).toEqual(["webhook_failed:high"]);
  });

  it("says webhook routing was not checked, never a pass, when lead_delivery_logs is unavailable", () => {
    const report = auditLeadDelivery(base({ webhookRows: null, webhookConfigs: [{ organization_id: ORG_A, configured: true }] }));
    expect(report.webhookSkipped).toBe(true);
    expect(report.webhookRowsChecked).toBeNull();
    expect(report.findings).toEqual([]);
  });

  it("keeps the audit's retry ceiling in step with the retry sweep", () => {
    expect(AUDIT_WEBHOOK_MAX_ATTEMPTS).toBe(WEBHOOK_RETRY_BACKOFF_MS.length + 1);
  });
});

describe("auditLeadDelivery: what it ignores, and what it never leaks", () => {
  it("ignores test leads, demo workspaces and suspended workspaces", () => {
    const input = base({
      leads: [
        { id: "t1", organization_id: ORG_A, created_at: mins(60), source: TEST_LEAD_SOURCE },
        { id: "d1", organization_id: ORG_B, created_at: mins(60), source: "website" },
      ],
      orgs: [
        { id: ORG_A, name: "Acme" },
        { id: ORG_B, name: "Demo", is_demo: true },
      ],
      alertRows: [],
      webhookRows: [],
    });
    const report = auditLeadDelivery(input);
    expect(report.findings).toEqual([]);
    expect(report.leadsChecked).toBe(0);
    expect(auditLeadDelivery({ ...input, leads: [input.leads[1]!], orgs: [{ id: ORG_B, name: "S", is_suspended: true }] }).leadsChecked).toBe(0);
  });

  it("orders the worst findings first", () => {
    const input = base({
      leads: [
        { id: "l-high", organization_id: ORG_A, created_at: mins(60), source: "website" },
        { id: "l-crit", organization_id: ORG_A, created_at: mins(90), source: "website" },
      ],
      alertRows: [alert({ lead_id: "l-crit", recipient: "boss@bravo.test" })],
      webhookRows: [hook({ lead_id: "l-high" }), hook({ lead_id: "l-crit" })],
    });
    expect(kinds(input)[0]).toBe("alert_wrong_recipient:critical");
  });

  it("never puts a full address, lead name, email or phone into a finding", () => {
    const report = auditLeadDelivery(
      base({ alertRows: [alert({ recipient: "stranger@elsewhere.test" }), alert({ recipient: "boss@bravo.test", status: "failed", reason: "x" })] }),
    );
    const text = JSON.stringify(report);
    expect(text).not.toContain("stranger@elsewhere.test");
    expect(text).not.toContain("boss@bravo.test");
    expect(text).not.toContain("owner@acme.test");
  });

  it("masks addresses and does not echo garbage", () => {
    expect(maskAddress("owner@acme.test")).toBe("o***@acme.test");
    expect(maskAddress("not an email")).toBe("an invalid address");
    expect(maskAddress(null)).toBe("no address");
  });
});

describe("routing audit is read-only", () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), "utf8");
  for (const file of ["lead-delivery-audit.ts", "lead-delivery-audit.server.ts", "lead-delivery-audit.functions.ts"]) {
    it(`${file} writes nothing and sends nothing`, () => {
      const source = read(file);
      expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(source).not.toMatch(/\.rpc\(/);
      expect(source).not.toMatch(/sendLeadAlert|sendTemplateEmail|sendLeadConfirmation|dispatchLeadWebhook|deliverRun/);
      expect(source).not.toMatch(/stripe/i);
    });
  }
});
