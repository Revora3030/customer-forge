/**
 * syncStripeSubscription's fenced compare-and-set write, against a scripted
 * Supabase stand-in: contention retries, the missing-column fallback (code
 * deployed before the migration), and fenced events writing nothing.
 */
import { describe, expect, it } from "vitest";
import { syncStripeSubscription } from "@/lib/stripe-billing.server";

type Result = { data: unknown; error: { code?: string; message?: string } | null };
type Call = { op: string; table: string; cols?: string | undefined; patch?: Record<string, unknown>; filters: [string, string, unknown][] };

/** Each awaited query pops the next scripted result for its op ("select" / "update" / "insert"). */
function scriptedAdmin(script: Record<string, Result[]>) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const call: Call = { op: "select", table, filters: [] };
    const b = {
      select(cols?: string) { if (call.op === "select") call.cols = cols; return b; },
      update(patch: Record<string, unknown>) { call.op = "update"; call.patch = patch; return b; },
      insert(patch: Record<string, unknown>) { call.op = "insert"; call.patch = patch; return b; },
      eq(col: string, val: unknown) { call.filters.push(["eq", col, val]); return b; },
      is(col: string, val: unknown) { call.filters.push(["is", col, val]); return b; },
      maybeSingle() { return b; },
      then(resolve: (r: Result) => unknown) {
        calls.push(call);
        const next = script[call.op]?.shift() ?? { data: null, error: null };
        return Promise.resolve(resolve(next));
      },
    };
    return b;
  };
  return { admin: { from: builder } as never, calls, };
}

const sub = (status: string, id = "sub_A") => ({
  id,
  status,
  customer: "cus_1",
  metadata: { organizationId: "org_1", userId: "user_1" },
  items: { data: [{ price: { id: "price_x" }, current_period_start: 1, current_period_end: 2 }] },
});

const row = (status: string, version: string, last: number | null = 100) => ({
  id: "row_1",
  status,
  provider_subscription_id: "sub_A",
  updated_at: version,
  last_stripe_event_created: last,
});

describe("syncStripeSubscription fenced write", () => {
  it("writes with a compare-and-set on updated_at and advances the fence", async () => {
    const { admin, calls } = scriptedAdmin({
      select: [{ data: row("trialing", "v1"), error: null }],
      update: [{ data: [{ id: "row_1" }], error: null }],
    });
    const result = await syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 });
    expect(result).toMatchObject({ ok: true, applied: true });
    const update = calls.find((c) => c.op === "update")!;
    expect(update.patch).toMatchObject({ status: "active", last_stripe_event_created: 150 });
    expect(update.filters).toContainEqual(["eq", "updated_at", "v1"]);
  });

  it("re-reads and decides again when another worker wrote first", async () => {
    const { admin, calls } = scriptedAdmin({
      select: [
        { data: row("active", "v1", 100), error: null },
        // The other worker canceled it in the meantime.
        { data: row("canceled", "v2", 200), error: null },
      ],
      update: [{ data: [], error: null }],
    });
    const result = await syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 });
    expect(result).toMatchObject({ ok: true, applied: false, fence: "stale_fenced" });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
  });

  it("retries an insert race (23505) as an update", async () => {
    const { admin } = scriptedAdmin({
      select: [{ data: null, error: null }, { data: row("trialing", "v1", 100), error: null }],
      insert: [{ data: null, error: { code: "23505", message: "duplicate" } }],
      update: [{ data: [{ id: "row_1" }], error: null }],
    });
    expect(await syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 })).toMatchObject({ applied: true });
  });

  it("hands the event back to Stripe after repeated contention", async () => {
    const { admin } = scriptedAdmin({
      select: [1, 2, 3].map((n) => ({ data: row("active", `v${n}`), error: null })),
      update: [1, 2, 3].map(() => ({ data: [], error: null })),
    });
    await expect(syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 })).rejects.toThrow(
      "subscription_upsert_failed:contended",
    );
  });

  it("works before the migration is applied (fence column missing), keeping canceled terminal", async () => {
    const missing = { data: null, error: { code: "42703", message: 'column subscriptions.last_stripe_event_created does not exist' } };
    const { admin, calls } = scriptedAdmin({
      select: [missing, { data: { ...row("canceled", "v1"), last_stripe_event_created: undefined }, error: null }],
    });
    const result = await syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 });
    expect(result).toMatchObject({ ok: true, applied: false, fence: "terminal_blocked" });
    expect(calls[1]!.cols).not.toContain("last_stripe_event_created");
  });

  it("drops the fence column from the write when only the write reports it missing", async () => {
    const { admin, calls } = scriptedAdmin({
      select: [{ data: row("trialing", "v1"), error: null }, { data: row("trialing", "v1"), error: null }],
      update: [
        { data: null, error: { code: "PGRST204", message: "Could not find the 'last_stripe_event_created' column" } },
        { data: [{ id: "row_1" }], error: null },
      ],
    });
    expect(await syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 })).toMatchObject({ applied: true });
    const updates = calls.filter((c) => c.op === "update");
    expect(updates[1]!.patch).not.toHaveProperty("last_stripe_event_created");
  });

  it("surfaces other write failures so Stripe retries", async () => {
    const { admin } = scriptedAdmin({
      select: [{ data: row("trialing", "v1"), error: null }],
      update: [{ data: null, error: { code: "57014", message: "timeout" } }],
    });
    await expect(syncStripeSubscription(admin, sub("active"), "sandbox", { eventCreated: 150 })).rejects.toThrow(
      "subscription_upsert_failed:57014",
    );
  });
});
