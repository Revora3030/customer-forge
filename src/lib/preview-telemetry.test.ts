import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BEACON_RATE_LIMIT,
  MAX_HEARTBEAT_MS,
  aggregateEngagement,
  formatDuration,
  parsePreviewBeacon,
  skipPreviewTelemetry,
} from "./preview-telemetry";
import {
  engagementSince,
  handlePreviewBeaconRequest,
  hashPreviewIp,
  localRateLimited,
  previewEngagement,
  recordPreviewBeacon,
  resetLocalRateLimit,
} from "./preview-telemetry.server";

const TOKEN = "abcdefghijklmnop0123";
const ORG = "11111111-2222-3333-4444-555555555555";

type Op = { method: string; args: unknown[] };
type Handler = (table: string, ops: Op[]) => { data?: unknown; error?: { message: string } | null; count?: number | null };

/** Chainable stand-in for the Supabase query builder; every call is recorded. */
function fakeDb(handler: Handler) {
  const inserts: Array<{ table: string; row: unknown }> = [];
  const calls: Array<{ table: string; ops: Op[] }> = [];
  const db = {
    from(table: string) {
      const ops: Op[] = [];
      calls.push({ table, ops });
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "is", "not", "order", "limit", "in"]) {
        builder[method] = (...args: unknown[]) => {
          ops.push({ method, args });
          return builder;
        };
      }
      builder["maybeSingle"] = () => Promise.resolve({ data: null, error: null, ...handler(table, [...ops, { method: "maybeSingle", args: [] }]) });
      builder["insert"] = (row: unknown) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null, ...handler(table, [{ method: "insert", args: [row] }]) });
      };
      builder["then"] = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve({ data: null, error: null, count: null, ...handler(table, ops) }).then(resolve, reject);
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, inserts, calls };
}

const liveLink = { organization_id: ORG, expires_at: "2099-01-01T00:00:00.000Z", revoked: false };
const prospectSettings = { generation: { prospectDemo: { kind: "prospect_demo", createdBy: "u1", createdAt: "2026-10-01T00:00:00Z", previewToken: TOKEN } } };

function prospectDb(overrides: Partial<Record<string, ReturnType<Handler>>> = {}, recentCount = 0) {
  return fakeDb((table, ops) => {
    if (overrides[table]) return overrides[table]!;
    if (table === "website_preview_links") return { data: liveLink };
    if (table === "website_settings") return { data: prospectSettings };
    if (table === "prospect_preview_events" && ops.some((op) => op.method === "select")) return { count: recentCount };
    return {};
  });
}

beforeEach(() => resetLocalRateLimit());

describe("beacon validation", () => {
  it("accepts a well-formed beacon and clamps heartbeat time", () => {
    expect(parsePreviewBeacon(JSON.stringify({ token: TOKEN, event: "heartbeat", page: "Services", ms: 9_999_999, sid: "abc12345" }))).toEqual({
      token: TOKEN, event: "heartbeat", page: "services", ms: MAX_HEARTBEAT_MS, sessionId: "abc12345",
    });
    expect(parsePreviewBeacon({ token: TOKEN, event: "view", ms: 500 })).toMatchObject({ page: "home", ms: 0, sessionId: null });
  });

  it("rejects malformed tokens, events, pages, times, sessions and oversized bodies", () => {
    expect(parsePreviewBeacon({ token: "short", event: "view" })).toBeNull();
    expect(parsePreviewBeacon({ token: TOKEN, event: "purchase" })).toBeNull();
    expect(parsePreviewBeacon({ token: TOKEN, event: "view", page: "../admin" })).toBeNull();
    expect(parsePreviewBeacon({ token: TOKEN, event: "heartbeat", ms: -5 })).toBeNull();
    expect(parsePreviewBeacon({ token: TOKEN, event: "view", sid: "<script>" })).toBeNull();
    expect(parsePreviewBeacon("not json")).toBeNull();
    expect(parsePreviewBeacon(JSON.stringify({ token: TOKEN, event: "view", pad: "x".repeat(3000) }))).toBeNull();
    expect(parsePreviewBeacon([TOKEN])).toBeNull();
  });
});

describe("self-view skip", () => {
  it("never counts the signed-in operator, framed previews or operator links", () => {
    expect(skipPreviewTelemetry({ search: "", embedded: false, signedIn: true })).toBe(true);
    expect(skipPreviewTelemetry({ search: "", embedded: true, signedIn: false })).toBe(true);
    expect(skipPreviewTelemetry({ search: "?preview=1", embedded: false, signedIn: false })).toBe(true);
    expect(skipPreviewTelemetry({ search: "?operator", embedded: false, signedIn: false })).toBe(true);
    expect(skipPreviewTelemetry({ search: "?utm_source=email", embedded: false, signedIn: false })).toBe(false);
  });
});

describe("aggregates", () => {
  it("folds views, unique sessions, time, claim activity and last seen", () => {
    const result = aggregateEngagement([
      { event: "view", session_id: "s1", ip_hash: "h1", duration_ms: 0, created_at: "2026-10-18T10:00:00.000Z" },
      { event: "heartbeat", session_id: "s1", ip_hash: "h1", duration_ms: 15_000, created_at: "2026-10-18T10:00:15.000Z" },
      { event: "heartbeat", session_id: "s1", ip_hash: "h1", duration_ms: 999_999, created_at: "2026-10-18T10:05:00.000Z" },
      { event: "view", session_id: null, ip_hash: "h2", duration_ms: 0, created_at: "2026-10-19T09:00:00.000Z" },
      { event: "claim_hover", session_id: "s3", ip_hash: "h3", duration_ms: 0, created_at: "2026-10-19T09:01:00.000Z" },
      { event: "claim_click", session_id: "s3", ip_hash: "h3", duration_ms: 0, created_at: "2026-10-19T09:02:00.000Z" },
    ]);
    expect(result).toEqual({
      views: 2,
      uniqueSessions: 3,
      totalMs: 15_000 + MAX_HEARTBEAT_MS,
      claimHovers: 1,
      claimClicks: 1,
      lastSeenAt: "2026-10-19T09:02:00.000Z",
      truncated: false,
    });
    expect(aggregateEngagement([]).lastSeenAt).toBeNull();
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(240_000)).toBe("4 min");
    expect(formatDuration(3_900_000)).toBe("1 h 5 min");
  });

  it("reads engagement for one demo and since a moment, and reports unreadable storage as null", async () => {
    const rows = [{ event: "view", session_id: "s1", ip_hash: null, duration_ms: 0, created_at: "2026-10-19T09:00:00.000Z" }];
    const { db, calls } = fakeDb(() => ({ data: rows }));
    expect((await previewEngagement(db, ORG))?.views).toBe(1);
    const since = await engagementSince(db, ORG, "2026-10-18T00:00:00.000Z");
    expect(since?.views).toBe(1);
    expect(calls.at(-1)?.ops.some((op) => op.method === "gte" && op.args[1] === "2026-10-18T00:00:00.000Z")).toBe(true);
    expect(await engagementSince(db, ORG, "not a date")).toBeNull();
    expect(await previewEngagement(db, "not-an-org")).toBeNull();
    const broken = fakeDb(() => ({ error: { message: "relation does not exist" } }));
    expect(await previewEngagement(broken.db, ORG)).toBeNull();
  });
});

describe("recording beacons", () => {
  const beacon = { token: TOKEN, event: "view" as const, page: "home", ms: 0, sessionId: "abc12345" };

  it("hashes IPs with the server secret and never stores the raw IP", async () => {
    const { db, inserts } = prospectDb();
    const outcome = await recordPreviewBeacon(db, beacon, "203.0.113.9", { secret: "server-secret" });
    expect(outcome).toEqual({ status: "recorded" });
    const row = inserts.find((item) => item.table === "prospect_preview_events")?.row as Record<string, unknown>;
    expect(row).toMatchObject({ token: TOKEN, organization_id: ORG, event: "view", page: "home", duration_ms: 0, session_id: "abc12345" });
    expect(row["ip_hash"]).toBe(await hashPreviewIp(TOKEN, "203.0.113.9", "server-secret"));
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
    expect(await hashPreviewIp(TOKEN, "203.0.113.9", "other-secret")).not.toBe(row["ip_hash"]);
  });

  it("ignores unknown, revoked, expired and non-prospect links without recording", async () => {
    const cases: Array<[Partial<Record<string, ReturnType<Handler>>>, string]> = [
      [{ website_preview_links: { data: null } }, "unknown_token"],
      [{ website_preview_links: { data: { ...liveLink, revoked: true } } }, "revoked"],
      [{ website_preview_links: { data: { ...liveLink, expires_at: "2020-01-01T00:00:00Z" } } }, "expired"],
      [{ website_settings: { data: { generation: {} } } }, "not_prospect"],
    ];
    for (const [overrides, reason] of cases) {
      const { db, inserts } = prospectDb(overrides);
      expect(await recordPreviewBeacon(db, beacon, "203.0.113.9", { secret: "s" })).toEqual({ status: "ignored", reason });
      expect(inserts).toHaveLength(0);
    }
  });

  it("rate-limits per token and IP hash using the stored count", async () => {
    const { db, inserts } = prospectDb({}, BEACON_RATE_LIMIT);
    expect(await recordPreviewBeacon(db, beacon, "203.0.113.9", { secret: "s" })).toEqual({ status: "rate_limited" });
    expect(inserts).toHaveLength(0);
  });

  it("turns away a flood in memory before touching the database", () => {
    const now = 1_000_000;
    for (let index = 0; index < BEACON_RATE_LIMIT; index += 1) expect(localRateLimited("t|h", now + index)).toBe(false);
    expect(localRateLimited("t|h", now + BEACON_RATE_LIMIT)).toBe(true);
    expect(localRateLimited("t|other", now)).toBe(false);
  });

  it("answers the endpoint with 400/413/405/204/429 and the same 204 for ignored tokens", async () => {
    const request = (body: string, init: RequestInit = {}) =>
      new Request("https://app.example.com/api/public/preview-beacon", { method: "POST", body, headers: { "cf-connecting-ip": "198.51.100.4" }, ...init });
    const { db } = prospectDb();
    expect((await handlePreviewBeaconRequest(request("nope"), db)).status).toBe(400);
    expect((await handlePreviewBeaconRequest(request("x".repeat(5000)), db)).status).toBe(413);
    expect((await handlePreviewBeaconRequest(new Request("https://app.example.com/api/public/preview-beacon"), db)).status).toBe(405);
    const ok = await handlePreviewBeaconRequest(request(JSON.stringify({ token: TOKEN, event: "view" })), db);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("set-cookie")).toBeNull();
    const ignored = prospectDb({ website_preview_links: { data: null } });
    expect((await handlePreviewBeaconRequest(request(JSON.stringify({ token: TOKEN, event: "view" })), ignored.db)).status).toBe(204);
    const limited = prospectDb({}, BEACON_RATE_LIMIT);
    expect((await handlePreviewBeaconRequest(request(JSON.stringify({ token: TOKEN, event: "view" })), limited.db)).status).toBe(429);
  });
});
