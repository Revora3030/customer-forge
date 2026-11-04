import { describe, expect, it, vi } from "vitest";

import { runLeadResponseEscalation, type EscalationDeps } from "@/lib/lead-escalation.server";

const NOW = Date.parse("2026-11-03T15:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const ORG = "11111111-1111-4111-8111-111111111111";
const lead = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organization_id: ORG,
  created_at: ago(8),
  status: "new",
  source: "website",
  name: "Jordan",
  email: "jordan@visitor.test",
  phone: "+19195550134",
  city: "Raleigh",
  service_interest: "Detailing",
  message: "Need a quote",
  first_response_at: null,
  response_escalated_at: null,
  ...extra,
});

type Row = Record<string, unknown>;

/** Tiny in-memory stand-in for the Supabase query builder used by the job. */
function fakeDb(tables: Record<string, Row[]>) {
  const updates: Row[] = [];
  const from = (table: string) => {
    const preds: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const q: Record<string, unknown> = {};
    const chain = (fn: (r: Row) => boolean) => (preds.push(fn), q);
    Object.assign(q, {
      select: () => q,
      order: () => q,
      limit: () => q,
      is: (k: string, v: unknown) => chain((r) => (r[k] ?? null) === v),
      eq: (k: string, v: unknown) => chain((r) => r[k] === v),
      neq: (k: string, v: unknown) => chain((r) => r[k] !== v),
      gte: (k: string, v: string) => chain((r) => String(r[k]) >= v),
      lte: (k: string, v: string) => chain((r) => String(r[k]) <= v),
      in: (k: string, v: unknown[]) => chain((r) => v.includes(r[k])),
      update: (p: Row) => ((patch = p), q),
      then: (resolve: (v: unknown) => void) => {
        const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
        if (patch) {
          for (const r of rows) Object.assign(r, patch);
          updates.push(...rows.map((r) => ({ table, id: r["id"], ...patch })));
        }
        resolve({ data: rows.map((r) => ({ ...r })), error: null });
      },
    });
    return q;
  };
  return { db: { from } as never, updates };
}

function deps() {
  const sent: Array<{ to: string; data: Row; key: string }> = [];
  const d: EscalationDeps = {
    sendLeadAlert: vi.fn(async (to, data, key) => (sent.push({ to, data, key }), { ok: true as const })),
    leadUrlFor: (id) => `https://revoragrowthsystems.com/app/leads?lead=${id}`,
  };
  return { d, sent };
}

const context = (profile: Row = { notification_email: "desk@acme.test", owner_email: "boss@acme.test", notify_on_lead: true }, org: Row = {}) => ({
  organizations: [{ id: ORG, name: "Acme Detailing", is_demo: false, is_suspended: false, ...org }],
  business_profiles: [{ organization_id: ORG, ...profile }],
});

describe("runLeadResponseEscalation", () => {
  it("emails every profile inbox once for a lead unanswered after 5 minutes, and claims it", async () => {
    const { db, updates } = fakeDb({ leads: [lead("a")], ...context() });
    const { d, sent } = deps();
    const run = await runLeadResponseEscalation(db, d, NOW);
    expect(run).toMatchObject({ scanned: 1, escalated: 1, emailed: 2, failed: 0 });
    expect(sent.map((s) => s.to)).toEqual(["desk@acme.test", "boss@acme.test"]);
    expect(sent[0]).toMatchObject({
      key: "lead-escalation-a-desk@acme.test",
      data: { kind: "Still waiting 8 min, no reply yet", leadName: "Jordan", leadUrl: "https://revoragrowthsystems.com/app/leads?lead=a" },
    });
    expect(updates).toEqual([expect.objectContaining({ table: "leads", id: "a", response_escalated_at: new Date(NOW).toISOString() })]);

    // A second run finds nothing to do: never a second escalation.
    const again = await runLeadResponseEscalation(db, d, NOW + 5 * 60_000);
    expect(again.escalated).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it("leaves answered, too-new, too-old, progressed and test leads alone", async () => {
    const { db } = fakeDb({
      leads: [
        lead("answered", { first_response_at: ago(6) }),
        lead("fresh", { created_at: ago(3) }),
        lead("stale", { created_at: ago(90) }),
        lead("contacted", { status: "contacted" }),
        lead("test", { source: "test_lead" }),
      ],
      ...context(),
    });
    const { d, sent } = deps();
    const run = await runLeadResponseEscalation(db, d, NOW);
    expect(run.escalated).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("skips workspaces with alerts off, demo or suspended", async () => {
    for (const [profile, org] of [
      [{ owner_email: "boss@acme.test", notify_on_lead: false }, {}],
      [{ owner_email: "boss@acme.test" }, { is_demo: true }],
      [{ owner_email: "boss@acme.test" }, { is_suspended: true }],
    ] as const) {
      const { db, updates } = fakeDb({ leads: [lead("a")], ...context(profile, org) });
      const { d, sent } = deps();
      const run = await runLeadResponseEscalation(db, d, NOW);
      expect(run).toMatchObject({ escalated: 0, skipped: 1 });
      expect(sent).toHaveLength(0);
      expect(updates).toHaveLength(0);
    }
  });

  it("counts a failed send without retrying into a duplicate", async () => {
    const { db } = fakeDb({ leads: [lead("a")], ...context({ owner_email: "boss@acme.test" }) });
    const { d } = deps();
    d.sendLeadAlert = vi.fn(async () => ({ ok: false as const, retry: true, reason: "email_transport_error" }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const run = await runLeadResponseEscalation(db, d, NOW);
    expect(run).toMatchObject({ escalated: 1, emailed: 0, failed: 1 });
    vi.restoreAllMocks();
  });
});
