/**
 * The funnel must stay trustworthy: no double counting, no browser-decided
 * payments, no truncated analytics, and a failed query must never render as 0.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("authoritative funnel", () => {
  const source = read("./platform-funnel.functions.ts");

  it("counts accounts from the database table, keyed by the auth user", () => {
    expect(source).toContain('from("platform_accounts")');
    expect(source).toContain("user_id: context.userId");
    expect(source).toContain('onConflict: "user_id"');
  });

  it("counts trials from unique workspaces, excluding demo workspaces", () => {
    expect(source).toContain('from("platform_trials")');
    expect(source).toContain("!o.is_demo");
  });

  it("counts paid customers only from stored Stripe subscription state", () => {
    expect(source).toContain('from("subscriptions")');
    expect(source).toContain('s.status === "active"');
  });

  it("returns null (unavailable), never 0, when a query fails", () => {
    expect(source).toContain("count: number | null");
    expect(source).toContain('errors.push("accounts")');
    expect(source).toContain("? null");
  });

  it("provisions workspaces through the server-only transactional function", () => {
    expect(source).toContain('rpc("provision_workspace_server"');
    expect(source).toContain("_user_id: context.userId");
    expect(source).toContain("supabaseAdmin");
    expect(source).not.toContain('rpc("provision_workspace",');
  });

  it("labels browser telemetry as sessions, not verified visitors", () => {
    expect(source).toContain("Unique sessions");
  });
});

describe("signup flow cannot double count or double provision", () => {
  const source = read("../routes/get-started.tsx");

  it("no longer creates the workspace from the browser", () => {
    expect(source).not.toContain('.from("organizations")\n      .insert(');
    expect(source).not.toContain('.from("memberships")\n      .insert(');
    expect(source).toContain("provisionWorkspace(");
  });

  it("fires the signup event at most once", () => {
    expect(source.split('trackConversion("signup_completed"').length - 1).toBeLessThanOrEqual(0);
  });
});

describe("payment truth", () => {
  it("the browser return from Stripe is telemetry only", () => {
    const welcome = read("../routes/_authenticated/app.welcome.tsx");
    expect(welcome).not.toContain('trackConversion("checkout_completed")');
    expect(welcome).toContain('trackConversion("checkout_return")');
  });

  it("failed payment writes throw so Stripe retries", () => {
    const billing = read("./stripe-billing.server.ts");
    expect(billing).toContain("subscription_upsert_failed");
    expect(billing).toContain("payment_insert_failed");
  });

  it("analytics reports are paginated instead of truncated", () => {
    const conversion = read("./conversion.functions.ts");
    expect(conversion).not.toContain(".limit(5000)");
    expect(conversion).not.toContain(".limit(20000)");
    expect(conversion).toContain(".range(page * 1000");
  });
});

describe("search data describes a service, not a retail product", () => {
  const seo = read("./seo.ts");
  it("uses Service schema for the growth system", () => {
    expect(seo).toContain('"@type": "Service",\n  name: GROWTH_SYSTEM.name');
    expect(seo).not.toContain('"@type": "Product"');
  });
});
