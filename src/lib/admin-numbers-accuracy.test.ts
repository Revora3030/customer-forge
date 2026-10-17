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
    expect(metrics).toContain("orgs.rows.filter((o) => !o.is_demo)");
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
