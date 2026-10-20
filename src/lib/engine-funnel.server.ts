import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateEngineFunnel,
  type EngineFunnel,
  type FunnelDemo,
  type FunnelEvent,
  type FunnelRotationRow,
} from "@/lib/engine-funnel";
import { readProspectEnrichment } from "@/lib/prospect-enrichment";
import { usStateCode } from "@/lib/prospect-outreach.server";

/**
 * Reads the prospect engine funnel for "Engine today". Read-only and
 * service-role (callers verify super-admin first). Every source is read on its
 * own: a table that doesn't exist yet, or a failed read, makes that stage
 * unknown instead of failing the whole funnel.
 */

const MAX_DEMOS = 2_000;
const MAX_EVENTS = 20_000;
/** Organization ids per IN (...) filter, so the request URL stays short. */
const ID_CHUNK = 150;

type Rows = Array<Record<string, unknown>>;
type Read = PromiseLike<{ data: unknown; error: unknown }>;

async function rows(read: Read): Promise<Rows | null> {
  try {
    const { data, error } = await read;
    return error ? null : ((data ?? []) as Rows);
  } catch {
    return null;
  }
}

/** Runs one read per chunk of ids; null when any chunk fails. */
async function rowsForIds(ids: string[], read: (chunk: string[]) => Read): Promise<Rows | null> {
  const out: Rows = [];
  for (let at = 0; at < ids.length; at += ID_CHUNK) {
    const chunk = await rows(read(ids.slice(at, at + ID_CHUNK)));
    if (!chunk) return null;
    out.push(...chunk);
  }
  return out;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

async function readDemos(db: SupabaseClient): Promise<FunnelDemo[] | null> {
  const settings = await rows(
    db.from("website_settings").select("organization_id, generation").not("generation->prospectDemo", "is", null).limit(MAX_DEMOS),
  );
  if (!settings) return null;
  const demos: FunnelDemo[] = [];
  for (const row of settings) {
    const marker = (row["generation"] as Record<string, unknown> | null)?.["prospectDemo"] as Record<string, unknown> | undefined;
    if (!marker || typeof marker !== "object" || marker["kind"] !== "prospect_demo") continue;
    const enrichment = readProspectEnrichment(marker["enrichment"]);
    demos.push({
      organizationId: String(row["organization_id"]),
      state: null,
      createdAt: text(marker["createdAt"]),
      enrichedAt: enrichment?.status === "verified" ? enrichment.checkedAt || text(marker["createdAt"]) : null,
      claimedAt: text(marker["claimedAt"]),
    });
  }
  const ids = demos.map((demo) => demo.organizationId);
  // A missing state only moves a demo to "unknown"; it never hides the demo.
  const profiles = ids.length ? await rowsForIds(ids, (chunk) => db.from("business_profiles").select("organization_id, state").in("organization_id", chunk)) : [];
  const stateByOrg = new Map((profiles ?? []).map((row) => [String(row["organization_id"]), usStateCode(text(row["state"]))]));
  return demos.map((demo) => ({ ...demo, state: stateByOrg.get(demo.organizationId) ?? null }));
}

async function readRotation(db: SupabaseClient): Promise<FunnelRotationRow[] | null> {
  const data = await rows(db.from("prospect_rotation_cursor").select("state, last_searched_at, last_found, last_built").limit(10_000));
  return data
    ? data.map((row) => ({
        state: usStateCode(text(row["state"])),
        lastSearchedAt: text(row["last_searched_at"]),
        lastFound: Number(row["last_found"]) || 0,
        lastBuilt: Number(row["last_built"]) || 0,
      }))
    : null;
}

/** The latest build per demo, when it completed. */
async function readBuilds(db: SupabaseClient, ids: string[]): Promise<FunnelEvent[] | null> {
  const data = await rowsForIds(ids, (chunk) =>
    db
      .from("generation_jobs")
      .select("organization_id, status, completed_at, created_at")
      .in("organization_id", chunk)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS),
  );
  if (!data) return null;
  const latest = new Map<string, Record<string, unknown>>();
  for (const row of data) {
    const id = String(row["organization_id"]);
    const current = latest.get(id);
    if (!current || String(row["created_at"] ?? "") > String(current["created_at"] ?? "")) latest.set(id, row);
  }
  return [...latest.entries()]
    .filter(([, row]) => row["status"] === "completed")
    .map(([organizationId, row]) => ({ organizationId, at: text(row["completed_at"]) ?? text(row["created_at"]) }));
}

/** Sent first touches (email or text). Replies and the follow-up are not deliveries. */
async function readDeliveries(db: SupabaseClient, ids: string[]): Promise<FunnelEvent[] | null> {
  const data = await rowsForIds(ids, (chunk) =>
    db.from("prospect_outreach").select("organization_id, kind, created_at").in("organization_id", chunk).eq("status", "sent").limit(MAX_EVENTS),
  );
  return data
    ? data
        .filter((row) => (typeof row["kind"] === "string" ? row["kind"] : "first_touch") === "first_touch")
        .map((row) => ({ organizationId: String(row["organization_id"]), at: text(row["created_at"]) }))
    : null;
}

async function readViews(db: SupabaseClient): Promise<FunnelEvent[] | null> {
  const data = await rows(
    db.from("prospect_preview_events").select("organization_id, created_at").eq("event", "view").order("created_at", { ascending: true }).limit(MAX_EVENTS),
  );
  return data ? data.map((row) => ({ organizationId: String(row["organization_id"]), at: text(row["created_at"]) })) : null;
}

/**
 * Paid, the way access-state reads it: the setup fee cleared (setup_paid_at or
 * setup_payment_status "paid") or the subscription is active.
 */
async function readConversions(db: SupabaseClient, ids: string[]): Promise<FunnelEvent[] | null> {
  const data = await rowsForIds(ids, (chunk) =>
    db.from("organizations").select("id, subscription_status, setup_paid_at, setup_payment_status").in("id", chunk),
  );
  if (!data) return null;
  return data
    .filter((row) => Boolean(text(row["setup_paid_at"])) || row["setup_payment_status"] === "paid" || String(row["subscription_status"] ?? "").toLowerCase() === "active")
    .map((row) => ({ organizationId: String(row["id"]), at: text(row["setup_paid_at"]) }));
}

export async function getEngineFunnel(db: SupabaseClient, options: { now?: Date } = {}): Promise<EngineFunnel> {
  const now = options.now ?? new Date();
  const [demos, rotation, views] = await Promise.all([readDemos(db), readRotation(db), readViews(db)]);
  const ids = (demos ?? []).map((demo) => demo.organizationId);
  const [builds, deliveries, conversions] = ids.length
    ? await Promise.all([readBuilds(db, ids), readDeliveries(db, ids), readConversions(db, ids)])
    : demos
      ? [[], [], []]
      : [null, null, null];
  return aggregateEngineFunnel({ demos, rotation, builds, deliveries, views, conversions }, now);
}
