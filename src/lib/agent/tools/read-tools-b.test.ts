import { describe, expect, it } from "vitest";
import type { ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";
import { createToolRegistryV2 } from "@/lib/ai/tool-registry-v2.server";
import { summarizeTraffic } from "@/lib/traffic";
import { readToolsB } from "./index";
import { MAX_BYTES, MAX_ROWS } from "./shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

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
        const rows = (tables[table] ?? []).filter((row) => row["organization_id"] === org);
        const range = call.ops.find(([op]) => op === "range");
        const sliced = range
          ? rows.slice(range[1][0] as number, (range[1][1] as number) + 1)
          : rows;
        const single = call.ops.some(([op]) => op === "maybeSingle");
        return { data: single ? (sliced[0] ?? null) : sliced, error: null, count: rows.length };
      };
      const chain: Record<string, unknown> = {};
      for (const op of [
        "select",
        "eq",
        "neq",
        "not",
        "gte",
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
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000 - 60_000).toISOString();

function dataset() {
  const events: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 40; i += 1)
    events.push({
      organization_id: ORG,
      event_type: i % 5 ? "page_view" : "lead",
      path: "/",
      source: i % 2 ? "google" : null,
      device: "mobile",
      session_id: `s${i % 7}`,
      created_at: iso(i % 20),
      campaign: i % 3 ? "SPRING" : null,
    });
  for (let i = 0; i < 25; i += 1)
    events.push({
      organization_id: OTHER,
      event_type: "page_view",
      path: "/x",
      source: "fb",
      device: "desktop",
      session_id: `o${i}`,
      created_at: iso(1),
      campaign: "SPRING",
    });
  return {
    analytics_events: events,
    campaigns: [
      {
        organization_id: ORG,
        id: "c1",
        name: "Spring flyer",
        source: "flyer",
        medium: "print",
        code: "SPRING",
        target_path: "/",
        scans: 4,
        created_at: iso(30),
      },
      {
        organization_id: OTHER,
        id: "c2",
        name: "Other org",
        source: "x",
        medium: "y",
        code: "SPRING",
        target_path: "/",
        scans: 99,
        created_at: iso(30),
      },
    ],
    leads: [
      {
        organization_id: ORG,
        id: "l1",
        campaign: "SPRING",
        source: "web",
        status: "won",
        estimated_value: 200,
        created_at: iso(2),
      },
      {
        organization_id: ORG,
        id: "l2",
        campaign: "SPRING",
        source: "web",
        status: "new",
        estimated_value: 50,
        created_at: iso(3),
      },
      {
        organization_id: OTHER,
        id: "l3",
        campaign: "SPRING",
        source: "web",
        status: "won",
        estimated_value: 9999,
        created_at: iso(2),
      },
    ],
    automations: [
      {
        organization_id: ORG,
        id: "a1",
        name: "Follow up",
        trigger_event: "lead_created",
        is_active: true,
        created_at: iso(10),
        automation_steps: [
          { sort_order: 2, delay_minutes: 60, action_type: "email", channel: "email" },
          { sort_order: 1, delay_minutes: 0, action_type: "sms", channel: "sms" },
        ],
      },
    ],
    automation_runs: Array.from({ length: 60 }, (_, i) => ({
      organization_id: ORG,
      id: `r${i}`,
      action_type: "email",
      recipient: "secret@example.com",
      subject: "Hi",
      body: "Private body",
      status: i % 4 ? "sent" : "failed",
      scheduled_for: iso(i),
      sent_at: iso(i),
      trigger_event: "lead_created",
    })),
    website_settings: [
      {
        organization_id: ORG,
        custom_domain: "example.com",
        domain_status: "active",
        domain_verified: true,
        dns_ok: true,
        ssl_ok: true,
        ssl_active: true,
        domain_checked_at: iso(1),
        ssl_checked_at: iso(1),
        domain_error: null,
        domain_target: "x.target",
        domain_primary_host: "example.com",
        publish_state: "published",
      },
      {
        organization_id: OTHER,
        custom_domain: "other.com",
        domain_status: "pending",
        domain_verified: false,
        dns_ok: false,
        ssl_ok: false,
      },
    ],
  };
}

type Out = Record<string, unknown> & {
  results: unknown;
  runs: unknown[];
  byStatus: unknown;
  automations: Array<{ steps: Array<{ action: string }> }>;
  leadsInWindow: unknown;
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
  const registry = createToolRegistryV2(readToolsB(), { audit: async () => undefined });
  const run = async (name: string, input: Record<string, unknown> = {}) => {
    const tool = readToolsB().find((t) => t.name === name)!;
    return (await tool.run(tool.schema.parse(input) as never, context)) as Out;
  };
  return { calls, run, registry, context };
}

const WRITES = new Set(["insert", "update", "delete", "upsert"]);

describe("PAI-8 read tools", () => {
  it("are all read / owner tools with no workspace key in their schema", () => {
    for (const tool of readToolsB()) {
      expect(tool.risk).toBe("read");
      expect(tool.scope).toBe("owner");
      expect(tool.schema.safeParse({ organizationId: OTHER }).success).toBe(false);
    }
    expect(readToolsB().map((t) => t.name)).toEqual([
      "campaigns.list",
      "campaigns.results",
      "automations.list",
      "automations.history",
      "analytics.summary",
      "domain.status",
    ]);
  });

  for (const name of [
    "campaigns.list",
    "campaigns.results",
    "automations.list",
    "automations.history",
    "analytics.summary",
    "domain.status",
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
      expect(json).not.toContain("other.com");
      expect(json).not.toContain("9999");
      for (const value of Object.values(out))
        if (Array.isArray(value)) expect(value.length).toBeLessThanOrEqual(MAX_ROWS);
    });
  }

  it("campaigns.results counts views, conversions and leads for this workspace only", async () => {
    const { run } = setup();
    const out = await run("campaigns.results");
    expect(out.results).toEqual([
      {
        id: "c1",
        name: "Spring flyer",
        code: "SPRING",
        scans: 4,
        views: 21,
        conversions: 5,
        leads: 2,
        won: 1,
        estimatedValue: 250,
      },
    ]);
  });

  it("automations.history is capped, PII-light and counts statuses", async () => {
    const { run } = setup();
    const out = await run("automations.history");
    expect(out.runs.length).toBe(50);
    expect(out.byStatus).toEqual({ sent: 45, failed: 15 });
    const json = JSON.stringify(out);
    expect(json).not.toContain("secret@example.com");
    expect(json).not.toContain("Private body");
    expect((await run("automations.history", { status: "failed", limit: 3 })).runs).toHaveLength(3);
  });

  it("automations.list sorts steps like the page", async () => {
    const { run } = setup();
    const out = await run("automations.list");
    expect(out.automations[0]!.steps.map((s: { action: string }) => s.action)).toEqual([
      "sms",
      "email",
    ]);
  });

  it("analytics.summary matches the traffic report's summarizeTraffic over the same rows", async () => {
    const { run } = setup();
    const out = await run("analytics.summary", { days: 30 });
    const rows = dataset()
      .analytics_events.filter((e) => e["organization_id"] === ORG)
      .map(({ event_type, path, source, device, session_id, created_at }) => ({
        event_type,
        path,
        source,
        device,
        session_id,
        created_at,
      })) as never;
    const expected = summarizeTraffic(rows, 30);
    for (const key of [
      "views",
      "previousViews",
      "changePct",
      "visitors",
      "conversions",
      "conversionRate",
      "calls",
      "sources",
      "pages",
      "devices",
      "daily",
    ] as const)
      expect(out[key]).toEqual(expected[key]);
    expect(out.leadsInWindow).toBe(2);
  });

  it("analytics.summary keeps 90 days under the size cap", async () => {
    const { run } = setup();
    expect(JSON.stringify(await run("analytics.summary", { days: 90 })).length).toBeLessThanOrEqual(
      MAX_BYTES,
    );
  });

  it("domain.status reports stored verification state", async () => {
    const { run } = setup();
    expect(await run("domain.status")).toMatchObject({
      customDomain: "example.com",
      verified: true,
      dnsOk: true,
      sslOk: true,
      connected: true,
    });
  });

  it("runs through the v2 registry with the workspace from the session", async () => {
    const { registry, context } = setup();
    const res = await registry.run(context, { name: "domain.status", input: {} } as never);
    expect(JSON.stringify(res)).toContain("example.com");
  });
});
