import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoundProspect } from "@/lib/prospect-finder";
import {
  alreadyDemoed,
  changedAutopilotFields,
  syncAutopilotDraft,
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
  smsAllowedNow: vi.fn(),
  lookupPublicEmail: vi.fn(),
  fetch: vi.fn(),
  assessDemoForOutreach: vi.fn(),
  reverifyLegacyDemos: vi.fn(),
  enqueued: [] as Array<{ organizationId: string; channel: string; kind: string; notBefore: string }>,
}));
vi.mock("@/lib/jarvis-demo-site.server", () => ({
  findProspects: mocks.findProspects,
  provisionProspectDemo: mocks.provisionProspectDemo,
}));
vi.mock("@/lib/prospect-outreach.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prospect-outreach.server")>();
  return {
    sendDemoOutreach: mocks.sendDemoOutreach,
    isDoNotContact: mocks.isDoNotContact,
    smsAllowedNow: mocks.smsAllowedNow,
    // The real business-hours math: the tests read when each email was queued for.
    nextEmailBusinessHour: actual.nextEmailBusinessHour,
  };
});
vi.mock("@/lib/prospect-email.server", () => ({ lookupPublicEmail: mocks.lookupPublicEmail }));
// The queue hands each item to sendDemoOutreach when it drains; here the
// hand-off is immediate so the tests read what autopilot queued.
vi.mock("@/lib/prospect-send-queue.server", () => ({
  enqueueOutreach: async (db: unknown, item: { organizationId: string; channel: string; to: string; mode: string; notBefore: Date; kind?: string }) => {
    mocks.enqueued.push({ organizationId: item.organizationId, channel: item.channel, kind: item.kind ?? "first_touch", notBefore: item.notBefore.toISOString() });
    const result = await mocks.sendDemoOutreach(db, {
      organizationId: item.organizationId,
      channel: item.channel,
      to: item.to,
      mode: item.mode,
      actorId: null,
      ...(item.kind ? { kind: item.kind } : {}),
    });
    return result?.ok ? { ok: true, id: "q-1", notBefore: item.notBefore.toISOString(), duplicate: false } : { ok: false, reason: result?.reason ?? "unknown" };
  },
}));
vi.mock("@/lib/demo-launch-gate.server", () => ({ assessDemoForOutreach: mocks.assessDemoForOutreach }));
// Enrichment stays real (its DNS calls go to the stubbed fetch); the legacy re-check is stubbed.
vi.mock("@/lib/prospect-enrichment.server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reverifyLegacyDemos: mocks.reverifyLegacyDemos,
}));
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
  mocks.enqueued.length = 0;
  mocks.isDoNotContact.mockResolvedValue(false);
  mocks.smsAllowedNow.mockReturnValue(true);
  mocks.lookupPublicEmail.mockResolvedValue(null);
  // DNS-over-HTTPS: every queried domain has a mail exchanger unless a test says otherwise.
  mocks.fetch.mockImplementation(async () => Response.json({ Status: 0, Answer: [{ type: 15, data: "10 mx.mail-host.net." }] }));
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.sendDemoOutreach.mockResolvedValue({ ok: true, outreachId: "o-1" });
  mocks.assessDemoForOutreach.mockResolvedValue({ ok: true, blockers: [] });
  mocks.reverifyLegacyDemos.mockResolvedValue({ checked: 0, written: 0, results: [] });
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

describe("autopilot card form", () => {
  const server = (overrides: Partial<ReturnType<typeof readAutopilotSettings>> = {}) => ({ ...readAutopilotSettings(null), ...overrides });

  it("follows newer server settings until the operator edits, and saves only the edited fields", () => {
    const a = syncAutopilotDraft(null, server());
    const target = { niche: "detailing", city: "Raleigh", state: "NC" };
    // A Jarvis-approved change lands while the form is untouched: the form shows it.
    const b = syncAutopilotDraft(a, server({ enabled: true, targets: [target] }));
    expect(b?.draft).toMatchObject({ enabled: true, targets: [target] });
    expect(changedAutopilotFields(b!.base, b!.draft)).toEqual({});

    // With local edits, a newer server value doesn't overwrite them, and Save sends only the edit.
    const edited = { ...a!, draft: { ...a!.draft, sendSms: true }, dirty: true };
    const kept = syncAutopilotDraft(edited, server({ enabled: true, targets: [target] }));
    expect(kept).toBe(edited);
    expect(changedAutopilotFields(kept!.base, kept!.draft)).toEqual({ sendSms: true });
  });
});

const verified = (email: string): Row => ({
  status: "verified",
  email,
  source: "public_page",
  sourceUrl: "https://facebook.com/x",
  reason: "ok",
  checkedAt: "2026-10-18T00:00:00Z",
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
    mocks.lookupPublicEmail.mockResolvedValue({ email: "owner@shine-detailing.com", source: "social_meta", url: "https://facebook.com/shine-detailing" });
    mocks.findProspects.mockResolvedValue({
      query: "mobile detailing in Raleigh, NC",
      searched: 1,
      prospects: [prospect({ website: "https://facebook.com/shine-detailing", presence: "social_only" })],
    });

    const result = await runProspectAutopilot(db, { now: () => NOW });

    expect(result.built).toBe(1);
    expect(mocks.lookupPublicEmail).toHaveBeenCalledTimes(1);
    expect(mocks.lookupPublicEmail).toHaveBeenCalledWith("https://facebook.com/shine-detailing");
    expect(mocks.provisionProspectDemo.mock.calls[0]![1]).toMatchObject({
      email: "owner@shine-detailing.com",
      businessName: "Shine Mobile Detailing",
    });
    // The enrichment result and its source are stored on the demo marker.
    expect(mocks.provisionProspectDemo.mock.calls[0]![3]).toMatchObject({
      source: "autopilot",
      enrichment: { status: "verified", email: "owner@shine-detailing.com", source: "social_meta", sourceUrl: "https://facebook.com/shine-detailing", reason: "ok" },
    });
    expect(String(mocks.fetch.mock.calls[0]![0])).toMatch(/^https:\/\/cloudflare-dns\.com\/dns-query\?name=shine-detailing\.com&type=MX$/);
  });

  it("bounds public email enrichment to four lookups per run", async () => {
    const { db } = seed({ prospect_autopilot_settings: [settings({ daily_build_cap: 7 })] });
    mocks.findProspects.mockResolvedValue({
      query: "mobile detailing in Raleigh, NC",
      searched: 6,
      prospects: Array.from({ length: 6 }, (_, i) =>
        prospect({ placeId: "social-" + i, name: "Detail Shop " + i, phone: "(919) 555-01" + String(i).padStart(2, "0"), website: "https://facebook.com/shop-" + i, presence: "social_only" }),
      ),
    });

    const result = await runProspectAutopilot(db, { now: () => NOW });

    expect(result.built).toBe(6);
    expect(mocks.lookupPublicEmail).toHaveBeenCalledTimes(4);
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
        { organization_id: "ready", generation: marker({ enrichment: verified("ready@example.com") }) },
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

  it("retries a text skipped for quiet hours on the next in-window run, and waits quietly outside it", async () => {
    const marker = { prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-18T00:00:00Z", source: "autopilot" } };
    const quiet = () =>
      seed({
        prospect_autopilot_settings: [settings({ targets: [], send_email: false, send_sms: true })],
        website_settings: [{ organization_id: "quiet", generation: marker }, { organization_id: "noconsent", generation: marker }],
        organizations: [{ id: "quiet", name: "quiet" }, { id: "noconsent", name: "noconsent" }],
        generation_jobs: ["quiet", "noconsent"].map((id) => ({ organization_id: id, status: "completed", created_at: "2026-10-18T00:00:00Z" })),
        business_profiles: ["quiet", "noconsent"].map((id) => ({ organization_id: id, phone: "919-555-0123", state: "NC" })),
        prospect_outreach: [
          { organization_id: "quiet", channel: "sms", status: "skipped", reason: "quiet_hours", mode: "autopilot", created_at: "2026-10-19T13:00:00Z" },
          { organization_id: "noconsent", channel: "sms", status: "skipped", reason: "no_consent", mode: "autopilot", created_at: "2026-10-19T13:00:00Z" },
        ],
      });
    await runProspectAutopilot(quiet().db, { now: () => NOW });
    expect(mocks.sendDemoOutreach.mock.calls.map((call) => call[1].organizationId)).toEqual(["quiet"]);
    expect(mocks.smsAllowedNow).toHaveBeenCalledWith(NOW, "NC", "+19195550123");

    mocks.sendDemoOutreach.mockClear();
    mocks.smsAllowedNow.mockReturnValue(false);
    await runProspectAutopilot(quiet().db, { now: () => NOW });
    expect(mocks.sendDemoOutreach).not.toHaveBeenCalled();
  });

  it("records who changed the settings and audits the change", async () => {
    const { db, tables } = seed();
    const saved = await saveAutopilotSettings(db, { enabled: false, dailyBuildCap: 3 }, OWNER);
    expect(saved).toMatchObject({ enabled: false, dailyBuildCap: 3, updatedBy: OWNER, targets: [{ niche: "mobile detailing" }] });
    expect(tables["audit_logs"]![0]).toMatchObject({ action: "jarvis.prospect_autopilot.configured", actor_id: OWNER });
  });
});

describe("rotation, Places budget and the verified-email gate", () => {
  const rotationOnly = (extra: Row = {}) =>
    settings({ targets: [], send_email: false, rotation: { enabled: true, trades: ["HVAC", "roofing"], states: ["NC"] }, ...extra });
  const searched = () => mocks.findProspects.mock.calls.map((call) => `${call[2].niche} in ${call[2].city}, ${call[2].state}`);

  it("walks due (trade, metro) pairs, records the cursor, and continues where it left off next run", async () => {
    const { rotationPairs } = await import("@/lib/prospect-rotation");
    const pairs = rotationPairs({ enabled: true, trades: ["HVAC", "roofing"], states: ["NC"] });
    // The first pair was searched yesterday: inside the cooldown, so it is skipped.
    const { db, tables } = seed({
      prospect_autopilot_settings: [rotationOnly()],
      prospect_rotation_cursor: [{ id: pairs[0]!.key, last_searched_at: "2026-10-18T15:00:00.000Z", searches: 4 }],
    });
    mocks.findProspects.mockResolvedValue({ query: "q", searched: 0, prospects: [] });

    await runProspectAutopilot(db, { now: () => NOW });
    expect(searched()).toEqual(pairs.slice(1, 4).map((pair) => `${pair.trade} in ${pair.city}, ${pair.state}`));
    const cursor = tables["prospect_rotation_cursor"]!;
    expect(cursor).toHaveLength(4);
    expect(cursor.find((row) => row["id"] === pairs[1]!.key)).toMatchObject({ searches: 1, last_found: 0, last_searched_at: NOW.toISOString(), state: "NC" });
    expect(cursor.find((row) => row["id"] === pairs[0]!.key)).toMatchObject({ searches: 4 });

    mocks.findProspects.mockClear();
    await runProspectAutopilot(db, { now: () => NOW });
    expect(searched()).toEqual(pairs.slice(4, 6).map((pair) => `${pair.trade} in ${pair.city}, ${pair.state}`));
  });

  it("searches explicit targets before rotation", async () => {
    const { db } = seed({ prospect_autopilot_settings: [rotationOnly({ targets: [{ niche: "mobile detailing", city: "Raleigh", state: "NC" }] })] });
    mocks.findProspects.mockResolvedValue({ query: "q", searched: 0, prospects: [] });
    await runProspectAutopilot(db, { now: () => NOW });
    expect(searched()[0]).toBe("mobile detailing in Raleigh, NC");
    expect(searched()).toHaveLength(3);
  });

  it("never pushes the shared Places budget past autopilot's share", async () => {
    const searchesToday = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ action: "jarvis.prospects.search", metadata: { query: `manual ${i}` }, created_at: "2026-10-19T01:00:00.000Z" }));
    mocks.findProspects.mockResolvedValue({ query: "q", searched: 0, prospects: [] });

    const nearly = seed({ prospect_autopilot_settings: [rotationOnly()], audit_logs: searchesToday(29) });
    await runProspectAutopilot(nearly.db, { now: () => NOW });
    expect(mocks.findProspects).toHaveBeenCalledTimes(1);

    mocks.findProspects.mockClear();
    const spent = seed({ prospect_autopilot_settings: [rotationOnly()], audit_logs: searchesToday(30) });
    const result = await runProspectAutopilot(spent.db, { now: () => NOW });
    expect(mocks.findProspects).not.toHaveBeenCalled();
    expect(result.skipped).toContainEqual({ reason: "places_daily_budget_reached" });
  });

  it("stops rotating once the finder reports the daily limit, without advancing the cursor", async () => {
    const { db, tables } = seed({ prospect_autopilot_settings: [rotationOnly()] });
    mocks.findProspects.mockRejectedValue(new Error("Daily search limit reached (40)."));
    const result = await runProspectAutopilot(db, { now: () => NOW });
    expect(mocks.findProspects).toHaveBeenCalledTimes(1);
    expect(result.skipped[0]?.reason).toBe("places_daily_budget_reached");
    expect(tables["prospect_rotation_cursor"] ?? []).toHaveLength(0);
  });

  it("keeps a rejected address off the profile and skips businesses with a real website", async () => {
    const { db } = seed();
    mocks.lookupPublicEmail.mockResolvedValue({ email: "owner@dead-domain.com", source: "public_page", url: "https://facebook.com/shine" });
    mocks.fetch.mockImplementation(async () => Response.json({ Status: 3 }));
    mocks.findProspects.mockResolvedValue({
      query: "q",
      searched: 2,
      prospects: [
        prospect({ placeId: "own-site", name: "Has Site", website: "https://hassite.com", presence: "has_website", reviewCount: 999 }),
        prospect({ website: "https://facebook.com/shine", presence: "social_only" }),
      ],
    });
    const result = await runProspectAutopilot(db, { now: () => NOW });
    expect(result.skipped).toContainEqual({ reason: "has_website", name: "Has Site", target: "mobile detailing in Raleigh, NC" });
    expect(mocks.provisionProspectDemo).toHaveBeenCalledTimes(1);
    expect(mocks.provisionProspectDemo.mock.calls[0]![1]).toMatchObject({ email: null });
    expect(mocks.provisionProspectDemo.mock.calls[0]![3]).toMatchObject({ enrichment: { status: "rejected", reason: "no_mx", email: "owner@dead-domain.com" } });
  });

  it("emails only demos whose exact address was verified, re-checking ones DNS couldn't confirm", async () => {
    const marker = (enrichment?: Row) => ({
      prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-18T00:00:00Z", source: "autopilot", ...(enrichment ? { enrichment } : {}) },
    });
    const ids = ["verified", "legacy", "changed", "dns", "rejected"];
    const { db } = seed({
      prospect_autopilot_settings: [settings({ targets: [] })],
      website_settings: [
        { organization_id: "verified", generation: marker(verified("verified@shop.com")) },
        { organization_id: "legacy", generation: marker() },
        { organization_id: "changed", generation: marker(verified("old@shop.com")) },
        { organization_id: "dns", generation: marker({ ...verified("dns@shop.com"), status: "unverified", reason: "dns_unavailable" }) },
        { organization_id: "rejected", generation: marker({ ...verified("rejected@shop.com"), status: "rejected", reason: "no_mx" }) },
      ],
      organizations: ids.map((id) => ({ id, name: id })),
      generation_jobs: ids.map((id) => ({ organization_id: id, status: "completed", created_at: "2026-10-18T00:00:00Z" })),
      business_profiles: ids.map((id) => ({ organization_id: id, email: `${id}@shop.com` })),
    });
    const result = await runProspectAutopilot(db, { now: () => NOW, random: () => 0.5 });
    expect(mocks.sendDemoOutreach.mock.calls.map((call) => call[1].to)).toEqual(["verified@shop.com", "dns@shop.com"]);
    expect(result.emailed).toBe(2);
    expect(result.skipped.map((entry) => `${entry.name}:${entry.reason}`)).toEqual([
      "legacy:email_unverified",
      "changed:email_unverified: ok",
      "rejected:email_unverified: no_mx",
    ]);
  });

  it("does not queue a demo that already has a send waiting", async () => {
    const marker = { prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-18T00:00:00Z", source: "autopilot", enrichment: verified("a@shop.com") } };
    const { db } = seed({
      prospect_autopilot_settings: [settings({ targets: [] })],
      website_settings: [{ organization_id: "a", generation: marker }],
      organizations: [{ id: "a", name: "a" }],
      generation_jobs: [{ organization_id: "a", status: "completed", created_at: "2026-10-18T00:00:00Z" }],
      business_profiles: [{ organization_id: "a", email: "a@shop.com" }],
      prospect_send_queue: [{ organization_id: "a", channel: "email", status: "queued" }],
    });
    await runProspectAutopilot(db, { now: () => NOW });
    expect(mocks.sendDemoOutreach).not.toHaveBeenCalled();
  });

  it("never queues a demo that fails the launch quality gate", async () => {
    const marker = { prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-18T00:00:00Z", source: "autopilot", enrichment: verified("a@shop.com") } };
    const { db } = seed({
      prospect_autopilot_settings: [settings({ targets: [] })],
      website_settings: [{ organization_id: "a", generation: marker }],
      organizations: [{ id: "a", name: "a" }],
      generation_jobs: [{ organization_id: "a", status: "completed", created_at: "2026-10-18T00:00:00Z" }],
      business_profiles: [{ organization_id: "a", email: "a@shop.com" }],
    });
    mocks.assessDemoForOutreach.mockResolvedValue({ ok: false, blockers: [{ code: "unsupported_claim", message: "Unsupported claim on the home page.", safety: true }] });
    const result = await runProspectAutopilot(db, { now: () => NOW });
    expect(mocks.assessDemoForOutreach).toHaveBeenCalledWith(db, "a");
    expect(mocks.sendDemoOutreach).not.toHaveBeenCalled();
    expect(result.skipped).toContainEqual({ reason: "quality_gate: Unsupported claim on the home page.", name: "a" });
  });

  it("spaces autopilot sends a random 0–20 minutes apart", async () => {
    const { nextSendAt } = await import("@/lib/prospect-autopilot");
    expect(nextSendAt(NOW, () => 0).toISOString()).toBe(NOW.toISOString());
    expect(nextSendAt(NOW, () => 1).getTime() - NOW.getTime()).toBe(20 * 60_000);
    expect(nextSendAt(NOW, () => 0.25).getTime() - NOW.getTime()).toBe(5 * 60_000);
    expect(nextSendAt(NOW, () => 7).getTime() - NOW.getTime()).toBe(20 * 60_000);
  });

  it("saves and describes rotation like any other setting", async () => {
    expect(parseAutopilotPatch({ rotation: { enabled: true, trades: ["hvac"], states: ["nc"] } })).toEqual({
      rotation: { enabled: true, trades: ["HVAC"], states: ["NC"] },
    });
    expect(() => parseAutopilotPatch({ rotation: { enabled: true, states: ["XX"] } })).toThrow(/state code/);
    expect(describeAutopilotPatch({ rotation: { enabled: true, trades: [], states: [] } })).toBe("Rotate through all trades across metros in all 50 states.");
    expect(readAutopilotSettings(null).rotation).toEqual({ enabled: false, trades: [], states: [] });

    const { db, tables } = seed();
    await saveAutopilotSettings(db, { enabled: false }, OWNER);
    // Untouched rotation isn't written, so saves keep working before the column exists.
    expect(tables["prospect_autopilot_settings"]![0]!["rotation"]).toBeUndefined();
    const saved = await saveAutopilotSettings(db, { rotation: { enabled: true, trades: [], states: ["TX"] } }, OWNER);
    expect(saved.rotation).toEqual({ enabled: true, trades: [], states: ["TX"] });
  });
});

describe("48-hour engagement follow-up", () => {
  const FIRST_TOUCH_AT = "2026-10-16T15:00:00.000Z"; // 72 hours before NOW
  const marker = (id: string, extra: Row = {}) => ({
    prospectDemo: { kind: "prospect_demo", createdAt: "2026-10-10T00:00:00Z", source: "autopilot", enrichment: verified(`${id}@shop.com`), ...extra },
  });
  // Preview telemetry only reads real organization ids, so each named demo gets a UUID.
  const NAMES = ["hot", "dnc", "optout", "claimed", "replied", "fresh", "cold", "done", "sessions", "a"];
  const U = (name: string) => `${String(NAMES.indexOf(name) + 1).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const view = (name: string, at: string, session = "sessionaa") => ({ organization_id: U(name), event: "view", session_id: session, ip_hash: null, duration_ms: 0, created_at: at });
  const firstTouch = (name: string, at = FIRST_TOUCH_AT): Row => ({
    organization_id: U(name), channel: "email", recipient: `${name}@shop.com`, status: "sent", reason: null, mode: "autopilot", kind: "first_touch", created_at: at,
  });

  function followupSeed(ids: string[], extra: { website?: Row[]; outreach?: Row[]; events?: Row[]; inbound?: Row[]; settings?: Row } = {}) {
    return seed({
      prospect_autopilot_settings: [settings({ targets: [], ...(extra.settings ?? {}) })],
      website_settings: extra.website ?? ids.map((id) => ({ organization_id: U(id), generation: marker(id) })),
      organizations: ids.map((id) => ({ id: U(id), name: id })),
      generation_jobs: ids.map((id) => ({ organization_id: U(id), status: "completed", created_at: "2026-10-10T00:00:00Z" })),
      business_profiles: ids.map((id) => ({ organization_id: U(id), email: `${id}@shop.com`, phone: `919-555-01${String(ids.indexOf(id)).padStart(2, "0")}`, state: "NC" })),
      prospect_outreach: extra.outreach ?? ids.map((id) => firstTouch(id)),
      prospect_preview_events: extra.events ?? ids.flatMap((id) => [view(id, "2026-10-17T10:00:00.000Z"), view(id, "2026-10-18T10:00:00.000Z")]),
      prospect_inbound: extra.inbound ?? [],
    });
  }
  const followups = () => mocks.enqueued.filter((item) => item.kind === "followup");

  it("queues exactly one follow-up, and only for an engaged, unclaimed, unreplied demo 48+ hours after the first email", async () => {
    const ids = ["hot", "dnc", "optout", "claimed", "replied", "fresh", "cold", "done", "sessions"];
    const { db } = followupSeed(ids, {
      website: ids.map((id) => ({ organization_id: U(id), generation: marker(id, id === "claimed" ? { claimedAt: "2026-10-18T00:00:00Z" } : {}) })),
      outreach: [
        ...ids.filter((id) => id !== "fresh").map((id) => firstTouch(id)),
        firstTouch("fresh", "2026-10-18T15:00:00.000Z"),
        { ...firstTouch("done"), kind: "followup", reason: "engagement_followup", created_at: "2026-10-18T16:00:00.000Z" },
      ],
      events: [
        ...ids.filter((id) => id !== "cold" && id !== "sessions").flatMap((id) => [view(id, "2026-10-17T10:00:00.000Z"), view(id, "2026-10-19T10:00:00.000Z")]),
        // Viewed only once since the first email (the other look came before it).
        view("cold", "2026-10-15T10:00:00.000Z"),
        view("cold", "2026-10-17T10:00:00.000Z"),
        // One view, but two sessions (a heartbeat carries the second).
        view("sessions", "2026-10-17T10:00:00.000Z", "sessionaa"),
        { ...view("sessions", "2026-10-17T10:01:00.000Z", "sessionbb"), event: "heartbeat", duration_ms: 15_000 },
      ],
      inbound: [{ organization_id: U("replied"), thread_id: "t", gmail_message_id: "m" }],
    });
    // dnc: the address unsubscribed. optout: the business's number replied STOP.
    mocks.isDoNotContact.mockImplementation(async (_db: unknown, value: string) => value === "dnc@shop.com" || value === "+19195550102");

    const result = await runProspectAutopilot(db, { now: () => NOW, random: () => 0 });

    expect(followups().map((item) => item.organizationId)).toEqual([U("hot"), U("sessions")]);
    expect(result.followups).toBe(2);
    expect(mocks.sendDemoOutreach.mock.calls.map((call) => call[1])).toEqual([
      { organizationId: U("hot"), channel: "email", to: "hot@shop.com", mode: "autopilot", actorId: null, kind: "followup" },
      { organizationId: U("sessions"), channel: "email", to: "sessions@shop.com", mode: "autopilot", actorId: null, kind: "followup" },
    ]);
    // No first touch was queued again for any of them.
    expect(mocks.enqueued.filter((item) => item.kind === "first_touch")).toEqual([]);
    expect(result.skipped).toEqual(expect.arrayContaining([
      { reason: "followup_do_not_contact", name: "dnc" },
      { reason: "followup_do_not_contact", name: "optout" },
      { reason: "followup_replied", name: "replied" },
    ]));
    // Each candidate passed the launch gate before it was queued.
    expect(mocks.assessDemoForOutreach.mock.calls.map((call) => call[1])).toEqual([U("hot"), U("sessions")]);
  });

  it("never queues a second follow-up on a rerun", async () => {
    const { db, tables } = followupSeed(["hot"]);
    // What the queue's send records: one sent follow-up.
    mocks.sendDemoOutreach.mockImplementation(async (_db: unknown, input: { organizationId: string; kind?: string }) => {
      if (input.kind === "followup") tables["prospect_outreach"]!.push({ ...firstTouch("hot"), kind: "followup", reason: "engagement_followup", created_at: NOW.toISOString() });
      return { ok: true, outreachId: "o" };
    });
    await runProspectAutopilot(db, { now: () => NOW });
    await runProspectAutopilot(db, { now: () => new Date(NOW.getTime() + 3 * 3_600_000) });
    await runProspectAutopilot(db, { now: () => new Date(NOW.getTime() + 3 * 86_400_000) });
    expect(followups()).toHaveLength(1);

    // A follow-up already waiting in the queue is not queued again either.
    mocks.enqueued.length = 0;
    const waiting = followupSeed(["hot"]);
    waiting.tables["prospect_send_queue"] = [{ organization_id: U("hot"), channel: "email", status: "queued" }];
    await runProspectAutopilot(waiting.db, { now: () => NOW });
    expect(followups()).toHaveLength(0);
  });

  it("respects the email switch and the launch gate", async () => {
    const off = followupSeed(["hot"], { settings: { send_email: false, send_sms: true } });
    await runProspectAutopilot(off.db, { now: () => NOW });
    expect(followups()).toHaveLength(0);

    mocks.assessDemoForOutreach.mockResolvedValue({ ok: false, blockers: [{ code: "unsupported_claim", message: "Unsupported claim.", safety: true }] });
    const gated = await runProspectAutopilot(followupSeed(["hot"]).db, { now: () => NOW });
    expect(followups()).toHaveLength(0);
    expect(gated.skipped).toContainEqual({ reason: "followup_quality_gate: Unsupported claim.", name: "hot" });
  });

  it("queues an autopilot email for business hours in the business's zone", async () => {
    // 23:00 in Raleigh (EDT): the first touch is queued for 8:00 the next morning.
    const late = new Date("2026-10-19T03:00:00.000Z");
    const { db } = seed({
      prospect_autopilot_settings: [settings({ targets: [] })],
      website_settings: [{ organization_id: "a", generation: marker("a", { createdAt: "2026-10-18T00:00:00Z" }) }],
      organizations: [{ id: "a", name: "a" }],
      generation_jobs: [{ organization_id: "a", status: "completed", created_at: "2026-10-18T00:00:00Z" }],
      business_profiles: [{ organization_id: "a", email: "a@shop.com", phone: "919-555-0100", state: "NC" }],
    });
    await runProspectAutopilot(db, { now: () => late, random: () => 0 });
    expect(mocks.enqueued).toEqual([{ organizationId: "a", channel: "email", kind: "first_touch", notBefore: "2026-10-19T12:00:00.000Z" }]);
  });
});

describe("legacy demo re-verification", () => {
  it("runs once per run before sending, counts its results, and never blocks the run", async () => {
    mocks.reverifyLegacyDemos.mockImplementation(async () => {
      // Before the send phase: nothing has been handed to the sender yet.
      expect(mocks.sendDemoOutreach).not.toHaveBeenCalled();
      return { checked: 3, written: 2, results: [] };
    });
    const { db } = seed({ prospect_autopilot_settings: [settings({ targets: [] })] });
    const result = await runProspectAutopilot(db, { now: () => NOW });
    expect(mocks.reverifyLegacyDemos).toHaveBeenCalledTimes(1);
    expect(mocks.reverifyLegacyDemos.mock.calls[0]![0]).toBe(db);
    expect(result).toMatchObject({ status: "done", legacyChecked: 3, legacyWritten: 2 });

    mocks.reverifyLegacyDemos.mockRejectedValue(new Error("dns down"));
    const failed = await runProspectAutopilot(seed({ prospect_autopilot_settings: [settings({ targets: [] })] }).db, { now: () => NOW });
    expect(failed).toMatchObject({ status: "done", error: null, legacyChecked: 0 });
    expect(failed.skipped).toContainEqual({ reason: "legacy_reverify_failed: dns down" });
  });
});

describe("follow-up eligibility rules", () => {
  it("is due only 48+ hours after the first email with two views or two sessions, and never twice", async () => {
    const { followupBlocker } = await import("@/lib/prospect-autopilot");
    const base = { firstTouchAt: "2026-10-17T15:00:00.000Z", claimed: false, replied: false, followupStarted: false, engagement: { views: 2, uniqueSessions: 1 } };
    expect(followupBlocker(base, NOW)).toBeNull();
    expect(followupBlocker({ ...base, engagement: { views: 1, uniqueSessions: 2 } }, NOW)).toBeNull();
    expect(followupBlocker({ ...base, engagement: { views: 1, uniqueSessions: 1 } }, NOW)).toBe("not_engaged");
    expect(followupBlocker({ ...base, engagement: null }, NOW)).toBe("engagement_unavailable");
    expect(followupBlocker({ ...base, firstTouchAt: "2026-10-17T15:00:00.001Z" }, NOW)).toBe("too_soon");
    expect(followupBlocker({ ...base, firstTouchAt: null }, NOW)).toBe("no_first_touch");
    expect(followupBlocker({ ...base, claimed: true }, NOW)).toBe("claimed");
    expect(followupBlocker({ ...base, replied: true }, NOW)).toBe("replied");
    expect(followupBlocker({ ...base, followupStarted: true }, NOW)).toBe("already_followed_up");
  });
});
