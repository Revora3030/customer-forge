import { describe, expect, it } from "vitest";
import { loadLeadDeliveryAudit } from "@/lib/lead-delivery-audit.server";
import { TEST_LEAD_SOURCE } from "@/lib/test-lead";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString();
const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ORG_DEMO = "dddddddd-0000-4000-8000-000000000004";

type Row = Record<string, unknown>;
type Table = Row[] | { error: string };
type Tables = {
  leads: Table;
  organizations: Table;
  business_profiles: Table;
  lead_alert_log: Table;
  lead_delivery_logs?: Table;
  website_settings: Table;
  lead_delivery_watch: Table;
};

/**
 * An in-memory stand-in for the database that supports exactly the read calls
 * the audit makes. Any write throws, so a regression that tried to mutate a
 * row (or anything else) fails the test.
 */
function fakeDb(tables: Tables) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(table);
      const source = (tables as Record<string, Table | undefined>)[table];
      let rows: Row[] = Array.isArray(source) ? [...source] : [];
      const result = () =>
        Array.isArray(source) ? { data: rows, error: null } : { data: null, error: { message: (source as { error: string } | undefined)?.error ?? `relation "${table}" does not exist` } };
      const q: Record<string, unknown> = {
        select: () => q,
        gte: (col: string, value: string) => ((rows = rows.filter((r) => String(r[col]) >= value)), q),
        in: (col: string, values: string[]) => ((rows = rows.filter((r) => values.includes(String(r[col])))), q),
        order: () => q,
        limit: () => q,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      for (const write of ["insert", "update", "upsert", "delete"])
        q[write] = () => {
          throw new Error(`audit attempted a write: ${table}.${write}`);
        };
      return q;
    },
  };
  return { db: db as never, calls };
}

const healthy = (): Tables => ({
  leads: [
    { id: "L1", organization_id: ORG_A, created_at: ago(60), source: "website" },
    { id: "L2", organization_id: ORG_A, created_at: ago(70), source: TEST_LEAD_SOURCE },
    { id: "L3", organization_id: ORG_DEMO, created_at: ago(70), source: "website" },
    { id: "OLD", organization_id: ORG_A, created_at: ago(60 * 24 * 10), source: "website" },
  ],
  organizations: [
    { id: ORG_A, name: "Acme Plumbing", is_demo: false, is_suspended: false },
    { id: ORG_B, name: "Bravo Roofing", is_demo: false, is_suspended: false },
    { id: ORG_DEMO, name: "Demo", is_demo: true, is_suspended: false },
  ],
  business_profiles: [
    { organization_id: ORG_A, notification_email: "owner@acme.test", email: null, owner_email: null, notify_on_lead: true, updated_at: ago(99_999) },
    { organization_id: ORG_B, notification_email: "boss@bravo.test", email: null, owner_email: null, notify_on_lead: true, updated_at: ago(99_999) },
  ],
  lead_alert_log: [{ lead_id: "L1", organization_id: ORG_A, recipient: "owner@acme.test", status: "sent", reason: null, created_at: ago(58) }],
  lead_delivery_logs: [{ lead_id: "L1", organization_id: ORG_A, delivery_status: "delivered", retryable: false, reason: null, attempted_at: ago(58) }],
  website_settings: [{ organization_id: ORG_A, lead_webhook_url: "https://hooks.example.test/secret-path", updated_at: ago(99_999) }],
  lead_delivery_watch: [],
});

describe("loadLeadDeliveryAudit (stored rows only)", () => {
  it("reads delivery rows and confirms a correctly routed lead", async () => {
    const { db, calls } = fakeDb(healthy());
    const report = await loadLeadDeliveryAudit(db, NOW);
    expect(report.findings).toEqual([]);
    expect(report).toMatchObject({ leadsChecked: 1, alertRowsChecked: 1, webhookRowsChecked: 1, clean: true });
    expect(calls).toEqual(
      expect.arrayContaining(["leads", "organizations", "business_profiles", "lead_alert_log", "lead_delivery_logs", "website_settings", "lead_delivery_watch"]),
    );
  });

  it("fails when a stored alert row is filed under another workspace and went to that workspace's inbox", async () => {
    const t = healthy();
    t.lead_alert_log = [{ lead_id: "L1", organization_id: ORG_B, recipient: "boss@bravo.test", status: "sent", reason: null, created_at: ago(58) }];
    const report = await loadLeadDeliveryAudit(fakeDb(t).db, NOW);
    expect(report.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["alert_wrong_workspace", "alert_missing"]));
    expect(report.counts.critical).toBe(1);
    expect(report.clean).toBe(false);
  });

  it("fails an alert recorded for the right workspace but sent to the wrong recipient", async () => {
    const t = healthy();
    t.lead_alert_log = [{ lead_id: "L1", organization_id: ORG_A, recipient: "boss@bravo.test", status: "sent", reason: null, created_at: ago(58) }];
    const report = await loadLeadDeliveryAudit(fakeDb(t).db, NOW);
    expect(report.findings).toMatchObject([{ kind: "alert_wrong_recipient", severity: "critical", workspace: "Acme Plumbing" }]);
  });

  it("fails a lead with no alert row and one whose only alert failed", async () => {
    const t = healthy();
    t.lead_alert_log = [];
    expect((await loadLeadDeliveryAudit(fakeDb(t).db, NOW)).findings.map((f) => f.kind)).toEqual(["alert_missing"]);
    t.lead_alert_log = [{ lead_id: "L1", organization_id: ORG_A, recipient: "owner@acme.test", status: "failed", reason: "email_transport_error", created_at: ago(58) }];
    expect((await loadLeadDeliveryAudit(fakeDb(t).db, NOW)).findings.map((f) => f.kind)).toEqual(["alert_failed"]);
  });

  it("fails a configured webhook that never got a delivery row, without carrying the URL", async () => {
    const t = healthy();
    t.lead_delivery_logs = [];
    const report = await loadLeadDeliveryAudit(fakeDb(t).db, NOW);
    expect(report.findings.map((f) => f.kind)).toEqual(["webhook_missing"]);
    expect(JSON.stringify(report)).not.toContain("hooks.example.test");
  });

  it("reports webhook routing as not checked, never as a pass, when lead_delivery_logs does not exist yet", async () => {
    const t = healthy();
    delete t.lead_delivery_logs;
    const report = await loadLeadDeliveryAudit(fakeDb(t).db, NOW);
    expect(report.webhookSkipped).toBe(true);
    expect(report.webhookRowsChecked).toBeNull();
  });

  it("marks findings the watchdog already flagged", async () => {
    const t = healthy();
    t.lead_alert_log = [];
    t.lead_delivery_watch = [{ lead_id: "L1", state: "open" }];
    expect((await loadLeadDeliveryAudit(fakeDb(t).db, NOW)).findings[0]!.watchdogOpen).toBe(true);
  });

  it("surfaces a real read error instead of reporting a clean result", async () => {
    const t = healthy();
    t.lead_alert_log = { error: "permission denied for table lead_alert_log" };
    await expect(loadLeadDeliveryAudit(fakeDb(t).db, NOW)).rejects.toThrow(/lead_alert_log: permission denied/);
  });

  it("never writes: the fake database throws on any insert, update, upsert or delete", async () => {
    const { db } = fakeDb(healthy());
    await expect(loadLeadDeliveryAudit(db, NOW)).resolves.toBeDefined();
  });
});
