import { describe, expect, it } from "vitest";
import type { ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";
import { createToolRegistryV2 } from "@/lib/ai/tool-registry-v2.server";
import { gapsForDay } from "./bookings";
import { readToolsA } from "./index";
import { MAX_BYTES, MAX_ROWS } from "./shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LEAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const LEAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const QUOTE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const QUOTE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

type Call = { table: string; ops: Array<[string, unknown[]]> };

/** Fake client: records every chained call; returns per-table rows filtered by organization_id. */
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const result = () => {
        const org = call.ops.find(
          ([op, args]) => op === "eq" && args[0] === "organization_id",
        )?.[1][1];
        let rows = (tables[table] ?? []).filter((row) => row["organization_id"] === org);
        for (const [op, args] of call.ops) {
          if (op === "eq" && args[0] !== "organization_id") {
            rows = rows.filter((row) => row[args[0] as string] === args[1]);
          }
          if (op === "neq") {
            rows = rows.filter((row) => row[args[0] as string] !== args[1]);
          }
          if (op === "gte") {
            rows = rows.filter((row) => String(row[args[0] as string] ?? "") >= String(args[1]));
          }
          if (op === "lt") {
            rows = rows.filter((row) => String(row[args[0] as string] ?? "") < String(args[1]));
          }
          if (op === "in") {
            const set = new Set(args[1] as unknown[]);
            rows = rows.filter((row) => set.has(row[args[0] as string]));
          }
        }
        const limitOp = call.ops.find(([op]) => op === "limit");
        if (limitOp) rows = rows.slice(0, limitOp[1][0] as number);
        const order = call.ops.find(([op]) => op === "order");
        if (order) {
          const col = order[1][0] as string;
          const asc = (order[1][1] as { ascending?: boolean } | undefined)?.ascending !== false;
          rows = [...rows].sort((a, b) => {
            const av = String(a[col] ?? "");
            const bv = String(b[col] ?? "");
            return asc ? (av < bv ? -1 : av > bv ? 1 : 0) : av > bv ? -1 : av < bv ? 1 : 0;
          });
        }
        const single = call.ops.some(([op]) => op === "maybeSingle");
        return { data: single ? (rows[0] ?? null) : rows, error: null, count: rows.length };
      };
      const chain: Record<string, unknown> = {};
      for (const op of [
        "select",
        "eq",
        "neq",
        "not",
        "gte",
        "lt",
        "lte",
        "order",
        "limit",
        "range",
        "in",
        "maybeSingle",
        "insert",
        "update",
        "delete",
        "upsert",
      ]) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return chain;
        };
      }
      chain["then"] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject);
      return chain;
    },
  };
  return { client, calls };
}

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
const dayIso = (daysFromNow: number, hour: number, minute = 0) => {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};

function dataset() {
  const manyLeads = Array.from({ length: 60 }, (_, i) => ({
    organization_id: ORG,
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    phone: `555-010${i}`,
    status: i % 3 ? "new" : "completed",
    source: "web",
    campaign: null,
    city: "Raleigh",
    message: "Hi",
    service_interest: "HVAC",
    estimated_value: 100 + i,
    next_follow_up_at: null,
    last_contacted_at: null,
    first_response_at: null,
    notes: null,
    created_at: iso(-i * 3_600_000),
  }));
  return {
    leads: [
      {
        organization_id: ORG,
        id: LEAD_A,
        name: "Ada Owner",
        email: "ada@example.com",
        phone: "919-555-0100",
        status: "new",
        source: "web",
        campaign: "SPRING",
        city: "Durham",
        message: "Need a quote",
        service_interest: "AC",
        estimated_value: 400,
        next_follow_up_at: null,
        last_contacted_at: null,
        first_response_at: null,
        notes: "Priority",
        created_at: iso(-2 * 3_600_000),
      },
      {
        organization_id: OTHER,
        id: LEAD_B,
        name: "Other Secret",
        email: "secret-other@example.com",
        phone: "000-000-0000",
        status: "new",
        source: "web",
        campaign: null,
        city: "Elsewhere",
        message: "SECRET",
        service_interest: "x",
        estimated_value: 9999,
        next_follow_up_at: null,
        last_contacted_at: null,
        first_response_at: null,
        notes: "SECRET_NOTE",
        created_at: iso(-1 * 3_600_000),
      },
      ...manyLeads,
    ],
    quotes: [
      {
        organization_id: ORG,
        id: QUOTE_A,
        customer_name: "Ada Owner",
        customer_email: "ada@example.com",
        customer_phone: "919-555-0100",
        lead_id: LEAD_A,
        appointment_id: null,
        status: "draft",
        notes: "Winter tune-up",
        accepted_at: null,
        created_at: iso(-5 * 3_600_000),
        updated_at: iso(-5 * 3_600_000),
      },
      {
        organization_id: OTHER,
        id: QUOTE_B,
        customer_name: "Other",
        customer_email: "secret-other@example.com",
        customer_phone: "000",
        lead_id: LEAD_B,
        appointment_id: null,
        status: "sent",
        notes: "SECRET_QUOTE",
        accepted_at: null,
        created_at: iso(-4 * 3_600_000),
        updated_at: iso(-4 * 3_600_000),
      },
    ],
    quote_line_items: [
      {
        organization_id: ORG,
        quote_id: QUOTE_A,
        name: "Tune-up",
        unit_price: 150,
        quantity: 1,
        sort_order: 1,
      },
      {
        organization_id: ORG,
        quote_id: QUOTE_A,
        name: "Filter",
        unit_price: 25,
        quantity: 2,
        sort_order: 2,
      },
      {
        organization_id: OTHER,
        quote_id: QUOTE_B,
        name: "Secret line",
        unit_price: 999,
        quantity: 1,
        sort_order: 1,
      },
    ],
    appointments: [
      {
        organization_id: ORG,
        id: "appt-a",
        name: "Ada Owner",
        email: "ada@example.com",
        phone: "919-555-0100",
        starts_at: dayIso(1, 10),
        ends_at: dayIso(1, 11),
        status: "confirmed",
        notes: "Bring ladder",
        service_id: null,
        lead_id: LEAD_A,
      },
      {
        organization_id: OTHER,
        id: "appt-b",
        name: "Other Secret",
        email: "secret-other@example.com",
        phone: "000",
        starts_at: dayIso(1, 9),
        ends_at: dayIso(1, 17),
        status: "confirmed",
        notes: "SECRET_APPT",
        service_id: null,
        lead_id: LEAD_B,
      },
      {
        organization_id: ORG,
        id: "appt-cancel",
        name: "Cancelled",
        email: null,
        phone: null,
        starts_at: dayIso(2, 12),
        ends_at: dayIso(2, 13),
        status: "cancelled",
        notes: null,
        service_id: null,
        lead_id: null,
      },
    ],
    business_profiles: [
      {
        organization_id: ORG,
        hours: {
          mon: "9am-5pm",
          tue: "9am-5pm",
          wed: "9am-5pm",
          thu: "9am-5pm",
          fri: "9am-5pm",
          sat: "closed",
          sun: "closed",
        },
      },
      {
        organization_id: OTHER,
        hours: { mon: "8am-8pm" },
      },
    ],
    reviews: [
      {
        organization_id: ORG,
        id: "rev-a",
        author_name: "Sam",
        rating: 5,
        comment: "Great work",
        private_feedback: null,
        is_published: true,
        created_at: iso(-10 * 3_600_000),
        appointment_id: null,
      },
      {
        organization_id: ORG,
        id: "rev-low",
        author_name: "Pat",
        rating: 2,
        comment: "Late",
        private_feedback: "Never show this",
        is_published: true,
        created_at: iso(-8 * 3_600_000),
        appointment_id: null,
      },
      {
        organization_id: ORG,
        id: "rev-hidden",
        author_name: "Kim",
        rating: 4,
        comment: "Ok",
        private_feedback: "Door scratched",
        is_published: false,
        created_at: iso(-6 * 3_600_000),
        appointment_id: null,
      },
      {
        organization_id: OTHER,
        id: "rev-b",
        author_name: "Secret Reviewer",
        rating: 1,
        comment: "SECRET_REVIEW",
        private_feedback: "SECRET_FB",
        is_published: false,
        created_at: iso(-1 * 3_600_000),
        appointment_id: null,
      },
    ],
  };
}

type Out = Record<string, unknown> & {
  leads?: unknown[];
  quotes?: unknown[];
  bookings?: unknown[];
  gaps?: unknown[];
  reviews?: unknown[];
  unanswered?: unknown[];
  lead?: Record<string, unknown> | null;
  quote?: Record<string, unknown> | null;
};

function setup() {
  const { client, calls } = fakeClient(dataset());
  const context = {
    supabase: client,
    userId: "u",
    organizationId: ORG,
    isSuperAdmin: false,
    runId: "33333333-3333-4333-8333-333333333333",
    stepId: "44444444-4444-4444-8444-444444444444",
  } as unknown as ToolContextV2;
  const registry = createToolRegistryV2(readToolsA(), { audit: async () => undefined });
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = readToolsA().find((t) => t.name === name)!;
    return (await tool.run(tool.schema.parse(input) as never, context)) as Out;
  };
  return { calls, run, registry, context };
}

const WRITES = new Set(["insert", "update", "delete", "upsert"]);

describe("PAI-7 read tools", () => {
  it("are all read / owner tools with no workspace key in their schema", () => {
    for (const tool of readToolsA()) {
      expect(tool.risk).toBe("read");
      expect(tool.scope).toBe("owner");
      expect(tool.schema.safeParse({ organizationId: OTHER }).success).toBe(false);
    }
    expect(readToolsA().map((t) => t.name)).toEqual([
      "leads.list",
      "leads.get",
      "quotes.list",
      "quotes.get",
      "bookings.list_upcoming",
      "bookings.find_gaps",
      "reviews.list",
      "reviews.find_unanswered",
    ]);
  });

  for (const name of [
    "leads.list",
    "quotes.list",
    "bookings.list_upcoming",
    "bookings.find_gaps",
    "reviews.list",
    "reviews.find_unanswered",
  ]) {
    it(`${name}: every query is pinned to the session workspace, no writes, bounded output`, async () => {
      const { calls, run } = setup();
      const out = await run(name);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.ops).toContainEqual(["eq", ["organization_id", ORG]]);
        expect(call.ops.some(([op]) => WRITES.has(op))).toBe(false);
      }
      const json = JSON.stringify(out);
      expect(json.length).toBeLessThanOrEqual(MAX_BYTES);
      expect(json).not.toContain(OTHER);
      expect(json).not.toContain("secret-other@example.com");
      expect(json).not.toContain("SECRET");
      expect(json).not.toContain("9999");
      for (const value of Object.values(out))
        if (Array.isArray(value)) expect(value.length).toBeLessThanOrEqual(MAX_ROWS);
    });
  }

  it("leads.list is PII-light, bounded by rows/bytes, and excludes the other org", async () => {
    const { run } = setup();
    const out = await run("leads.list");
    expect(out.leads!.length).toBeGreaterThan(0);
    expect(out.leads!.length).toBeLessThanOrEqual(MAX_ROWS);
    expect(out['total']).toBeGreaterThan(out.leads!.length);
    expect(out['truncated']).toBe(true);
    const json = JSON.stringify(out);
    expect(json.length).toBeLessThanOrEqual(MAX_BYTES);
    expect(json).not.toContain("ada@example.com");
    expect(json).not.toContain("919-555-0100");
    expect(json).toContain('"has_email":true');
    expect(json).not.toContain("secret-other@example.com");
  });

  it("leads.get returns contact details for the session org only", async () => {
    const { run } = setup();
    const mine = await run("leads.get", { leadId: LEAD_A });
    expect(mine.lead).toMatchObject({
      id: LEAD_A,
      email: "ada@example.com",
      phone: "919-555-0100",
      name: "Ada Owner",
    });
    const other = await run("leads.get", { leadId: LEAD_B });
    expect(other.lead).toBeNull();
  });

  it("quotes.list totals line items without leaking emails; quotes.get returns lines + contact", async () => {
    const { run } = setup();
    const list = await run("quotes.list");
    expect(list.quotes).toEqual([
      expect.objectContaining({
        id: QUOTE_A,
        customer_name: "Ada Owner",
        total: 200,
        line_count: 2,
        has_email: true,
      }),
    ]);
    expect(JSON.stringify(list)).not.toContain("ada@example.com");
    const one = await run("quotes.get", { quoteId: QUOTE_A });
    expect(one.quote).toMatchObject({
      customer_email: "ada@example.com",
      total: 200,
      lines: [
        { name: "Tune-up", unit_price: 150, quantity: 1 },
        { name: "Filter", unit_price: 25, quantity: 2 },
      ],
    });
    expect((await run("quotes.get", { quoteId: QUOTE_B })).quote).toBeNull();
  });

  it("bookings.list_upcoming skips cancelled and stays PII-light", async () => {
    const { run } = setup();
    const out = await run("bookings.list_upcoming");
    expect(out.bookings).toHaveLength(1);
    expect(out.bookings![0]).toMatchObject({ id: "appt-a", name: "Ada Owner", has_email: true });
    expect(JSON.stringify(out)).not.toContain("ada@example.com");
  });

  it("bookings.find_gaps subtracts booked time from opening hours", async () => {
    const { run } = setup();
    const out = await run("bookings.find_gaps", { days: 3, minMinutes: 30 });
    expect(Array.isArray(out.gaps)).toBe(true);
    // Pure helper sanity (independent of which weekday "tomorrow" is).
    expect(
      gapsForDay({
        date: "2099-01-05",
        open: 9 * 60,
        close: 17 * 60,
        booked: [{ start: 10 * 60, end: 11 * 60 }],
        minMinutes: 60,
      }),
    ).toEqual([
      { date: "2099-01-05", start: "09:00", end: "10:00", minutes: 60 },
      { date: "2099-01-05", start: "11:00", end: "17:00", minutes: 360 },
    ]);
    const json = JSON.stringify(out);
    expect(json).not.toContain("SECRET_APPT");
    expect(json).not.toContain(OTHER);
  });

  it("reviews.list never returns private feedback; find_unanswered flags unpublished and low ratings", async () => {
    const { run } = setup();
    const list = await run("reviews.list");
    expect(list.reviews).toHaveLength(3);
    expect(JSON.stringify(list)).not.toContain("Never show this");
    expect(JSON.stringify(list)).not.toContain("Door scratched");
    expect(JSON.stringify(list)).not.toContain("SECRET_REVIEW");
    const unanswered = await run("reviews.find_unanswered");
    const reasons = (unanswered.unanswered as Array<{ id: string; reason: string }>).map(
      (r) => `${r.id}:${r.reason}`,
    );
    expect(reasons).toEqual(["rev-hidden:unpublished", "rev-low:low_rating"]);
  });

  it("runs through the v2 registry with the workspace from the session", async () => {
    const { registry, context } = setup();
    const res = await registry.run(context, {
      name: "leads.list",
      arguments: {},
      requestId: "t1",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(JSON.stringify(res.data)).toContain("Ada Owner");
  });
});
