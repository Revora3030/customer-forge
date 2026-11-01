import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: vi.fn(async () => ({ sent: true })),
}));

import {
  WATCHDOG_BACKOFF_MS,
  WATCHDOG_MAX_ATTEMPTS,
  decideLeadDelivery,
  nextAttemptAt,
  type WatchFlag,
  type WatchLogRow,
} from "@/lib/lead-delivery-watchdog";
import { runLeadDeliveryWatchdog } from "@/lib/lead-delivery-watchdog.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const NOW = Date.parse("2026-10-31T20:00:00Z");
const mins = (m: number) => new Date(NOW - m * 60_000).toISOString();
const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const LEAD = "11111111-1111-4111-8111-111111111111";
const PROFILE = { notification_email: "owner@acme.test", notify_on_lead: true };
const lead = (over: Record<string, unknown> = {}) => ({ id: LEAD, created_at: mins(30), source: "website", ...over }) as never;
const log = (over: Partial<WatchLogRow> = {}): WatchLogRow => ({
  status: "failed",
  reason: "email_transport_error",
  recipient: "owner@acme.test",
  created_at: mins(25),
  ...over,
});
const decide = (over: Record<string, unknown> = {}) =>
  decideLeadDelivery({ lead: lead(), logs: [], profile: PROFILE, flag: null, now: NOW, ...over } as never);

describe("decideLeadDelivery", () => {
  it("waits out the 5 minute grace period", () => {
    expect(decide({ lead: lead({ created_at: mins(3) }) })).toEqual({ action: "none" });
  });

  it("does nothing once the provider accepted an alert", () => {
    expect(decide({ logs: [log({ status: "sent", reason: null })] })).toEqual({ action: "none" });
  });

  it("resolves an open flag when an alert has since been accepted", () => {
    const flag: WatchFlag = { state: "open", problem: "failed_retrying", attempts: 1, next_attempt_at: null };
    expect(decide({ flag, logs: [log(), log({ status: "sent", reason: null })] })).toEqual({
      action: "resolve",
      resolution: "alert_sent",
    });
  });

  it("retries a lead with no alert attempt at all", () => {
    expect(decide()).toMatchObject({ action: "retry", problem: "never_attempted", recipient: "owner@acme.test" });
  });

  it("retries a transient failure and records the reason", () => {
    expect(decide({ logs: [log()] })).toMatchObject({ action: "retry", problem: "failed_retrying", reason: "email_transport_error" });
  });

  it("does not retry before the backoff has passed, but keeps the flag", () => {
    const flag: WatchFlag = { state: "open", problem: "failed_retrying", attempts: 1, next_attempt_at: new Date(NOW + 5 * 60_000).toISOString() };
    expect(decide({ flag, logs: [log()] })).toMatchObject({ action: "flag", problem: "failed_retrying" });
  });

  it("stops retrying after the maximum and flags it exhausted", () => {
    const flag: WatchFlag = { state: "open", problem: "failed_retrying", attempts: WATCHDOG_MAX_ATTEMPTS, next_attempt_at: null };
    expect(decide({ flag, logs: [log()] })).toMatchObject({ action: "flag", problem: "exhausted" });
  });

  it("flags a suppressed inbox instead of hammering it", () => {
    expect(decide({ logs: [log({ reason: "recipient_suppressed" })] })).toMatchObject({ action: "flag", problem: "failed_permanent" });
  });

  it("retries again once the owner has changed the alert inbox", () => {
    const logs = [log({ reason: "recipient_suppressed", recipient: "old@acme.test" })];
    expect(decide({ logs })).toMatchObject({ action: "retry", recipient: "owner@acme.test" });
  });

  it("flags a workspace with no valid alert inbox", () => {
    expect(decide({ profile: { notification_email: "not an email", notify_on_lead: true } })).toMatchObject({ action: "flag", problem: "no_alert_inbox" });
    expect(decide({ profile: null })).toMatchObject({ action: "flag", problem: "no_alert_inbox" });
  });

  it("respects an owner who turned alerts off", () => {
    expect(decide({ profile: { ...PROFILE, notify_on_lead: false } })).toEqual({ action: "none" });
  });

  it("ignores test leads", () => {
    expect(decide({ lead: lead({ source: "test_lead" }) })).toEqual({ action: "none" });
  });

  it("backs off 0, 10, 30, 60, 180 minutes and then stops", () => {
    expect(WATCHDOG_BACKOFF_MS).toEqual([0, 600_000, 1_800_000, 3_600_000, 10_800_000]);
    expect(nextAttemptAt(1, NOW)).toBe(new Date(NOW + 600_000).toISOString());
    expect(nextAttemptAt(5, NOW)).toBeNull();
  });
});

type Rows = Record<string, Record<string, unknown>[]>;

/** Chainable fake that really applies filters and writes, so scoping and persistence are tested. */
function fakeDb(tables: Rows) {
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let mode: "select" | "update" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const chain: Record<string, unknown> = {};
    const apply = () => {
      if (mode === "update") for (const r of rows()) Object.assign(r, patch);
      if (mode === "delete") tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
      return { data: rows(), error: null };
    };
    chain["select"] = () => chain;
    chain["order"] = () => chain;
    chain["limit"] = () => chain;
    chain["neq"] = () => chain;
    chain["gte"] = (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain);
    chain["lt"] = (c: string, v: string) => (filters.push((r) => String(r[c]) < v), chain);
    chain["eq"] = (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain);
    chain["in"] = (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), chain);
    chain["maybeSingle"] = async () => ({ data: rows()[0] ?? null, error: null });
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(apply());
    chain["update"] = (p: Record<string, unknown>) => ((mode = "update"), (patch = p), chain);
    chain["delete"] = () => ((mode = "delete"), chain);
    chain["insert"] = async (r: Record<string, unknown>) => {
      // lifecycle_email_log has a unique (organization_id, kind, window_key).
      if (table === "lifecycle_email_log" && (tables[table] ?? []).some((x) => x["organization_id"] === r["organization_id"] && x["kind"] === r["kind"] && x["window_key"] === r["window_key"]))
        return { error: { message: "duplicate" } };
      (tables[table] ??= []).push({ ...r });
      return { error: null };
    };
    chain["upsert"] = async (r: Record<string, unknown>) => {
      const list = (tables[table] ??= []);
      const existing = list.find((x) => x["lead_id"] === r["lead_id"]);
      if (existing) Object.assign(existing, r);
      else list.push({ ...r });
      return { error: null };
    };
    return chain;
  };
  return { from } as never;
}

const baseTables = (): Rows => ({
  organizations: [
    { id: ORG, name: "Acme", is_demo: false, is_suspended: false },
    { id: ORG_B, name: "Beta", is_demo: false, is_suspended: false },
    { id: "e0c08aa2-a95f-4049-8ce0-ffbb869dae10", name: "Revora" },
  ],
  business_profiles: [
    { organization_id: ORG, notification_email: "owner@acme.test", email: null, owner_email: null, notify_on_lead: true },
    { organization_id: ORG_B, notification_email: null, email: null, owner_email: null, notify_on_lead: true },
  ],
  leads: [
    { id: LEAD, organization_id: ORG, created_at: mins(30), source: "website", name: "Sam", email: "sam@v.test", phone: null, city: null, service_interest: null, message: null, estimated_value: 0 },
  ],
  lead_alert_log: [],
  lead_delivery_watch: [],
  lead_watchdog_events: [],
  notifications: [],
  lifecycle_email_log: [],
});

describe("runLeadDeliveryWatchdog", () => {
  beforeEach(() => vi.mocked(sendTemplateEmail).mockClear().mockResolvedValue({ sent: true }));

  it("retries a lead that never got an alert, with the original idempotency key, and logs it", async () => {
    const tables = baseTables();
    const run = await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    expect(run.retried).toBe(1);
    expect(run.sent).toBe(1);
    const [name, to, options] = vi.mocked(sendTemplateEmail).mock.calls[0]!;
    expect(name).toBe("lead-alert");
    expect(to).toBe("owner@acme.test");
    expect(options?.idempotencyKey).toBe(`lead-alert-${LEAD}`);
    expect(tables["lead_alert_log"]).toEqual([
      expect.objectContaining({ organization_id: ORG, lead_id: LEAD, status: "sent", recipient: "owner@acme.test" }),
    ]);
    expect(tables["lead_watchdog_events"]!.map((e) => e["event"])).toEqual(expect.arrayContaining(["retry_sent", "run"]));
    // Fixed within the same pass: nothing is left flagged for the owner.
    expect(tables["lead_delivery_watch"]!.filter((w) => w["state"] === "open")).toHaveLength(0);
    expect(tables["notifications"]).toHaveLength(0);
  });

  it("flags a failed retry on the lead and backs off", async () => {
    vi.mocked(sendTemplateEmail).mockResolvedValue({ sent: false, reason: "rate_limited" } as never);
    const tables = baseTables();
    const run = await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    expect(run.failed).toBe(1);
    expect(run.flagged).toBe(1);
    expect(tables["lead_alert_log"]![0]).toMatchObject({ status: "failed", reason: "rate_limited" });
    expect(tables["lead_delivery_watch"]![0]).toMatchObject({
      lead_id: LEAD,
      state: "open",
      problem: "failed_retrying",
      reason: "rate_limited",
      attempts: 1,
      next_attempt_at: new Date(NOW + 600_000).toISOString(),
    });
    // A second pass inside the backoff does not send again.
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW + 60_000);
    expect(vi.mocked(sendTemplateEmail)).toHaveBeenCalledTimes(1);
  });

  it("closes the flag when a later retry is accepted", async () => {
    vi.mocked(sendTemplateEmail).mockResolvedValueOnce({ sent: false, reason: "rate_limited" } as never);
    const tables = baseTables();
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW + 11 * 60_000);
    expect(tables["lead_delivery_watch"]![0]).toMatchObject({ state: "resolved", resolution: "alert_sent_by_retry" });
  });

  it("flags a suppressed owner inbox, tells the owner once and emails only Revora's own inbox", async () => {
    const tables = baseTables();
    tables["lead_alert_log"]!.push({ organization_id: ORG, lead_id: LEAD, recipient: "owner@acme.test", kind: "inquiry", status: "failed", reason: "recipient_suppressed", created_at: mins(25) });
    const first = await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW + 5 * 60_000);
    expect(first.needsAction).toBe(1);
    expect(tables["lead_delivery_watch"]![0]).toMatchObject({ state: "open", problem: "failed_permanent" });
    expect(tables["notifications"]).toHaveLength(1);
    expect(tables["notifications"]![0]).toMatchObject({ organization_id: ORG, kind: "lead_alert_failed" });
    // No resend to the suppressed inbox; only the daily summary to the platform inbox, once.
    const recipients = vi.mocked(sendTemplateEmail).mock.calls.map((c) => c[1]);
    expect(recipients).not.toContain("owner@acme.test");
    expect(recipients).not.toContain("sam@v.test");
    expect(recipients).toHaveLength(1);
  });

  it("flags a workspace with no alert inbox and never invents a recipient", async () => {
    const tables = baseTables();
    tables["leads"]!.push({ id: "22222222-2222-4222-8222-222222222222", organization_id: ORG_B, created_at: mins(40), source: "website", name: "Bo" });
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    expect(tables["lead_delivery_watch"]!.find((w) => w["organization_id"] === ORG_B)).toMatchObject({ problem: "no_alert_inbox", state: "open" });
  });

  it("skips test leads, demo and suspended workspaces, and another workspace's log rows", async () => {
    const tables = baseTables();
    tables["leads"]![0]!["source"] = "test_lead";
    tables["leads"]!.push({ id: "33333333-3333-4333-8333-333333333333", organization_id: ORG_B, created_at: mins(40), source: "website" });
    tables["organizations"]![1]!["is_suspended"] = true;
    const run = await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    expect(run.retried).toBe(0);
    expect(vi.mocked(sendTemplateEmail)).not.toHaveBeenCalled();

    // A "sent" row logged under another workspace must not hide this lead's failure.
    const crossed = baseTables();
    crossed["lead_alert_log"]!.push({ organization_id: ORG_B, lead_id: LEAD, recipient: "x@y.test", kind: "inquiry", status: "sent", reason: null, created_at: mins(20) });
    const out = await runLeadDeliveryWatchdog(fakeDb(crossed), NOW);
    expect(out.retried).toBe(1);
  });

  it("resolves a flag the owner no longer needs (alerts switched off)", async () => {
    const tables = baseTables();
    tables["lead_delivery_watch"]!.push({ lead_id: LEAD, organization_id: ORG, state: "open", problem: "no_alert_inbox", attempts: 0, next_attempt_at: null, owner_notified_at: null });
    tables["business_profiles"]![0]!["notify_on_lead"] = false;
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    expect(tables["lead_delivery_watch"]![0]).toMatchObject({ state: "resolved", resolution: "owner_alerts_off" });
  });

  it("writes a heartbeat every pass", async () => {
    const tables = baseTables();
    await runLeadDeliveryWatchdog(fakeDb(tables), NOW);
    expect(tables["lead_watchdog_events"]!.some((e) => e["event"] === "run" && e["organization_id"] === null)).toBe(true);
  });
});

describe("wiring", () => {
  it("has a cron-authenticated route, a 5-minute pg_cron schedule, RLS and an hourly backstop", () => {
    const route = readFileSync("src/routes/api/public/jobs/lead-delivery-watchdog.ts", "utf8");
    expect(route).toContain("authenticateCronRequest(request)");
    expect(route).toContain("runLeadDeliveryWatchdog");
    const sql = readFileSync("supabase/migrations/20261101010000_lead_delivery_watchdog.sql", "utf8");
    expect(sql).toContain("'*/5 * * * *'");
    expect(sql).toContain("call_revora_job('lead-delivery-watchdog', 600000)");
    expect(sql).toContain("ALTER TABLE public.lead_delivery_watch ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.lead_watchdog_events ENABLE ROW LEVEL SECURITY");
    const workflow = readFileSync(".github/workflows/scheduled-jobs.yml", "utf8");
    expect(workflow).toContain('"10 * * * *") echo "job=lead-delivery-watchdog"');
  });
});
