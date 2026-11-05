import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: vi.fn(async () => ({ sent: true })) }));

import {
  cleanDomain,
  isoWeekKey,
  leadReminderMessage,
  runLeadReminders,
  runWeeklyReports,
  runSiteHealth,
  weeklyReportMessage,
} from "@/lib/owner-reports.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

/** A tiny chainable fake of the Supabase query builder. */
function fakeDb(tables: Record<string, unknown[]>, opts: { claimFails?: boolean; honorDates?: boolean } = {}) {
  const inserted: unknown[] = [];
  const from = (table: string) => {
    const result = { data: tables[table] ?? [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "lt", "gt", "gte", "in", "order", "limit", "update", "delete"]) chain[m] = () => chain;
    if (opts.honorDates) {
      // Date windows (gte on a timestamp column) are applied, so week-over-week numbers are real.
      chain["gte"] = (column: string, value: string) => {
        result.data = (result.data as Record<string, unknown>[]).filter((row) => typeof row[column] !== "string" || (row[column] as string) >= value);
        return chain;
      };
    }
    chain["maybeSingle"] = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(result);
    chain["insert"] = async (row: unknown) => {
      inserted.push(row);
      return { error: opts.claimFails ? { message: "duplicate" } : null };
    };
    return chain;
  };
  return { db: { from } as never, inserted };
}

describe("owner reports run in the app, not n8n", () => {
  it("builds an ISO week key", () => {
    expect(isoWeekKey(new Date("2026-10-05T12:00:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });

  it("cleans stored domains and rejects junk", () => {
    expect(cleanDomain("https://Elite.com/path")).toBe("elite.com");
    expect(cleanDomain("not a domain")).toBeNull();
    expect(cleanDomain("")).toBeNull();
  });

  it("writes reminder and weekly copy from real numbers only", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const text = leadReminderMessage([{ organization_id: "o", name: "Sam", phone: "919", email: null, service_interest: "Full", created_at: "2026-10-07T12:00:00Z" }], now);
    expect(text).toContain("Sam — 919 — Full (waiting 48h)");
    expect(weeklyReportMessage("Elite", { leads: 0, uncontacted: 0, won: 0, appointments: 0 })).toContain("No new leads");
    expect(weeklyReportMessage("Elite", { leads: 3, uncontacted: 1, won: 1, appointments: 2 })).toContain("New leads: 3");
  });

  it("emails each workspace its own stale leads once", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const { db, inserted } = fakeDb({
      organizations: [{ id: "o1", name: "Elite" }],
      business_profiles: [{ organization_id: "o1", notification_email: "owner@elite.com", notify_on_lead: true }],
      leads: [{ organization_id: "o1", name: "Sam", phone: "919", email: null, service_interest: null, created_at: "2026-10-07T12:00:00Z" }],
    });
    const run = await runLeadReminders(db, Date.parse("2026-10-09T12:00:00Z"));
    expect(run.sent).toBe(1);
    expect(inserted[0]).toMatchObject({ organization_id: "o1", kind: "lead_reminder", window_key: "2026-10-09" });
    expect(vi.mocked(sendTemplateEmail).mock.calls[0]?.[1]).toBe("owner@elite.com");
  });

  it("never sends twice when the slot is already claimed", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const { db } = fakeDb(
      {
        organizations: [{ id: "o1", name: "Elite" }],
        business_profiles: [{ organization_id: "o1", email: "owner@elite.com" }],
        leads: [{ organization_id: "o1", name: "Sam", phone: "919", email: null, service_interest: null, created_at: "2026-10-07T12:00:00Z" }],
      },
      { claimFails: true },
    );
    const run = await runLeadReminders(db, Date.parse("2026-10-09T12:00:00Z"));
    expect(run.sent).toBe(0);
    expect(run.skipped).toBe(1);
    expect(sendTemplateEmail).not.toHaveBeenCalled();
  });

  it("reports a site that does not load and stays quiet when all load", async () => {
    const { db } = fakeDb({ website_settings: [{ organization_id: "o1", custom_domain: "elite.com" }], organizations: [{ id: "p" }] });
    const ok = await runSiteHealth(db, (async () => new Response("ok", { status: 200 })) as never);
    expect(ok.scanned).toBe(2);
    expect(ok.down).toHaveLength(0);
    const down = await runSiteHealth(db, (async (url: string) => new Response("x", { status: String(url).includes("elite") ? 503 : 200 })) as never);
    expect(down.down.map((d) => d.label)).toEqual(["elite.com"]);
    expect(down.sent).toBe(1);
  });

  it("is scheduled by GitHub Actions", () => {
    const yml = readFileSync(".github/workflows/scheduled-jobs.yml", "utf8");
    for (const job of ["lead-reminder", "weekly-report", "site-health"]) expect(yml).toContain(`job=${job}`);
  });
});

describe("Monday digest (B12-9)", () => {
  const now = Date.parse("2026-11-09T13:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

  it("adds only real extras to the existing weekly email, once per week", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const { db, inserted } = fakeDb({
      organizations: [{ id: "o1", name: "Elite" }],
      business_profiles: [{ organization_id: "o1", notification_email: "owner@elite.com", notify_on_lead: true }],
      leads: [
        { organization_id: "o1", status: "new", source: "google", created_at: ago(1) },
        { organization_id: "o1", status: "booked", source: "google", created_at: ago(2) },
        { organization_id: "o1", status: "new", source: "facebook", created_at: ago(10) },
      ],
      appointments: [{ organization_id: "o1" }],
      quotes: [{ id: "q1", created_at: ago(1) }],
      quote_line_items: [{ quote_id: "q1", quantity: 2, unit_price: 100 }],
      analytics_events: [{ session_id: "s1", created_at: ago(1) }, { session_id: "s2", created_at: ago(3) }],
      agent_suggestions: [{ title: "Answer 2 waiting leads", body: "Over a day old." }],
      site_content_audits: [{ reachable: true, p1_count: 1, p2_count: 0, findings: [{ check: "broken-link" }], audited_at: ago(2) }],
    }, { honorDates: true });
    const run = await runWeeklyReports(db, now);
    expect(run.sent).toBe(1);
    expect(inserted).toHaveLength(1);
    const body = String((vi.mocked(sendTemplateEmail).mock.calls[0]![2] as { templateData: { message: string } }).templateData.message);
    expect(body).toContain("New leads: 2");
    expect(body).toContain("New leads this week were up 1 from last week.");
    expect(body).toContain("google (2)");
    expect(body).toContain("$200 in total");
    expect(body).toContain("Website visits: 2 from 2 visitors");
    expect(body).toContain("Answer 2 waiting leads");
    expect(body).toContain("Form completion rate: not tracked yet");
    expect(body).toContain("Broken links: 1");
    expect(body).toContain("Sitemap, indexed pages and page speed: not tracked yet");
  });

  it("still sends the plain weekly report when the extra numbers cannot be read", async () => {
    vi.mocked(sendTemplateEmail).mockClear();
    const real = fakeDb({
      organizations: [{ id: "o1", name: "Elite" }],
      business_profiles: [{ organization_id: "o1", notification_email: "owner@elite.com", notify_on_lead: true }],
      leads: [{ organization_id: "o1", status: "new", source: "google", created_at: ago(1) }],
      appointments: [],
    });
    const from = (real.db as unknown as { from: (t: string) => Record<string, unknown> }).from;
    const db = {
      from: (table: string) => {
        if (table === "agent_suggestions") throw new Error("table missing");
        return from(table);
      },
    } as never;
    const run = await runWeeklyReports(db, now);
    expect(run.sent).toBe(1);
    const body = String((vi.mocked(sendTemplateEmail).mock.calls[0]![2] as { templateData: { message: string } }).templateData.message);
    expect(body).toContain("New leads: 1");
    expect(body).not.toContain("Also this week");
  });
});

