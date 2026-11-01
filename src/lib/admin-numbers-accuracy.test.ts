/**
 * Admin numbers must be true: live money only, every row counted, demo
 * workspaces excluded, refunds subtracted once, and failures shown as
 * failures rather than zeros.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { netRevenue } from "@/lib/monthly-report";

const read = (path: string) => readFileSync(path, "utf8");
const admin = read("src/lib/admin.functions.ts");
const slice = (from: string, to: string) => admin.slice(admin.indexOf(from), admin.indexOf(to, admin.indexOf(from)));

describe("overview recurring revenue", () => {
  const metrics = slice("export const getPlatformMetrics", "/** All client tenants");

  it("comes from live active Stripe subscriptions on real workspaces, not status fields", () => {
    expect(metrics).toContain('.eq("environment", "live")');
    expect(metrics).toContain('.eq("status", "active")');
    expect(metrics).toContain("sub.cancel_at_period_end");
    expect(metrics).toContain("orgs.rows.filter((o) => customers.has(o.id))");
    expect(metrics).not.toContain('o.subscription_status === "active"');
  });

  it("throws instead of reporting zero when a read fails", () => {
    expect(metrics).toContain("if (failed) throw new Error(");
  });
});

describe("client list counts", () => {
  const clients = slice("export const listClients", "export const getClientDetail");

  it("reads every row instead of 1,000 shared by all clients", () => {
    expect(clients).not.toContain('.in("organization_id", ids)');
    expect(clients).toContain('.order("id").range(from, to)');
    expect(clients).toContain("netRevenue(p).net");
  });
});

describe("monthly report", () => {
  const monthly = slice("export const getMonthlyBusinessReport", "\n/**");

  it("counts live money only, pages every table and fails loudly", () => {
    expect(monthly).toContain('.eq("environment", "live")');
    expect(monthly).toContain("fetchAllRows<T>");
    expect(monthly).toContain("throw new Error(\"Couldn't read the monthly numbers");
  });
});

describe("payments page totals", () => {
  it("subtracts a refund once and keeps refunded payments in gross", () => {
    expect(netRevenue({ organization_id: null, amount: 350, status: "refunded", refunded_amount: 350, created_at: null })).toEqual({ gross: 350, refunded: 350, net: 0 });
    expect(netRevenue({ organization_id: null, amount: 350, status: "partially_refunded", refunded_amount: 50, created_at: null }).net).toBe(300);
    const page = read("src/routes/_authenticated/admin.payments.tsx");
    expect(page).toContain('rows.filter((p) => p.environment === "live")');
    expect(page).toContain("live.map((p) => netRevenue(p))");
    expect(page).toContain(") : isError ? (");
    expect(read("src/lib/payments.hooks.ts")).toContain("refetchInterval: 60_000");
  });
});

describe("monitoring totals", () => {
  it("uses exact counts so an error storm doesn't plateau at 1,000", () => {
    const monitoring = read("src/lib/monitoring.functions.ts");
    expect(monitoring).toContain('select("id", { count: "exact", head: true })');
    expect(monitoring).toContain("last7d: week.error ? rows.length : (week.count ?? 0)");
  });
});

describe("live activity feed", () => {
  const activity = slice("export const getPlatformActivity", "\nexport const");

  it("names every business in the feed and counts the whole window", () => {
    expect(activity).toContain('.select("id, name, is_demo").in("id", referenced)');
    expect(activity).toContain('.eq("is_demo", true)');
    expect(activity).toContain("leads: exactOr(leadTotal,");
  });
});

describe("funnel paid stage", () => {
  it("never divides all-time customers by this period's trials", () => {
    const funnel = read("src/lib/platform-funnel.functions.ts");
    expect(funnel).toContain("rate: pct(convertedTrials, trialsStarted),");
    expect(funnel).toContain("visitorsToPaid: pct(convertedTrials, visitors),");
    expect(funnel).not.toContain("pct(paid, trialsStarted)");
  });
});

describe("client detail", () => {
  it("reads every lead and booking for the client", () => {
    const detail = slice("export const getClientDetail", "\nexport const");
    expect(detail).toContain('.eq("organization_id", id)\n          .neq("source", TEST_LEAD_SOURCE)\n          .order("id")');
    expect(detail).not.toContain(".limit(5000)");
  });
});

describe("admin pages stay live", () => {
  it("refreshes operational pages on their own", () => {
    for (const page of ["index", "clients", "domains", "backups", "websites", "analytics", "monthly", "monitoring", "ai"]) {
      expect(read(`src/routes/_authenticated/admin.${page}.tsx`), page).toContain("refetchInterval");
    }
  });
});

describe("client list database counts", () => {
  const clients = slice("export const listClients", "export const getClientDetail");
  const migration = read("supabase/migrations/20261031180000_admin_client_counts.sql");

  it("uses the grouped function and falls back to reading tables when it is missing", () => {
    expect(clients).toContain('.rpc("admin_client_counts")');
    expect(clients).toContain("useDbCounts");
    expect(clients).toContain('all<{ organization_id: string }>("leads", "organization_id", (q) => q.neq("source", TEST_LEAD_SOURCE))');
  });

  it("migration is additive, invoker-only and service-role-only", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admin_client_counts()");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE|INSERT)\b\s/i);
    expect(migration).not.toMatch(/SECURITY DEFINER/i);
  });
});

describe("test leads stay out of admin numbers", () => {
  const pieces: [string, string][] = [
    ["platform metrics 30-day leads", slice("export const getPlatformMetrics", "\nexport const")],
    ["client list fallback", slice("export const listClients", "export const getClientDetail")],
    ["client detail", slice("export const getClientDetail", "\nexport const")],
    ["activity feed", slice("export const getPlatformActivity", "\nexport const")],
  ];
  it.each(pieces)("%s excludes source test_lead", (_name, code) => {
    expect(code).toContain("TEST_LEAD_SOURCE");
  });
  it("monthly report lead read excludes test leads", () => {
    expect(admin).toContain('.select("id, organization_id, created_at").neq("source", TEST_LEAD_SOURCE)');
  });
  it("every leads read in admin.functions.ts filters them (no unfiltered leads read left)", () => {
    const reads = admin.split(/from\("leads"\)|"leads", "organization_id"|windowCount\("leads"/).slice(1);
    expect(reads.length).toBeGreaterThanOrEqual(6);
    for (const after of reads) expect(after.slice(0, 260)).toContain("TEST_LEAD_SOURCE");
  });

  const fix = read("supabase/migrations/20261031200000_admin_client_counts_exclude_test_leads.sql");
  it("database function version excludes test leads, additive and service-role-only", () => {
    expect(fix).toContain("CREATE OR REPLACE FUNCTION public.admin_client_counts()");
    expect(fix).toContain("WHERE l.source IS DISTINCT FROM 'test_lead'");
    expect(fix).toContain("SECURITY INVOKER");
    expect(fix).toContain("FROM PUBLIC, anon, authenticated");
    expect(fix).toContain("TO service_role");
    expect(fix).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE|INSERT)\b\s/i);
    expect(fix).not.toMatch(/SECURITY DEFINER/i);
  });
  it("keeps the table-read fallback for when the function is missing", () => {
    expect(slice("export const listClients", "export const getClientDetail")).toContain("useDbCounts");
  });
});
