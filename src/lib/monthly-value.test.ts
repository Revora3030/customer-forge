import { readdirSync, readFileSync } from "node:fs";
import React from "react";
import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: vi.fn(async () => ({ sent: true })) }));

import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { template as monthlyValueTemplate } from "@/lib/email-templates/monthly-value";
import {
  buildMonthlyValue,
  inSendWindow,
  leadTrend,
  monthlyValueSubject,
  previousMonthWindow,
  roiLine,
  usd,
} from "@/lib/monthly-value";
import { runMonthlyValueReports } from "@/lib/owner-reports.server";

const NOV_1 = Date.parse("2026-11-01T14:00:00Z");
const window = previousMonthWindow(new Date(NOV_1));

describe("monthly value numbers", () => {
  it("covers the calendar month that just ended", () => {
    expect(window).toEqual({
      key: "2026-10",
      label: "Oct 2026",
      start: "2026-10-01T00:00:00.000Z",
      end: "2026-11-01T00:00:00.000Z",
      previousStart: "2026-09-01T00:00:00.000Z",
    });
    expect(previousMonthWindow(new Date("2027-01-01T14:00:00Z")).key).toBe("2026-12");
    expect(inSendWindow(new Date(NOV_1))).toBe(true);
    expect(inSendWindow(new Date("2026-11-15T14:00:00Z"))).toBe(false);
  });

  it("counts only last month's real records and states ROI only when both sides exist", () => {
    const value = buildMonthlyValue({
      window,
      leads: [
        { status: "booked", estimated_value: 400, created_at: "2026-10-03T10:00:00Z" },
        { status: "completed", estimated_value: "600", created_at: "2026-10-20T10:00:00Z" },
        { status: "new", estimated_value: 900, created_at: "2026-10-21T10:00:00Z" },
        { status: "booked", estimated_value: 5000, created_at: "2026-09-21T10:00:00Z" }, // previous month
        { status: "booked", estimated_value: 5000, created_at: "2026-11-01T00:00:00Z" }, // this month, excluded
      ],
      appointments: 2,
      events: [
        { event_type: "page_view", session_id: "a" },
        { event_type: "page_view", session_id: "a" },
        { event_type: "page_view", session_id: "b" },
        { event_type: "cta_click", session_id: "a" },
      ],
      payments: [
        { organization_id: "o", amount: 197, status: "completed", completed_at: "2026-10-02T00:00:00Z", created_at: "2026-10-02T00:00:00Z" },
        { organization_id: "o", amount: 197, status: "failed", completed_at: null, created_at: "2026-10-09T00:00:00Z" },
        { organization_id: "o", amount: 197, status: "completed", completed_at: "2026-09-02T00:00:00Z", created_at: "2026-09-02T00:00:00Z" },
      ],
    });
    expect(value).toMatchObject({
      leads: 3,
      previousLeads: 1,
      won: 2,
      wonValue: 1000,
      appointments: 2,
      visits: 3,
      visitors: 2,
      ctaClicks: 1,
      revoraCost: 197,
    });
    expect(value.roiMultiple).toBeCloseTo(1000 / 197);
    expect(roiLine(value)).toBe(
      "You marked $1,000 of work as booked or completed, and Revora cost $197 this month: about 5.1× what you paid.",
    );
    expect(leadTrend(value, "Sep 2026")).toBe("up 2 from Sep 2026");
    expect(monthlyValueSubject("Elite", value)).toBe("Elite in Oct 2026: 3 leads, $1,000 booked");

    const free = buildMonthlyValue({ window, leads: [], appointments: 0, events: [], payments: [] });
    expect(free.roiMultiple).toBeNull();
    expect(roiLine(free)).toBeNull();
    expect(leadTrend(free, "Sep 2026")).toBeNull();
    expect(monthlyValueSubject("Elite", free)).toBe("Elite: your Oct 2026 report");
    expect(usd(1234.5)).toBe("$1,234.50");
  });
});

describe("monthly value email template", () => {
  it("is registered and renders the passed-in numbers with an unsubscribe link", async () => {
    expect(TEMPLATES["monthly-value"]).toBe(monthlyValueTemplate);
    const url = "https://revoragrowthsystems.com/unsubscribe/lifecycle/abc123abc123abc123abc123";
    const html = await render(
      React.createElement(monthlyValueTemplate.component, {
        ...monthlyValueTemplate.previewData,
        unsubscribeUrl: url,
      }),
    );
    expect(html).toContain("Elite Mobile Detailing in Oct 2026");
    expect(html).toContain("$2,350");
    expect(html).toContain("11.9×");
    expect(html).toContain(url);
    expect(html).toContain("nothing is estimated for you");
    expect(monthlyValueTemplate.subject({ subject: "X in Oct: 3 leads" })).toBe("X in Oct: 3 leads");
  });

  it("omits the ROI and value lines when they can't be stated", async () => {
    const html = (
      await render(React.createElement(monthlyValueTemplate.component, { businessName: "Elite", monthLabel: "Oct 2026" }))
    ).replaceAll("<!-- -->", "");
    expect(html).toContain("No new leads or appointments came in during Oct 2026");
    expect(html).not.toMatch(/Value of booked work|what you paid/);
  });
});

type Row = Record<string, unknown>;

/** Chainable fake: filters on eq/neq/gte/lt/in so per-workspace reads stay scoped. */
function fakeDb(tables: Record<string, Row[]>, opts: { claimFails?: boolean } = {}) {
  const inserted: { table: string; row: Row }[] = [];
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "update" | "delete" = "select";
    const chain: Record<string, unknown> = {};
    const add = (fn: (r: Row) => boolean) => {
      filters.push(fn);
      return chain;
    };
    chain["select"] = () => chain;
    chain["order"] = () => chain;
    chain["limit"] = () => chain;
    chain["not"] = () => chain;
    chain["eq"] = (c: string, v: unknown) => add((r) => r[c] === undefined || r[c] === v);
    chain["neq"] = (c: string, v: unknown) => add((r) => r[c] !== v);
    chain["gte"] = (c: string, v: string) => add((r) => String(r[c]) >= v);
    chain["lt"] = (c: string, v: string) => add((r) => String(r[c]) < v);
    chain["in"] = (c: string, v: unknown[]) => add((r) => v.includes(r[c]));
    chain["update"] = () => ((mode = "update"), chain);
    chain["delete"] = () => ((mode = "delete"), chain);
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    chain["maybeSingle"] = async () => ({ data: rows()[0] ?? null, error: null });
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(mode === "select" ? { data: rows(), error: null } : { error: null });
    chain["insert"] = async (row: Row) => {
      inserted.push({ table, row });
      if (table === "lifecycle_email_log" && opts.claimFails) return { error: { message: "duplicate" } };
      (tables[table] ??= []).push(row);
      return { error: null };
    };
    return chain;
  };
  return { db: { from } as never, inserted };
}

const org = (id: string, created_at = "2026-01-01T00:00:00Z") => ({ id, name: id === "o1" ? "Elite" : "Other", created_at, is_demo: false, is_suspended: false });

function baseTables(): Record<string, Row[]> {
  return {
    organizations: [org("o1"), org("o2"), org("new", "2026-11-01T09:00:00Z")],
    business_profiles: [
      { organization_id: "o1", notification_email: "owner@elite.com", notify_on_lead: true },
      { organization_id: "o2", notification_email: "gone@other.com", notify_on_lead: true },
      { organization_id: "new", notification_email: "new@new.com", notify_on_lead: true },
    ],
    leads: [
      { organization_id: "o1", status: "booked", estimated_value: 800, source: "website", created_at: "2026-10-05T00:00:00Z" },
      { organization_id: "o1", status: "booked", estimated_value: 999, source: "test_lead", created_at: "2026-10-06T00:00:00Z" },
      { organization_id: "o2", status: "booked", estimated_value: 9999, source: "website", created_at: "2026-10-05T00:00:00Z" },
    ],
    appointments: [{ organization_id: "o1", id: "a1", created_at: "2026-10-07T00:00:00Z" }],
    analytics_events: [{ organization_id: "o1", event_type: "page_view", session_id: "s", created_at: "2026-10-08T00:00:00Z" }],
    payments: [
      { organization_id: "o1", environment: "live", amount: 200, status: "completed", refunded_amount: 0, completed_at: "2026-10-02T00:00:00Z", created_at: "2026-10-02T00:00:00Z" },
    ],
    lifecycle_email_optouts: [{ email: "gone@other.com", token: "t".repeat(48), opted_out_at: "2026-10-01T00:00:00Z" }],
    lifecycle_email_log: [],
  };
}

describe("runMonthlyValueReports", () => {
  it("emails each workspace its own last-month numbers once, honouring unsubscribes", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const { db, inserted } = fakeDb(baseTables());
    const run = await runMonthlyValueReports(db, NOV_1);
    expect(run).toMatchObject({ job: "monthly-report", scanned: 2, sent: 1, skipped: 1, failed: 0 });
    expect(run.details).toContainEqual({ organizationId: "o2", status: "skipped", reason: "unsubscribed" });
    expect(inserted.find((i) => i.table === "lifecycle_email_log")?.row).toMatchObject({
      organization_id: "o1",
      kind: "monthly_value",
      window_key: "2026-10",
      recipient: "owner@elite.com",
    });
    const [template, to, options] = vi.mocked(sendTemplateEmail).mock.calls[0]!;
    expect(template).toBe("monthly-value");
    expect(to).toBe("owner@elite.com");
    expect(options).toMatchObject({
      idempotencyKey: "monthly_value-o1-2026-10",
      templateData: {
        businessName: "Elite",
        monthLabel: "Oct 2026",
        leads: 1,
        won: 1,
        wonValue: "$800",
        appointments: 1,
        visitors: 1,
        roiLine: expect.stringContaining("about 4× what you paid"),
        unsubscribeUrl: expect.stringMatching(/^https:\/\/revoragrowthsystems\.com\/unsubscribe\/lifecycle\//),
      },
    });
  });

  it("never sends twice for the same month", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const { db } = fakeDb(baseTables(), { claimFails: true });
    const run = await runMonthlyValueReports(db, NOV_1);
    expect(run.sent).toBe(0);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("does nothing outside the first week of a month", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const { db } = fakeDb(baseTables());
    const run = await runMonthlyValueReports(db, Date.parse("2026-11-12T14:00:00Z"));
    expect(run.scanned).toBe(0);
    expect(run.details).toEqual([{ status: "skipped", reason: "outside_send_window" }]);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });
});

describe("monthly report job and schedule", () => {
  it("the route is cron-authenticated", () => {
    const route = readFileSync("src/routes/api/public/jobs/monthly-report.ts", "utf8");
    expect(route).toMatch(/authenticateCronRequest\(request\)/);
    expect(route).toMatch(/runMonthlyValueReports\(supabaseAdmin/);
  });

  it("pg_cron runs it at 14:00 UTC on the 1st from the newest migration, guarded and non-destructive", () => {
    const file = "20261103110000_monthly_report_schedule.sql";
    const names = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
    const base = names.filter((f) => f < "20261103000000").sort().at(-1)!;
    expect(file > base).toBe(true);
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8").replace(/--.*$/gm, "");
    expect(sql).toContain("'revora-monthly-report',\n    '0 14 1 * *',");
    expect(sql).toContain("public.call_revora_job('monthly-report', 900000)");
    expect(sql).toMatch(/extname = 'pg_cron'[\s\S]*RETURN;[\s\S]*proname = 'call_revora_job'[\s\S]*RETURN;/);
    expect(sql).toMatch(/GRANT ALL ON public\.lifecycle_email_log TO service_role/);
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\b/i);
  });
});
