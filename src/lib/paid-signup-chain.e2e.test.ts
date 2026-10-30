/**
 * Paid signup, end to end through the REAL payment webhook route.
 *
 * Stripe events are signed with test webhook secrets and POSTed to the route
 * handler exactly as Stripe would deliver them. Only the edges are faked: the
 * database (an in-memory Supabase stand-in), Stripe's session re-read, and the
 * email sender. Nothing here reaches a network, a real database, or Stripe.
 *
 * Covered: subscription start (trial month), the first invoice that carries
 * the $350 setup, checkout completion (setup unlock), the workspace provision
 * trigger, the build-start gate, a renewal on the current Stripe API shape, a
 * failed payment, duplicate delivery, forged events, and sandbox isolation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  sendEmail: vi.fn(),
  retrieveSession: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
}));
vi.mock("@/lib/payments.server", () => ({
  adminClient: async () => mocks.db,
  applyEntitlement: vi.fn(),
  logPaymentActivity: vi.fn(),
}));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: mocks.sendEmail }));
vi.mock("@/lib/stripe.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe.server")>();
  return {
    ...actual,
    createStripeClient: () => ({ checkout: { sessions: { retrieve: mocks.retrieveSession } } }),
  };
});

import { Route as webhookRoute } from "@/routes/api/public/payments/webhook";
import { STRIPE_CATALOG, MONTHLY_PRICE_LOOKUP_KEY } from "@/lib/stripe-catalog";
import { resolveAccess } from "@/lib/access-state";
import { orgEntitlement } from "@/lib/entitlement.server";
import { blocksAutoBuild } from "@/lib/builder/job-liveness";
import { GROWTH_PLAN_ID } from "@/lib/stripe-billing.server";

// ---------------------------------------------------------------------------
// In-memory Supabase stand-in (only what the payment path uses).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const UNIQUE: Record<string, string[][]> = {
  payment_events: [["provider", "provider_event_id"]],
  business_profiles: [["organization_id"]],
  subscriptions: [["organization_id", "payment_provider", "environment"]],
};

let idSeq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, "0")}`;

function containsShallow(value: unknown, expected: Row) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(expected).every(([k, v]) => (value as Row)[k] === v);
}

class Query {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] = [];
  private returning = false;
  private head = false;
  private countMode = false;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, options?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (options?.count) this.countMode = true;
    if (options?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], options?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = (options?.onConflict ?? "id").split(",").map((c) => c.trim());
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  neq(col: string, val: unknown) { this.filters.push((r) => r[col] !== val); return this; }
  in(col: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  is(col: string, val: unknown) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  gte(col: string, val: string) { this.filters.push((r) => String(r[col] ?? "") >= val); return this; }
  lte(col: string, val: string) { this.filters.push((r) => String(r[col] ?? "") <= val); return this; }
  contains(col: string, val: Row) { this.filters.push((r) => containsShallow(r[col], val)); return this; }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }

  private rows() { return (this.db.tables[this.table] ??= []); }
  private matches(row: Row) { return this.filters.every((f) => f(row)); }
  private violates(row: Row, ignore?: Row) {
    return (UNIQUE[this.table] ?? []).some((cols) =>
      this.rows().some((other) => other !== ignore && cols.every((c) => other[c] === row[c])),
    );
  }

  private execute(): { data: unknown; error: { code: string; message: string } | null; count?: number } {
    const table = this.rows();
    let out: Row[] = [];
    if (this.op === "insert") {
      for (const input of this.payload) {
        const row: Row = { id: newId(), created_at: new Date().toISOString(), ...input };
        if (this.violates(row)) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        table.push(row);
        out.push(row);
      }
    } else if (this.op === "upsert") {
      for (const input of this.payload) {
        const existing = table.find((r) => this.conflict.every((c) => r[c] === input[c]));
        if (existing) { Object.assign(existing, input); out.push(existing); }
        else { const row = { id: newId(), created_at: new Date().toISOString(), ...input }; table.push(row); out.push(row); }
      }
    } else if (this.op === "update") {
      out = table.filter((r) => this.matches(r));
      for (const row of out) Object.assign(row, this.patch);
    } else if (this.op === "delete") {
      out = table.filter((r) => this.matches(r));
      this.db.tables[this.table] = table.filter((r) => !out.includes(r));
    } else {
      out = table.filter((r) => this.matches(r));
    }
    if (this.max !== null) out = out.slice(0, this.max);
    const copy = out.map((r) => structuredClone(r));
    if (this.op === "select" && this.countMode && this.head) return { data: null, error: null, count: copy.length };
    if (this.op !== "select" && !this.returning) return { data: null, error: null };
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    if (this.mode === "single") {
      return copy.length === 1
        ? { data: copy[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "expected one row" } };
    }
    return { data: copy, error: null, count: copy.length };
  }

  then<T>(resolve: (value: ReturnType<Query["execute"]>) => T, reject?: (e: unknown) => T) {
    try { return Promise.resolve(resolve(this.execute())); } catch (e) { return reject ? Promise.resolve(reject(e)) : Promise.reject(e); }
  }
}

class FakeDb {
  tables: Record<string, Row[]> = {};
  users: Record<string, string> = {};
  from(table: string) { return new Query(this, table); }
  async rpc() { return { data: null, error: null }; }
  auth = {
    admin: {
      getUserById: async (id: string) => ({
        data: { user: this.users[id] ? { id, email: this.users[id] } : null },
        error: null,
      }),
    },
  };
  rowsOf(table: string) { return this.tables[table] ?? []; }
  org(id: string) { return this.rowsOf("organizations").find((r) => r["id"] === id) as Row; }
}

// ---------------------------------------------------------------------------
// Signed delivery helpers.
// ---------------------------------------------------------------------------
const SECRETS = { sandbox: "whsec_test_e2e_sandbox", live: "whsec_test_e2e_live" } as const;
type Env = keyof typeof SECRETS;

async function hmac(body: string, secret: string, t: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

let eventSeq = 0;
type Handlers = { server: { handlers: { POST: (i: { request: Request }) => Promise<Response>; GET: (i: { request: Request }) => Promise<Response> } } };
const route = webhookRoute as unknown as Handlers;
const WEBHOOK_URL = (env: string) => `https://revora.test/api/public/payments/webhook?env=${env}`;

async function deliver(env: Env, type: string, object: Row, opts: { id?: string; secret?: string } = {}) {
  const body = JSON.stringify({ id: opts.id ?? `evt_e2e_${++eventSeq}`, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const request = new Request(WEBHOOK_URL(env), {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${await hmac(body, opts.secret ?? SECRETS[env], t)}` },
    body,
  });
  const response = await route.server.handlers.POST({ request });
  return { status: response.status, body: await response.text() };
}

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
const nowSec = () => Math.floor(Date.now() / 1000);
const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";

function seed(db: FakeDb, orgId = ORG, owner = OWNER) {
  // Created long ago so the free window is over: access must come from payment.
  (db.tables["organizations"] ??= []).push({
    id: orgId,
    name: "Acme Plumbing",
    created_at: new Date(Date.now() - 90 * DAY).toISOString(),
    trial_ends_at: new Date(Date.now() - 60 * DAY).toISOString(),
    subscription_status: null,
    setup_paid_at: null,
    setup_payment_status: null,
    plan_id: null,
    is_demo: false,
    is_suspended: false,
  });
  (db.tables["memberships"] ??= []).push({ organization_id: orgId, user_id: owner, role: "owner" });
  db.users[owner] = "owner@acme.test";
}

const catalog = (env: Env) => STRIPE_CATALOG[env];

function subscription(env: Env, status: string, orgId = ORG, id = "sub_E2Etest1") {
  return {
    id,
    object: "subscription",
    status,
    customer: "cus_e2e_1",
    cancel_at_period_end: false,
    metadata: { organizationId: orgId, userId: OWNER },
    trial_start: nowSec(),
    trial_end: nowSec() + 30 * 86_400,
    items: {
      data: [
        {
          price: { id: catalog(env).monthly.stripePriceId, lookup_key: MONTHLY_PRICE_LOOKUP_KEY },
          current_period_start: nowSec(),
          current_period_end: nowSec() + 30 * 86_400,
        },
      ],
    },
  };
}

/** Invoice in the current (2025-03-31+, "dahlia") shape: price ids live under pricing. */
function invoice(env: Env, id: string, opts: { reason: string; paid: number; due?: number; setup?: boolean; monthly: number }) {
  const lines: Row[] = [
    {
      amount: opts.monthly,
      pricing: { price_details: { price: catalog(env).monthly.stripePriceId } },
      period: { start: nowSec(), end: nowSec() + 30 * 86_400 },
    },
  ];
  if (opts.setup) lines.unshift({ amount: 35_000, pricing: { price_details: { price: catalog(env).setup.stripePriceId } }, period: { start: nowSec(), end: nowSec() } });
  return {
    id,
    object: "invoice",
    billing_reason: opts.reason,
    amount_paid: opts.paid,
    amount_due: opts.due ?? opts.paid,
    currency: "usd",
    customer_email: "owner@acme.test",
    // No workspace metadata: the org must be found from the stored subscription.
    parent: { subscription_details: { subscription: "sub_E2Etest1" } },
    lines: { data: lines },
  };
}

function checkoutCompleted(orgId = ORG, id = "cs_e2e_1") {
  return {
    id,
    object: "checkout.session",
    mode: "subscription",
    payment_status: "paid",
    metadata: { kind: "growth_system", organizationId: orgId, userId: OWNER },
    customer_details: { email: "owner@acme.test" },
  };
}

function stripeSession(env: Env, orgId = ORG, setupCents = 35_000) {
  return {
    id: "cs_e2e_1",
    mode: "subscription",
    payment_status: "paid",
    currency: "usd",
    metadata: { kind: "growth_system", organizationId: orgId, userId: OWNER },
    line_items: {
      data: [
        { price: { id: catalog(env).setup.stripePriceId, unit_amount: setupCents } },
        { price: { id: catalog(env).monthly.stripePriceId, unit_amount: 10_000, recurring: { interval: "month" } } },
      ],
    },
  };
}

const payments = (db: FakeDb, orgId = ORG) => db.rowsOf("payments").filter((p) => p["organization_id"] === orgId);
const emailsTo = (template: string) => mocks.sendEmail.mock.calls.filter((c) => c[0] === template);

beforeEach(() => {
  mocks.db = new FakeDb();
  mocks.sendEmail.mockReset().mockResolvedValue({ ok: true });
  mocks.retrieveSession.mockReset();
  process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"] = SECRETS.sandbox;
  process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"] = SECRETS.live;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("paid signup chain (live webhook events, mocked edges)", () => {
  it("subscription start -> first invoice -> checkout complete unlocks setup, provisions, and opens the build gate", async () => {
    const db = mocks.db;
    seed(db);

    // Before paying: the free window is over, nothing is unlocked.
    expect(resolveAccess(db.org(ORG) as never).allowed).toBe(false);

    // 1) customer.subscription.created (30-day free month on the $100 plan).
    expect((await deliver("live", "customer.subscription.created", subscription("live", "trialing"))).status).toBe(200);
    const sub = db.rowsOf("subscriptions")[0]!;
    expect(sub).toMatchObject({ organization_id: ORG, environment: "live", status: "trialing", provider_subscription_id: "sub_E2Etest1", plan_id: GROWTH_PLAN_ID });
    expect(db.org(ORG)["subscription_status"]).toBe("trialing");
    // Provision trigger: profile + website build ticket, exactly once.
    expect(db.rowsOf("business_profiles").filter((r) => r["organization_id"] === ORG)).toHaveLength(1);
    const tickets = db.rowsOf("website_requests").filter((r) => r["organization_id"] === ORG);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ title: "Build the Acme Plumbing website", status: "requested", kind: "new_site" });
    expect(emailsTo("billing-welcome")).toHaveLength(1);
    expect(emailsTo("billing-sale-alert")).toHaveLength(1);

    // 2) invoice.paid for the first invoice: $350 setup + $0 trial month.
    expect((await deliver("live", "invoice.paid", invoice("live", "in_e2e_1", { reason: "subscription_create", paid: 35_000, setup: true, monthly: 0 }))).status).toBe(200);

    // 3) checkout.session.completed: verified against Stripe and the catalog.
    mocks.retrieveSession.mockResolvedValue(stripeSession("live"));
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted())).status).toBe(200);
    expect(mocks.retrieveSession).toHaveBeenCalledWith("cs_e2e_1", expect.anything());
    const org = db.org(ORG);
    expect(org["setup_payment_status"]).toBe("paid");
    expect(typeof org["setup_paid_at"]).toBe("string");
    expect(org["setup_checkout_session_id"]).toBe("cs_e2e_1");
    expect(org["plan_id"]).toBe(GROWTH_PLAN_ID);

    // The $350 is counted exactly once (setup record), never twice.
    const completed = payments(db).filter((p) => p["status"] === "completed");
    expect(completed.map((p) => (p["metadata"] as Row)["stripe_id"])).toEqual(["setup:cs_e2e_1"]);
    expect(completed.reduce((sum, p) => sum + Number(p["amount"]), 0)).toBe(350);

    // Build gate: the paid workspace is entitled and nothing blocks the first build.
    expect(resolveAccess(org as never).allowed).toBe(true);
    const entitlement = await orgEntitlement(db as never, ORG);
    expect(entitlement.allowed).toBe(true);
    expect(blocksAutoBuild(null)).toBe(false);
    // Documented gap: the webhook only files the build ticket; the build job
    // itself is queued by the owner's browser (onboarding / builder page).
    expect(db.rowsOf("generation_jobs")).toHaveLength(0);
  });

  it("is idempotent when Stripe re-delivers the same checkout event", async () => {
    const db = mocks.db;
    seed(db);
    await deliver("live", "customer.subscription.created", subscription("live", "trialing"));
    mocks.retrieveSession.mockResolvedValue(stripeSession("live"));
    const first = await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_dup_1" });
    const again = await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_dup_1" });
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(JSON.parse(again.body)).toMatchObject({ duplicate: true });
    expect(mocks.retrieveSession).toHaveBeenCalledTimes(1);
    expect(payments(db)).toHaveLength(1);
  });

  it("records a renewal on the current Stripe invoice shape with the right plan", async () => {
    const db = mocks.db;
    seed(db);
    await deliver("live", "customer.subscription.created", subscription("live", "active"));
    await deliver("live", "invoice.paid", invoice("live", "in_e2e_2", { reason: "subscription_cycle", paid: 10_000, monthly: 10_000 }));
    const renewal = payments(db).find((p) => (p["metadata"] as Row)["stripe_id"] === "in_e2e_2");
    expect(renewal).toBeDefined();
    expect(Number(renewal!["amount"])).toBe(100);
    expect(renewal!["status"]).toBe("completed");
    expect(String(renewal!["description"])).toContain(GROWTH_PLAN_ID);
  });

  it("a failed renewal marks the workspace past due, records the failure and tells the owner", async () => {
    const db = mocks.db;
    seed(db);
    await deliver("live", "customer.subscription.created", subscription("live", "active"));
    mocks.retrieveSession.mockResolvedValue(stripeSession("live"));
    await deliver("live", "checkout.session.completed", checkoutCompleted());

    expect((await deliver("live", "invoice.payment_failed", invoice("live", "in_e2e_3", { reason: "subscription_cycle", paid: 0, due: 10_000, monthly: 10_000 }))).status).toBe(200);
    expect((await deliver("live", "customer.subscription.updated", subscription("live", "past_due"))).status).toBe(200);

    const failed = payments(db).find((p) => (p["metadata"] as Row)["stripe_id"] === "in_e2e_3");
    expect(failed).toMatchObject({ status: "failed" });
    expect(Number(failed!["amount"])).toBe(100);
    expect(db.org(ORG)["subscription_status"]).toBe("past_due");
    expect(db.rowsOf("notifications").some((n) => n["organization_id"] === ORG && n["kind"] !== "success")).toBe(true);
    expect(mocks.sendEmail.mock.calls.some((c) => String(c[0]).includes("payment-failed") || String(c[0]).includes("failed"))).toBe(true);
    // Past due keeps the paid setup and stays usable while Stripe retries.
    const access = resolveAccess(db.org(ORG) as never);
    expect(access.state).toBe("PAST_DUE");
    expect(access.allowed).toBe(true);
  });

  it("never unlocks setup when the session's setup price does not match the offer", async () => {
    const db = mocks.db;
    seed(db);
    mocks.retrieveSession.mockResolvedValue(stripeSession("live", ORG, 100));
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted())).status).toBe(200);
    expect(db.org(ORG)["setup_paid_at"]).toBeNull();
    expect(payments(db)).toHaveLength(0);
  });

  it("alerts the founder once when a paid checkout fails verification", async () => {
    const db = mocks.db;
    seed(db);
    mocks.retrieveSession.mockResolvedValue(stripeSession("live", ORG, 100));
    await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_review_1" });
    await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_review_1" });
    const alerts = emailsTo("founder-alert");
    expect(alerts).toHaveLength(1);
    const data = (alerts[0]![2] as { templateData: { title: string; rows: [string, string][] } }).templateData;
    expect(data.title).toBe("A payment needs your review");
    expect(data.rows).toContainEqual(["Reason", "setup fee amount does not match the offer"]);
    expect(data.rows).toContainEqual(["Workspace", ORG]);
    expect(db.org(ORG)["setup_paid_at"]).toBeNull();
  });

  it("alerts the founder once when a claimed event fails and Stripe's retries are refused", async () => {
    const db = mocks.db;
    seed(db);
    mocks.retrieveSession.mockRejectedValue(new Error(`stripe unavailable ${["sk", "live", "abc123"].join("_")}`));
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_stuck_1" })).status).toBe(500);
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_stuck_1" })).status).toBe(503);
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted(), { id: "evt_stuck_1" })).status).toBe(503);
    const alerts = emailsTo("founder-alert");
    expect(alerts).toHaveLength(1);
    const data = (alerts[0]![2] as { templateData: { rows: [string, string][] } }).templateData;
    const reason = data.rows.find(([k]) => k === "Reason")?.[1] ?? "";
    expect(reason).toContain("stripe unavailable");
    expect(reason).not.toContain(["sk", "live"].join("_"));
  });

  it("rejects forged, unsigned and wrong-environment deliveries", async () => {
    const db = mocks.db;
    seed(db);
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted(), { secret: "whsec_wrong" })).status).toBe(400);
    expect((await deliver("live", "checkout.session.completed", checkoutCompleted(), { secret: SECRETS.sandbox })).status).toBe(400);
    const missingEnv = await route.server.handlers.POST({ request: new Request("https://revora.test/api/public/payments/webhook", { method: "POST", body: "{}" }) });
    expect(missingEnv.status).toBe(400);
    const get = await route.server.handlers.GET({ request: new Request(WEBHOOK_URL("live")) });
    expect(get.status).toBe(405);
    expect(db.org(ORG)["setup_paid_at"]).toBeNull();
    expect(mocks.retrieveSession).not.toHaveBeenCalled();
  });
});

describe("sandbox (test-mode) events stay out of production", () => {
  it("bookkeeps sandbox billing separately: no unlock, no org status, no customer or founder email", async () => {
    const db = mocks.db;
    seed(db);
    await deliver("sandbox", "customer.subscription.created", subscription("sandbox", "trialing"));
    await deliver("sandbox", "invoice.paid", invoice("sandbox", "in_sb_1", { reason: "subscription_create", paid: 35_000, setup: true, monthly: 0 }));
    mocks.retrieveSession.mockResolvedValue(stripeSession("sandbox"));
    await deliver("sandbox", "checkout.session.completed", checkoutCompleted());
    await deliver("sandbox", "customer.subscription.updated", { ...subscription("sandbox", "active"), cancel_at_period_end: true });

    expect(db.rowsOf("subscriptions")[0]).toMatchObject({ environment: "sandbox" });
    const org = db.org(ORG);
    expect(org["subscription_status"]).toBeNull();
    expect(org["setup_paid_at"]).toBeNull();
    expect(resolveAccess(org as never).allowed).toBe(false);
    expect(payments(db).every((p) => p["environment"] === "sandbox")).toBe(true);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(db.rowsOf("notifications").filter((n) => n["organization_id"] === ORG)).toHaveLength(0);
  });
});
