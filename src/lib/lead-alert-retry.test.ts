import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: vi.fn(async () => ({ sent: true })),
}));

import {
  pickLeadAlertRetries,
  runLeadAlertRetries,
  type AlertLogRow,
} from "@/lib/owner-reports.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const LEAD_A = "11111111-1111-4111-8111-111111111111";
const LEAD_B = "22222222-2222-4222-8222-222222222222";
const LEAD_C = "33333333-3333-4333-8333-333333333333";

const row = (over: Partial<AlertLogRow>): AlertLogRow => ({
  organization_id: ORG_A,
  lead_id: LEAD_A,
  kind: "quote",
  status: "failed",
  reason: "email_transport_error",
  created_at: ago(2),
  ...over,
});

type Rows = Record<string, Record<string, unknown>[]>;

/** Chainable fake that really applies eq/in filters, so tenant scoping is tested. */
function filteringDb(tables: Rows) {
  const inserted: { table: string; row: Record<string, unknown> }[] = [];
  const eqCalls: { table: string; column: string; value: unknown }[] = [];
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const chain: Record<string, unknown> = {};
    chain["select"] = () => chain;
    chain["order"] = () => chain;
    chain["limit"] = () => chain;
    chain["gte"] = (column: string, value: string) => {
      filters.push((r) => String(r[column]) >= value);
      return chain;
    };
    chain["eq"] = (column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      filters.push((r) => r[column] === value);
      return chain;
    };
    chain["in"] = (column: string, values: unknown[]) => {
      filters.push((r) => values.includes(r[column]));
      return chain;
    };
    chain["maybeSingle"] = async () => ({ data: rows()[0] ?? null, error: null });
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null });
    chain["insert"] = async (r: Record<string, unknown>) => {
      inserted.push({ table, row: r });
      return { error: null };
    };
    return chain;
  };
  return { db: { from } as never, inserted, eqCalls };
}

describe("pickLeadAlertRetries", () => {
  it("retries a transient failure with no accepted alert", () => {
    expect(pickLeadAlertRetries([row({})], NOW)).toEqual([
      { organizationId: ORG_A, leadId: LEAD_A, kind: "quote" },
    ]);
  });

  it("excludes suppressed inboxes and leads that were already sent", () => {
    expect(pickLeadAlertRetries([row({ reason: "recipient_suppressed" })], NOW)).toEqual([]);
    // Newest failure is transient, but an alert was already accepted.
    expect(
      pickLeadAlertRetries(
        [row({ status: "sent", reason: null, created_at: ago(5) }), row({ created_at: ago(1) })],
        NOW,
      ),
    ).toEqual([]);
    // A transient failure followed by a suppression: the newest decides.
    expect(
      pickLeadAlertRetries(
        [row({ created_at: ago(5) }), row({ reason: "recipient_suppressed", created_at: ago(1) })],
        NOW,
      ),
    ).toEqual([]);
  });

  it("accepts each retryable reason and nothing else", () => {
    for (const reason of ["email_transport_error", "rate_limited", "429", "emails_disabled", "domain_not_verified"])
      expect(pickLeadAlertRetries([row({ reason })], NOW)).toHaveLength(1);
    for (const reason of ["email_error", "no_email_address", null])
      expect(pickLeadAlertRetries([row({ reason })], NOW)).toHaveLength(0);
  });

  it("stops after three attempts, ignores stale failures and test alerts", () => {
    const three = [row({ created_at: ago(3) }), row({ created_at: ago(2) }), row({ created_at: ago(1) })];
    expect(pickLeadAlertRetries(three, NOW)).toHaveLength(1);
    expect(pickLeadAlertRetries([...three, row({ created_at: ago(0.5) })], NOW)).toHaveLength(0);
    expect(pickLeadAlertRetries([row({ created_at: ago(25) })], NOW)).toHaveLength(0);
    expect(pickLeadAlertRetries([row({ kind: "test", lead_id: null })], NOW)).toHaveLength(0);
  });

  it("never lets one workspace's log decide another's retry", () => {
    // Same lead id logged under two orgs: org B's success must not hide org A's failure.
    const picked = pickLeadAlertRetries(
      [row({}), row({ organization_id: ORG_B, status: "sent", reason: null })],
      NOW,
    );
    expect(picked).toEqual([{ organizationId: ORG_A, leadId: LEAD_A, kind: "quote" }]);
  });
});

describe("runLeadAlertRetries", () => {
  beforeEach(() => vi.mocked(sendTemplateEmail).mockClear());

  const tables = (): Rows => ({
    lead_alert_log: [
      row({}),
      // Org B logs a failure for a lead that actually belongs to org A.
      row({ organization_id: ORG_B, lead_id: LEAD_C }),
      row({ organization_id: ORG_B, lead_id: LEAD_B, reason: "recipient_suppressed" }),
    ],
    organizations: [
      { id: ORG_A, name: "Acme", is_suspended: false },
      { id: ORG_B, name: "Beta", is_suspended: false },
    ],
    leads: [
      { id: LEAD_A, organization_id: ORG_A, name: "Sam", email: "sam@visitor.test", phone: "9195550134", city: null, service_interest: "Detail", message: null, estimated_value: 0 },
      { id: LEAD_C, organization_id: ORG_A, name: "Cross", email: null, phone: null, city: null, service_interest: null, message: null, estimated_value: 0 },
      { id: LEAD_B, organization_id: ORG_B, name: "Bo", email: null, phone: null, city: null, service_interest: null, message: null, estimated_value: 0 },
    ],
    business_profiles: [
      { organization_id: ORG_A, notification_email: null, email: "hello@acme.test", owner_email: "owner@acme.test", notify_on_lead: true },
      { organization_id: ORG_B, notification_email: "alerts@beta.test", email: null, owner_email: null, notify_on_lead: true },
    ],
  });

  it("resends with the same key to the workspace's own recipient and logs the outcome", async () => {
    const { db, inserted, eqCalls } = filteringDb(tables());
    const run = await runLeadAlertRetries(db, NOW);

    expect(run.sent).toBe(1);
    expect(vi.mocked(sendTemplateEmail)).toHaveBeenCalledTimes(1);
    const [templateName, to, options] = vi.mocked(sendTemplateEmail).mock.calls[0]!;
    expect(templateName).toBe("lead-alert");
    expect(to).toBe("hello@acme.test");
    expect(options?.idempotencyKey).toBe(`lead-alert-${LEAD_A}`);
    expect(options?.replyTo).toBe("sam@visitor.test");

    // Reloaded by id AND organization.
    expect(eqCalls).toContainEqual({ table: "leads", column: "id", value: LEAD_A });
    expect(eqCalls).toContainEqual({ table: "leads", column: "organization_id", value: ORG_A });

    expect(inserted).toEqual([
      {
        table: "lead_alert_log",
        row: { organization_id: ORG_A, lead_id: LEAD_A, recipient: "hello@acme.test", kind: "quote", status: "sent", reason: null },
      },
    ]);
  });

  it("never crosses organizations: another org's lead id is skipped, not sent", async () => {
    const { db } = filteringDb(tables());
    const run = await runLeadAlertRetries(db, NOW);
    expect(run.details).toContainEqual({ organizationId: ORG_B, status: "skipped", reason: "lead_missing" });
    const recipients = vi.mocked(sendTemplateEmail).mock.calls.map((call) => call[1]);
    expect(recipients).not.toContain("alerts@beta.test");
  });

  it("logs a failed resend as failed, never as sent", async () => {
    vi.mocked(sendTemplateEmail).mockResolvedValueOnce({ sent: false, reason: "recipient_suppressed" });
    const { db, inserted } = filteringDb(tables());
    const run = await runLeadAlertRetries(db, NOW);
    expect(run.sent).toBe(0);
    expect(run.failed).toBe(1);
    expect(inserted[0]?.row).toMatchObject({ status: "failed", reason: "recipient_suppressed" });
  });

  it("is wired to an hourly :40 cron route", () => {
    const route = readFileSync("src/routes/api/public/jobs/lead-alert-retry.ts", "utf8");
    expect(route).toContain("authenticateCronRequest(request)");
    expect(route).toContain("runLeadAlertRetries");
    const workflow = readFileSync(".github/workflows/scheduled-jobs.yml", "utf8");
    expect(workflow).toContain('- cron: "40 * * * *"');
    expect(workflow).toContain('"40 * * * *") echo "job=lead-alert-retry"');
  });
});
