import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  queueAutomationEventFor,
  requestReviewFor,
  validateQueueEventInput,
  validateReviewRequestInput,
  type QueueDeps,
} from "@/lib/automation-queue.server";
import { processDueRuns } from "@/lib/automation-engine";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const APPT = "44444444-4444-4444-8444-444444444444";
const LEAD = "55555555-5555-4555-8555-555555555555";

/* ---- recording Supabase double: results keyed by "table:firstOp" ---- */
type Call = { table: string; op: string; args: unknown[] };
function fakeDb(results: Record<string, unknown>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      let first = "";
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "insert", "update", "delete", "eq", "in", "lte", "not", "order", "limit", "maybeSingle", "single"]) {
        chain[op] = (...args: unknown[]) => {
          if (!first) first = op;
          calls.push({ table, op, args });
          return chain;
        };
      }
      chain["then"] = (resolve: (value: unknown) => unknown) => {
        const key = `${table}:${first}`;
        const value = key in results ? results[key] : { data: first === "select" ? [] : null, error: null };
        return resolve(typeof value === "function" ? (value as (c: Call[]) => unknown)(calls) : value);
      };
      return chain;
    },
  };
  return { db: db as never, calls };
}

const memberAs = (role: string | null) => ({
  "memberships:select": { data: role ? { role } : null, error: null },
  "organizations:select": { data: { id: ORG, name: "Acme Wash" }, error: null },
  "business_profiles:select": {
    data: { email: "owner@acme.test", owner_email: null, state: "TX", review_link: "https://g.page/acme" },
    error: null,
  },
});

const completedAppointment = {
  id: APPT,
  name: "Pat Lee",
  email: "pat@example.com",
  phone: "+15125550100",
  starts_at: "2026-10-20T15:00:00Z",
  status: "completed",
  lead_id: LEAD,
};

const completionAutomation = {
  id: "auto-1",
  name: "Review request after the job",
  trigger_event: "appointment_completed",
  is_active: true,
  automation_steps: [
    { id: "step-1", sort_order: 0, delay_minutes: 120, action_type: "sms", channel: "sms", subject: "How did we do?", body: "Thanks {{first_name}} from {{business_name}}" },
  ],
};

const deps = (admin: unknown): QueueDeps => ({
  admin: admin as never,
  deliverFor: () => vi.fn(async () => ({ ok: true as const })),
});

describe("input validation: the browser names a record, never a message", () => {
  it("accepts only app-side triggers and real ids", () => {
    expect(validateQueueEventInput({ organizationId: ORG, trigger: "appointment_completed", appointmentId: APPT })).toEqual({
      organizationId: ORG,
      trigger: "appointment_completed",
      leadId: null,
      appointmentId: APPT,
    });
    // lead_created is the public-site trigger whose texts skip the review opt-in.
    expect(() => validateQueueEventInput({ organizationId: ORG, trigger: "lead_created", leadId: LEAD })).toThrow(/can't be started/);
    expect(() => validateQueueEventInput({ organizationId: ORG, trigger: "review_request", leadId: LEAD })).toThrow();
    expect(() => validateQueueEventInput({ organizationId: "x", trigger: "booking_created", leadId: LEAD })).toThrow(/workspace/);
    expect(() => validateQueueEventInput({ organizationId: ORG, trigger: "booking_created" })).toThrow(/lead or booking/);
    expect(() => validateQueueEventInput({ organizationId: ORG, trigger: "booking_created", leadId: "not-a-uuid" })).toThrow(/lead/);
  });

  it("drops any recipient or body the browser sends", () => {
    const parsed = validateReviewRequestInput({
      organizationId: ORG,
      appointmentId: APPT,
      channel: "sms",
      recipient: "+19999999999",
      body: "buy now",
    });
    expect(parsed).toEqual({ organizationId: ORG, appointmentId: APPT, channel: "sms" });
    expect(() => validateReviewRequestInput({ organizationId: ORG, channel: "email" })).toThrow(/completed job/);
    expect(() => validateReviewRequestInput({ organizationId: ORG, appointmentId: APPT, channel: "fax" })).toThrow(/email or text/);
  });
});

describe("queueAutomationEventFor", () => {
  it("refuses anyone below staff, before any write", async () => {
    for (const role of [null, "viewer"]) {
      const user = fakeDb(memberAs(role));
      const admin = fakeDb({});
      await expect(
        queueAutomationEventFor(user.db, USER, { organizationId: ORG, trigger: "appointment_completed", leadId: null, appointmentId: APPT }, deps(admin.db)),
      ).rejects.toThrow(/permission/);
      expect(admin.calls).toHaveLength(0);
    }
  });

  it("treats another workspace's booking as not found (tenant scoping)", async () => {
    const user = fakeDb({ ...memberAs("staff"), "appointments:select": { data: null, error: null } });
    const admin = fakeDb({});
    await expect(
      queueAutomationEventFor(user.db, USER, { organizationId: ORG, trigger: "appointment_completed", leadId: null, appointmentId: APPT }, deps(admin.db)),
    ).rejects.toThrow(/wasn't found in this workspace/);
    expect(user.calls).toContainEqual({ table: "appointments", op: "eq", args: ["organization_id", ORG] });
    expect(user.calls).toContainEqual({ table: "memberships", op: "eq", args: ["organization_id", ORG] });
    expect(admin.calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it("requires the record's real state to match the trigger", async () => {
    const user = fakeDb({ ...memberAs("staff"), "appointments:select": { data: { ...completedAppointment, status: "confirmed" }, error: null } });
    await expect(
      queueAutomationEventFor(user.db, USER, { organizationId: ORG, trigger: "appointment_completed", leadId: null, appointmentId: APPT }, deps(fakeDb({}).db)),
    ).rejects.toThrow(/completed booking/);
  });

  it("builds trigger, recipient and body on the server from the definition and the booking", async () => {
    const user = fakeDb({ ...memberAs("staff"), "appointments:select": { data: completedAppointment, error: null } });
    const admin = fakeDb({
      "automations:select": { data: [completionAutomation], error: null },
      "automation_runs:insert": { data: null, error: null },
    });
    const result = await queueAutomationEventFor(
      user.db,
      USER,
      { organizationId: ORG, trigger: "appointment_completed", leadId: null, appointmentId: APPT },
      deps(admin.db),
    );
    expect(result.queued).toBe(1);
    const insert = admin.calls.find((c) => c.table === "automation_runs" && c.op === "insert");
    expect(insert?.args[0]).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        trigger_event: "appointment_completed",
        action_type: "sms",
        recipient: "+15125550100",
        appointment_id: APPT,
        lead_id: LEAD,
        body: "Thanks Pat from Acme Wash",
        status: "queued",
      }),
    ]);
    // The definitions are read for this workspace only.
    expect(admin.calls).toContainEqual({ table: "automations", op: "eq", args: ["organization_id", ORG] });
  });

  it("never queues the same trigger twice for one booking", async () => {
    const user = fakeDb({ ...memberAs("owner"), "appointments:select": { data: completedAppointment, error: null } });
    const admin = fakeDb({
      "automation_runs:select": { data: [{ id: "run-1" }], error: null },
      "automations:select": { data: [completionAutomation], error: null },
    });
    const result = await queueAutomationEventFor(
      user.db,
      USER,
      { organizationId: ORG, trigger: "appointment_completed", leadId: null, appointmentId: APPT },
      deps(admin.db),
    );
    expect(result).toMatchObject({ queued: 0, duplicate: true });
    expect(admin.calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });
});

describe("requestReviewFor", () => {
  it("texts/emails only the completed booking's own contact, with a server-built message", async () => {
    const user = fakeDb({ ...memberAs("staff"), "appointments:select": { data: completedAppointment, error: null } });
    const admin = fakeDb({ "automation_runs:insert": { data: null, error: null } });
    const result = await requestReviewFor(user.db, USER, { organizationId: ORG, appointmentId: APPT, channel: "email" }, deps(admin.db));
    expect(result.queued).toBe(1);
    const insert = admin.calls.find((c) => c.table === "automation_runs" && c.op === "insert");
    expect(insert?.args[0]).toEqual({
      organization_id: ORG,
      lead_id: LEAD,
      appointment_id: APPT,
      trigger_event: "review_request",
      action_type: "email",
      recipient: "pat@example.com",
      subject: "How did we do, Pat?",
      body: "Hi Pat — thanks again for choosing Acme Wash. Would you leave us a quick review? https://g.page/acme",
      scheduled_for: expect.any(String),
      status: "queued",
    });
  });

  it("refuses a second request for the same job, and jobs not completed", async () => {
    const asked = fakeDb({ ...memberAs("staff"), "appointments:select": { data: completedAppointment, error: null } });
    const admin = fakeDb({ "automation_runs:select": { data: [{ id: "run-1" }], error: null } });
    await expect(
      requestReviewFor(asked.db, USER, { organizationId: ORG, appointmentId: APPT, channel: "email" }, deps(admin.db)),
    ).rejects.toThrow(/already queued or sent/);
    expect(admin.calls.filter((c) => c.op === "insert")).toHaveLength(0);

    const pending = fakeDb({ ...memberAs("staff"), "appointments:select": { data: { ...completedAppointment, status: "pending" }, error: null } });
    await expect(
      requestReviewFor(pending.db, USER, { organizationId: ORG, appointmentId: APPT, channel: "email" }, deps(fakeDb({}).db)),
    ).rejects.toThrow(/once the job is completed/);
  });

  it("is refused for viewers and for another workspace", async () => {
    await expect(
      requestReviewFor(fakeDb(memberAs("viewer")).db, USER, { organizationId: ORG, appointmentId: APPT, channel: "sms" }, deps(fakeDb({}).db)),
    ).rejects.toThrow(/permission/);
    await expect(
      requestReviewFor(fakeDb(memberAs(null)).db, USER, { organizationId: OTHER_ORG, appointmentId: APPT, channel: "sms" }, deps(fakeDb({}).db)),
    ).rejects.toThrow(/permission/);
  });
});

describe("processDueRuns: stale reminders and lookup failures", () => {
  const due = [
    { id: "run-1", action_type: "sms", recipient: "+15125550100", subject: "Reminder", body: "See you", lead_id: null, appointment_id: APPT, trigger_event: "booking_created" },
  ];

  it("hands the appointment start to delivery and records a dropped reminder as skipped", async () => {
    const admin = fakeDb({
      "automation_runs:select": { data: due, error: null },
      "appointments:select": { data: [{ id: APPT, starts_at: "2026-10-20T15:00:00Z" }], error: null },
      "automation_runs:update": { data: [{ id: "run-1" }], error: null },
    });
    const deliver = vi.fn(async () => ({ ok: false as const, retry: false, reason: "appointment_already_started" }));
    const result = await processDueRuns(admin.db, ORG, { deliver });
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ id: "run-1", appointment_starts_at: "2026-10-20T15:00:00Z" }));
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
    const update = admin.calls.find((c) => c.table === "automation_runs" && c.op === "update");
    expect(update?.args[0]).toEqual({ status: "skipped", sent_at: null });
    expect(admin.calls).toContainEqual({ table: "appointments", op: "eq", args: ["organization_id", ORG] });
  });

  it("leaves every run queued when the appointment lookup fails", async () => {
    const admin = fakeDb({
      "automation_runs:select": { data: due, error: null },
      "appointments:select": { data: null, error: { message: "timeout" } },
    });
    const deliver = vi.fn();
    expect(await processDueRuns(admin.db, ORG, { deliver })).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(deliver).not.toHaveBeenCalled();
    expect(admin.calls.filter((c) => c.op === "update")).toHaveLength(0);
  });
});

describe("no browser code writes automation_runs", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk("src");

  it("every insert/update of automation_runs lives in server-only code", () => {
    const writers = files.filter((file) =>
      /from\("automation_runs"\)\s*\.(insert|update|upsert|delete)\(/.test(readFileSync(file, "utf8")),
    );
    // automation-engine is only called with the service-role client from these server modules.
    expect(writers.sort()).toEqual(["src/lib/automation-engine.ts", "src/lib/automation-queue.server.ts"]);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (/enqueueAutomations\(|processDueRuns\(/.test(source)) {
        // automation-sweep.server runs only from the cron-authenticated
        // /api/public/jobs/automation-runs route with the service-role client.
        expect(file).toMatch(/automation-engine\.ts$|automation-queue\.server\.ts$|automation-sweep\.server\.ts$|automations\.functions\.ts$|public-site\.functions\.ts$/);
      }
    }
  });

  it("the review and calendar pages and the hooks go through the server functions", () => {
    const growth = readFileSync("src/lib/growth-hooks.ts", "utf8");
    expect(growth).toMatch(/requestReviewForAppointment\(\{/);
    const queries = readFileSync("src/lib/queries.ts", "utf8");
    expect(queries).not.toMatch(/enqueueAutomations/);
    expect(queries).toMatch(/await queueAutomationEvent\(\{/);
    const reviews = readFileSync("src/routes/_authenticated/app.reviews.tsx", "utf8");
    expect(reviews).not.toMatch(/recipient:/);
    expect(reviews).toMatch(/appointmentId: askingAppointment\.id/);
  });

  it("the delivery pass runs as the service role only after a membership check", () => {
    const runner = readFileSync("src/lib/automations.functions.ts", "utf8");
    const check = runner.indexOf('if (!org?.id) throw new Error("Workspace not found")');
    expect(check).toBeGreaterThan(-1);
    expect(runner.indexOf("processDueRuns(supabaseAdmin, org.id")).toBeGreaterThan(check);
  });
});
