import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundProspect } from "@/lib/prospect-finder";
import {
  alreadyDemoed,
  describeAutopilotPatch,
  parseAutopilotPatch,
  rankProspects,
  readAutopilotSettings,
  usPhoneE164,
} from "@/lib/prospect-autopilot";
import { parseActions, splitReplyMeta, appendReplyMeta } from "@/lib/jarvis-actions";

const mocks = vi.hoisted(() => ({
  findProspects: vi.fn(),
  provisionProspectDemo: vi.fn(),
  sendDemoOutreach: vi.fn(),
  isDoNotContact: vi.fn(),
  findPublicEmail: vi.fn(),
}));
vi.mock("@/lib/jarvis-demo-site.server", () => ({
  findProspects: mocks.findProspects,
  provisionProspectDemo: mocks.provisionProspectDemo,
}));
vi.mock("@/lib/prospect-outreach.server", () => ({
  sendDemoOutreach: mocks.sendDemoOutreach,
  isDoNotContact: mocks.isDoNotContact,
}));
vi.mock("@/lib/prospect-email.server", () => ({ findPublicEmail: mocks.findPublicEmail }));
import { runProspectAutopilot, saveAutopilotSettings } from "@/lib/prospect-autopilot.server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Reads "a->b->>c" JSON paths the way PostgREST does. */
function at(row: Row, path: string): unknown {
  return path.split(/->>?/).reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Row)[key] : undefined), row);
}

/** In-memory PostgREST stand-in that runs the real filters and writes. */
function database(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { ...seed };
  const db = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const predicates: Array<(row: Row) => boolean> = [];
      let mode: "select" | "update" | "insert" | "upsert" = "select";
      let value: Row = {};
      let head = false;
      let limit = Infinity;
      const run = () => {
        if (mode === "insert") {
          if (table === "prospect_autopilot_runs" && rows.some((row) => row["finished_at"] == null))
            return { data: null, error: { code: "23505", message: "duplicate key" }, count: null };
          const row = { id: `run-${rows.length + 1}`, finished_at: null, found: 0, built: 0, emailed: 0, texted: 0, skipped: [], error: null, ...value };
          rows.push(row);
          return { data: [{ ...row }], error: null, count: null };
        }
        if (mode === "upsert") {
          const existing = rows.find((row) => row["id"] === value["id"]);
          if (existing) Object.assign(existing, value);
          else rows.push({ ...value });
          return { data: null, error: null, count: null };
        }
        const selected = rows.filter((row) => predicates.every((predicate) => predicate(row))).slice(0, limit);
        if (mode === "update") selected.forEach((row) => Object.assign(row, value));
        return { data: head ? null : selected.map((row) => ({ ...row })), error: null, count: selected.length };
      };
      const query = {
        select: (_columns?: string, options?: { head?: boolean }) => { head = options?.head === true; return query; },
        insert: (next: Row) => { mode = "insert"; value = next; return query; },
        update: (next: Row) => { mode = "update"; value = next; return query; },
        upsert: (next: Row) => { mode = "upsert"; value = next; return query; },
        eq: (key: string, expected: unknown) => { predicates.push((row) => at(row, key) === expected); return query; },
        in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(at(row, key))); return query; },
        is: (key: string, expected: unknown) => { predicates.push((row) => (at(row, key) ?? null) === expected); return query; },
        not: (key: string) => { predicates.push((row) => at(row, key) != null); return query; },
        lt: (key: string, bound: string) => { predicates.push((row) => String(at(row, key)) < bound); return query; },
        gte: (key: string, bound: string) => { predicates.push((row) => String(at(row, key)) >= bound); return query; },
        order: () => query,
        limit: (count: number) => { limit = count; return query; },
        maybeSingle: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
        single: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
        then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
  return { db: db as never, tables };
}

const NOW = new Date("2026-10-19T15:00:00.000Z");
const OWNER = "11111111-1111-4111-8111-111111111111";

const prospect = (overrides: Partial<FoundProspect>): FoundProspect => ({
  placeId: "place-x",
  name: "Shine Mobile Detailing",
  category: "Car detailing service",
  address: null,
  city: "Raleigh",
  state: "NC",
  phone: "(919) 555-0100",
  website: null,
  presence: "none",
  rating: 4.8,
  reviewCount: 40,
  mapsUri: null,
  ...overrides,
});

const settings = (overrides: Row = {}): Row => ({
  id: 1,
  enabled: true,
  targets: [{ niche: "mobile detailing", city: "Raleigh", state: "NC" }],
  daily_build_cap: 5,
  send_email: true,
  send_sms: false,
  updated_by: OWNER,
  updated_at: "2026-10-18T00:00:00Z",
  ...overrides,
});

function seed(overrides: Record<string, Row[]> = {}) {
  return database({
    prospect_autopilot_settings: [settings()],
    user_roles: [{ user_id: OWNER, role: "super_admin" }],
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isDoNotContact.mockResolvedValue(false);
  mocks.findPublicEmail.mockResolvedValue(null);
  mocks.sendDemoOutreach.mockResolvedValue({ ok: true, outreachId: "o-1" });
  let next = 0;
  mocks.provisionProspectDemo.mockImplementation(async () => ({ organizationId: `org-new-${++next}`, jobId: "j", previewToken: "t", expiresAt: "x" }));
});

describe("autopilot settings contract", () => {
  it("ships off with safe defaults and drops malformed stored targets", () => {
    expect(readAutopilotSettings(null)).toMatchObject({ enabled: false, sendSms: false, dailyBuildCap: 5, targets: [] });
    expect(readAutopilotSettings({ enabled: true, targets: [{ niche: "x" }, { niche: "plumbing", city: "Cary" }], daily_build_cap: 99 }))
      .toMatchObject({ enabled: true, targets: [{ niche: "plumbing", city: "Cary", state: null }], dailyBuildCap: 20 });
  });

  it("validates changes and only keeps fields that were sent", () => {
    expect(parseAutopilotPatch({ enabled: true })).toEqual({ enabled: true });
    expect(() => parseAutopilotPatch({})).toThrow(/Nothing to change/);
    expect(() => parseAutopilotPatch({ enabled: "yes" })).toThrow(/true or false/);
    expect(() => parseAutopilotPatch({ dailyBuildCap: 50 })).toThrow(/0 to 20/);
    expect(parseAutopilotPatch({ targets: [{ niche: "HVAC repair", city: "Durham" }, { niche: "hvac repair", city: "durham" }] }).targets).toHaveLength(1);
    expect(describeAutopilotPatch({ enabled: true, sendSms: true })).toBe("Turn autopilot on, text the link only to numbers that opted in.");
  });

  it("ranks no-website businesses with a phone and real reviews first, and spots duplicates", () => {
    const ranked = rankProspects([
      prospect({ placeId: "social", presence: "social_only", reviewCount: 500 }),
      prospect({ placeId: "nophone", phone: null }),
      prospect({ placeId: "best", reviewCount: 120 }),
    ]);
    expect(ranked.map((p) => p.placeId)).toEqual(["best", "nophone", "social"]);
    const seen = { placeIds: new Set(["p1"]), phones: new Set(["9195550100"]), nameCity: new Set(["joe s plumbing|cary"]) };
    expect(alreadyDemoed(prospect({ placeId: "p1", phone: null }), seen)).toBe(true);
    expect(alreadyDemoed(prospect({ placeId: "p2", phone: "+1 919-555-0100" }), seen)).toBe(true);
    expect(alreadyDemoed(prospect({ placeId: "p3", phone: null, name: "Joe's Plumbing", city: "Cary" }), seen)).toBe(true);
    expect(alreadyDemoed(prospect({ placeId: "p4", phone: null }), seen)).toBe(false);
    expect(usPhoneE164("(919) 555-0100")).toBe("+19195550100");
    expect(usPhoneE164("555-0100")).toBeNull();
  });

  it("is a Jarvis read plus two approval-tap writes that survive a reload", () => {
    const parsed = parseActions([
      { id: "autopilot.status", args: {} },
      { id: "autopilot.configure", args: { enabled: true, dailyBuildCap: 3 } },
      { id: "autopilot.run", args: {} },
    ], []);
    expect(parsed.reads).toEqual([{ id: "autopilot.status" }]);
    expect(parsed.proposals).toEqual([{ id: "autopilot.configure", settings: { enabled: true, dailyBuildCap: 3 } }, { id: "autopilot.run" }]);
    expect(parseActions([{ id: "autopilot.configure", args: { dailyBuildCap: -1 } }], []).rejected[0]).toMatch(/autopilot.configure/);
    const restored = splitReplyMeta(appendReplyMeta("ok", { ran: [], proposals: parsed.proposals }));
    expect(restored.meta.proposals).toEqual(parsed.proposals);
  });
});

describe("runProspectAutopilot", () => {
  it("does nothing while switched off", async () => {
    const { db, tables } = seed({ prospect_autopilot_settings: [settings({ enabled: false })] });
    expect(await runProspectAutopilot(db, { now: () => NOW })).toMatchObject({ status: "disabled" });
    expect(tables["prospect_autopilot_runs"] ?? []).toHaveLength(0);
    expect(mocks.findProspects).not.toHaveBeenCalled();
  });

  it("builds the best new businesses up to the daily cap, skipping demoed and do-not-contact ones", async () => {
    const { db, tables } = seed({
      prospect_autopilot_settings: [settings({ daily_build_cap: 2 })],
      website_settings: [
        { organization_id: "old-1", generation: { prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-01T00:00:00Z", source: "autopilot", placeId: "place-dup" } } },
        { organization_id: "old-2", generation: { prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-01T00:00:00Z" } } },
      ],
      organizations: [{ id: "old-1", name: "Old One" }, { id: "old-2", name: "Spotless Auto Spa" }],
      business_profiles: [{ organization_id: "old-2", phone: "919-555-0199", city: "Raleigh" }],
    });
    mocks.isDoNotContact.mockImplementation(async (_db: unknown, value: string) => value === "+19195550142");
    mocks.findProspects.mockResolvedValue({
      query: "mobile detailing in Raleigh, NC",
      searched: 6,
      prospects: [
        prospect({ placeId: "place-dup", name: "Dup By Place", phone: "(919) 555-0777", reviewCount: 999 }),
        prospect({ placeId: "place-phone", name: "Dup By Phone", phone: "(919) 555-0199", reviewCount: 998 }),
        prospect({ placeId: "place-dnc", name: "Opted Out", phone: "(919) 555-0142", reviewCount: 900 }),
        prospect({ placeId: "place-a", name: "Alpha Detail", phone: "(919) 555-0001", reviewCount: 80 }),
        prospect({ placeId: "place-b", name: "Bravo Detail", phone: "(919) 555-0002", reviewCount: 60 }),
        prospect({ placeId: "place-c", name: "Charlie Detail", phone: "(919) 555-0003", reviewCount: 10 }),
      ],
    });
    const queued: string[] = [];
    const result = await runProspectAutopilot(db, { now: () => NOW, onQueued: (id) => queued.push(id) });

    expect(result).toMatchObject({ status: "done", found: 6, built: 2, error: null });
    expect(mocks.findProspects).toHaveBeenCalledWith(db, OWNER, { niche: "mobile detailing", city: "Raleigh", state: "NC" });
    const built = mocks.provisionProspectDemo.mock.calls.map((call) => [call[1].businessName, call[2], call[3]]);
    expect(built).toEqual([
      ["Alpha Detail", OWNER, { source: "autopilot", placeId: "place-a" }],
      ["Bravo Detail", OWNER, { source: "autopilot", placeId: "place-b" }],
    ]);
    // Only public listing facts: no invented services or email.
    expect(mocks.provisionProspectDemo.mock.calls[0]![1]).toMatchObject({ services: [], email: null, phone: "(919) 555-0001" });
    expect(queued).toEqual(["org-new-1", "org-new-2"]);
    expect(result.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(["already_demoed", "do_not_contact"]));
    const run = tables["prospect_autopilot_runs"]![0]!;
    expect(run).toMatchObject({ built: 2, found: 6, trigger: "cron" });
    expect(run["finished_at"]).toBeTruthy();
  });

  it("uses a public email from a social listing without treating it as a business website", async () => {
    const { db } = seed();
    mocks.findPublicEmail.mockResolvedValue("owner@shine-detailing.com");
    mocks.findProspects.mockResolvedValue({
      query: "mobile detailing in Raleigh, NC",
      searched: 1,
      prospects: [prospect({ website: "https://facebook.com/shine-detailing", presence: "social_only" })],
    });

    const result = await runProspectAutopilot(db, { now: () => NOW });

    expect(result.built).toBe(1);
    expect(mocks.findPublicEmail).toHaveBeenCalledTimes(1);
    expect(mocks.findPublicEmail).toHaveBeenCalledWith("https://facebook.com/shine-detailing");
    expect(mocks.provisionProspectDemo.mock.calls[0]![1]).toMatchObject({
      email: "owner@shine-detailing.com",
      businessName: "Shine Mobile Detailing",
    });
  });

  it("bounds public email enrichment to four lookups per run", async () => {
    const { db } = seed({ prospect_autopilot_settings: [settings({ daily_build_cap: 7 })] });
    mocks.findProspects.mockResolvedValue({
      query: "mobile detailing in Raleigh, NC",
      searched: 6,
      prospects: Array.from({ length: 6 }, (_, i) =>
        prospect({ placeId: "social-" + i, name: "Detail Shop " + i, website: "https://facebook.com/shop-" + i, presence: "social_only" }),
      ),
    });

    const result = await runProspectAutopilot(db, { now: () => NOW });

    expect(result.built).toBe(6);
    expect(mocks.findPublicEmail).toHaveBeenCalledTimes(4);
  });
  it("stops building once today's cap is used and skips targets searched recently", async () => {
    const { db } = seed({
      prospect_autopilot_runs: [{ id: "earlier", started_at: "2026-10-19T09:00:00.000Z", finished_at: "2026-10-19T09:01:00.000Z", built: 5 }],
    });
    expect(await runProspectAutopilot(db, { now: () => NOW })).toMatchObject({ built: 0, skipped: [{ reason: "daily_build_cap_reached" }] });
    expect(mocks.findProspects).not.toHaveBeenCalled();

    const recent = seed({
      audit_logs: [{ action: "jarvis.prospects.search", metadata: { query: "mobile detailing in Raleigh, NC" }, created_at: "2026-10-19T08:00:00.000Z" }],
    });
    expect((await runProspectAutopilot(recent.db, { now: () => NOW })).skipped).toEqual([
      { reason: "searched_recently", target: "mobile detailing in Raleigh, NC" },
    ]);
    expect(mocks.findProspects).not.toHaveBeenCalled();
  });

  it("is single-flight, but a run that died long ago doesn't block the next one", async () => {
    const live = seed({ prospect_autopilot_runs: [{ id: "live", started_at: "2026-10-19T14:55:00.000Z", finished_at: null }] });
    expect(await runProspectAutopilot(live.db, { now: () => NOW })).toMatchObject({ status: "busy" });

    const dead = seed({ prospect_autopilot_runs: [{ id: "dead", started_at: "2026-10-19T13:00:00.000Z", finished_at: null }] });
    mocks.findProspects.mockResolvedValue({ query: "q", searched: 0, prospects: [] });
    expect(await runProspectAutopilot(dead.db, { now: () => NOW })).toMatchObject({ status: "done" });
    expect(dead.tables["prospect_autopilot_runs"]![0]!["error"]).toMatch(/without finishing/);
  });

  it("builds nothing when the saved owner is no longer a super-admin", async () => {
    const { db } = seed({ user_roles: [] });
    const result = await runProspectAutopilot(db, { now: () => NOW });
    expect(result.built).toBe(0);
    expect(result.skipped[0]?.reason).toMatch(/^no_owner/);
    expect(mocks.findProspects).not.toHaveBeenCalled();
  });

  it("sends once per finished, unclaimed autopilot demo, and texts only through the consent-checked backend", async () => {
    const marker = (extra: Row = {}) => ({ prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-18T00:00:00Z", source: "autopilot", ...extra } });
    const { db } = seed({
      prospect_autopilot_settings: [settings({ targets: [], send_sms: true })],
      website_settings: [
        { organization_id: "ready", generation: marker() },
        { organization_id: "sent", generation: marker() },
        { organization_id: "claimed", generation: marker({ claimedAt: "2026-10-18T05:00:00Z" }) },
        { organization_id: "building", generation: marker() },
        { organization_id: "manual", generation: { prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-18T00:00:00Z" } } },
      ],
      organizations: ["ready", "sent", "claimed", "building", "manual"].map((id) => ({ id, name: id })),
      generation_jobs: [
        ...["ready", "sent", "claimed", "manual"].map((id) => ({ organization_id: id, status: "completed", created_at: "2026-10-18T00:00:00Z" })),
        { organization_id: "building", status: "processing", created_at: "2026-10-18T00:00:00Z" },
      ],
      business_profiles: ["ready", "sent", "claimed", "building", "manual"].map((id) => ({ organization_id: id, email: `${id}@example.com`, phone: "919-555-0123" })),
      prospect_outreach: [
        { organization_id: "sent", channel: "email", status: "sent", mode: "autopilot", created_at: "2026-10-18T06:00:00Z" },
        { organization_id: "sent", channel: "sms", status: "skipped", mode: "autopilot", created_at: "2026-10-19T10:00:00Z" },
      ],
    });
    mocks.sendDemoOutreach.mockImplementation(async (_db: unknown, input: { channel: string }) =>
      input.channel === "sms" ? { ok: false, reason: "no_sms_consent", message: "No consent" } : { ok: true, outreachId: "o" });

    const result = await runProspectAutopilot(db, { now: () => NOW });
    const sends = mocks.sendDemoOutreach.mock.calls.map((call) => call[1]);
    expect(sends).toEqual([
      { organizationId: "ready", channel: "email", to: "ready@example.com", mode: "autopilot", actorId: null },
      { organizationId: "ready", channel: "sms", to: "+19195550123", mode: "autopilot", actorId: null },
    ]);
    expect(result).toMatchObject({ emailed: 1, texted: 0 });
    expect(result.skipped).toContainEqual({ reason: "sms_no_sms_consent", name: "ready" });
  });

  it("records who changed the settings and audits the change", async () => {
    const { db, tables } = seed();
    const saved = await saveAutopilotSettings(db, { enabled: false, dailyBuildCap: 3 }, OWNER);
    expect(saved).toMatchObject({ enabled: false, dailyBuildCap: 3, updatedBy: OWNER, targets: [{ niche: "mobile detailing" }] });
    expect(tables["audit_logs"]![0]).toMatchObject({ action: "jarvis.prospect_autopilot.configured", actor_id: OWNER });
  });
});
