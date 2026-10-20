import type { SupabaseClient } from "@supabase/supabase-js";
import { readProspectDemoMarker } from "@/lib/jarvis-demo-site";
import {
  BEACON_RATE_LIMIT,
  BEACON_RATE_WINDOW_MS,
  MAX_BEACON_BYTES,
  aggregateEngagement,
  parsePreviewBeacon,
  type PreviewBeacon,
  type PreviewEngagement,
  type PreviewEventRow,
} from "@/lib/preview-telemetry";

/**
 * Server side of prospect preview telemetry: records validated beacons for
 * live prospect demo links and folds them into engagement numbers.
 *
 * Privacy: no cookies; the IP is never stored, only an HMAC of it keyed with a
 * server secret (PREVIEW_TELEMETRY_SECRET, else the service-role key) and
 * scoped to the token, used for rate limiting and as a fallback visitor key.
 * Raw events are pruned after 90 days by the migration's scheduled job.
 */

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Rows read per aggregate; more than this marks the result as a lower bound. */
const MAX_AGGREGATE_ROWS = 5_000;

function telemetrySecret(): string | null {
  const value = process.env["PREVIEW_TELEMETRY_SECRET"]?.trim() || process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  return value || null;
}

/** HMAC-SHA256 of token|ip with the server secret, hex. Null when no secret is configured. */
export async function hashPreviewIp(token: string, ip: string, secret: string | null = telemetrySecret()): Promise<string | null> {
  if (!secret) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`preview|${token}|${ip}`));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 64);
}

/** The client IP from edge-controlled headers only (X-Forwarded-For can be spoofed before the edge). */
export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || headers.get("true-client-ip")?.trim() || "unknown";
}

/**
 * Per-instance limiter in front of the database count, so a flood is turned
 * away without a query per request. The database count is the shared limit.
 */
const recent = new Map<string, number[]>();
export function localRateLimited(key: string, now = Date.now()): boolean {
  const since = now - BEACON_RATE_WINDOW_MS;
  const hits = (recent.get(key) ?? []).filter((at) => at > since);
  if (hits.length >= BEACON_RATE_LIMIT) {
    recent.set(key, hits);
    return true;
  }
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5_000) {
    for (const [entry, times] of recent) if (!times.some((at) => at > since)) recent.delete(entry);
  }
  return false;
}

/** Test hook: clears the per-instance limiter. */
export function resetLocalRateLimit() {
  recent.clear();
}

export type BeaconOutcome =
  | { status: "recorded" }
  | { status: "ignored"; reason: "unknown_token" | "not_prospect" | "expired" | "revoked" }
  | { status: "rate_limited" }
  /** Over the shared (database) limit. Only live tokens reach that check, so it answers like success. */
  | { status: "dropped" }
  | { status: "error" };

/**
 * Records one validated beacon. Only live (not revoked, not expired) prospect
 * demo links record anything; other tokens are ignored without saying why to
 * the caller, so the endpoint can't be used to probe for valid tokens.
 */
export async function recordPreviewBeacon(
  db: SupabaseClient,
  beacon: PreviewBeacon,
  ip: string,
  options: { now?: Date; secret?: string | null } = {},
): Promise<BeaconOutcome> {
  const now = options.now ?? new Date();
  const ipHash = await hashPreviewIp(beacon.token, ip, options.secret === undefined ? telemetrySecret() : options.secret);
  const limitKey = `${beacon.token}|${ipHash ?? "no-secret"}`;
  if (localRateLimited(limitKey, now.getTime())) return { status: "rate_limited" };

  const { data: link, error: linkError } = await db
    .from("website_preview_links")
    .select("organization_id, expires_at, revoked")
    .eq("token", beacon.token)
    .maybeSingle();
  if (linkError) return { status: "error" };
  const row = link as { organization_id?: string; expires_at?: string; revoked?: boolean } | null;
  if (!row?.organization_id) return { status: "ignored", reason: "unknown_token" };
  if (row.revoked) return { status: "ignored", reason: "revoked" };
  if (!row.expires_at || Date.parse(row.expires_at) <= now.getTime()) return { status: "ignored", reason: "expired" };

  const { data: settings } = await db
    .from("website_settings")
    .select("generation")
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  const marker = readProspectDemoMarker((settings?.generation as Record<string, unknown> | null)?.["prospectDemo"]);
  if (!marker || marker.previewToken !== beacon.token) return { status: "ignored", reason: "not_prospect" };

  let recentQuery = db
    .from("prospect_preview_events")
    .select("id", { count: "exact", head: true })
    .eq("token", beacon.token)
    .gte("created_at", new Date(now.getTime() - BEACON_RATE_WINDOW_MS).toISOString());
  recentQuery = ipHash ? recentQuery.eq("ip_hash", ipHash) : recentQuery.is("ip_hash", null);
  const { count, error: countError } = await recentQuery;
  if (countError) return { status: "error" };
  if ((count ?? 0) >= BEACON_RATE_LIMIT) return { status: "dropped" };

  const { error } = await db.from("prospect_preview_events").insert({
    token: beacon.token,
    organization_id: row.organization_id,
    event: beacon.event,
    page: beacon.page,
    duration_ms: beacon.ms,
    session_id: beacon.sessionId,
    ip_hash: ipHash,
  });
  return error ? { status: "error" } : { status: "recorded" };
}

const BEACON_HEADERS = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

/**
 * Reads at most `limit` bytes of the body, cancelling the stream once it goes
 * over, so a chunked upload without content-length is never buffered whole.
 */
export async function readCappedBody(
  request: Request,
  limit: number,
): Promise<{ ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" }> {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

/** The /api/public/preview-beacon handler: size cap, validation, then recordPreviewBeacon. */
export async function handlePreviewBeaconRequest(request: Request, db: SupabaseClient): Promise<Response> {
  const reply = (status: number, extra: Record<string, string> = {}) =>
    new Response(null, { status, headers: { ...BEACON_HEADERS, ...extra } });
  if (request.method !== "POST") return reply(405, { allow: "POST" });
  // The size cap runs before any token lookup, so a 413 says nothing about the token.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BEACON_BYTES) return reply(413);
  const body = await readCappedBody(request, MAX_BEACON_BYTES);
  if (!body.ok) return reply(body.reason === "too_large" ? 413 : 400);
  const beacon = parsePreviewBeacon(body.text);
  if (!beacon) return reply(400);
  let outcome: BeaconOutcome;
  try {
    outcome = await recordPreviewBeacon(db, beacon, clientIp(request.headers));
  } catch {
    outcome = { status: "error" };
  }
  if (outcome.status === "rate_limited") return reply(429, { "retry-after": String(BEACON_RATE_WINDOW_MS / 1000) });
  // Ignored tokens and storage trouble look the same as success: telemetry is
  // best-effort, and the answer must not reveal whether a token is live.
  return reply(204);
}

async function readEngagement(db: SupabaseClient, organizationId: string, since: Date | null): Promise<PreviewEngagement | null> {
  if (!ORG_ID.test(organizationId)) return null;
  let query = db
    .from("prospect_preview_events")
    .select("event, session_id, ip_hash, duration_ms, created_at")
    .eq("organization_id", organizationId);
  if (since) query = query.gte("created_at", since.toISOString());
  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_AGGREGATE_ROWS);
  if (error) return null;
  const rows = (data ?? []) as PreviewEventRow[];
  return aggregateEngagement(rows, rows.length >= MAX_AGGREGATE_ROWS);
}

/** All-time (90-day retained) engagement for one demo; null when it can't be read. */
export function previewEngagement(db: SupabaseClient, organizationId: string): Promise<PreviewEngagement | null> {
  return readEngagement(db, organizationId, null);
}

/**
 * Engagement since a moment (e.g. the last outreach), for follow-up timing.
 * Null when the events can't be read, so callers never mistake an outage for
 * "the prospect didn't look".
 */
export function engagementSince(db: SupabaseClient, organizationId: string, since: Date | string): Promise<PreviewEngagement | null> {
  const at = since instanceof Date ? since : new Date(since);
  if (Number.isNaN(at.getTime())) return Promise.resolve(null);
  return readEngagement(db, organizationId, at);
}
