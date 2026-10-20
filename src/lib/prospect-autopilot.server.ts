import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProspectDemoInput } from "@/lib/jarvis-demo-site";
import {
  alreadyDemoed,
  nameCityKey,
  nextSendAt,
  parseAutopilotPatch,
  phoneKey,
  rankProspects,
  readAutopilotSettings,
  usPhoneE164,
  type AutopilotSettings,
  type AutopilotTarget,
  type DemoFingerprints,
} from "@/lib/prospect-autopilot";
import { emailVerifiedFor, readProspectEnrichment, type ProspectEnrichment } from "@/lib/prospect-enrichment";
import { MAX_SEARCHES_PER_DAY, isUpgradeProspect } from "@/lib/prospect-finder";
import { nextRotationPairs, rotationPairs, type RotationPair } from "@/lib/prospect-rotation";
import type { OutreachChannel, OutreachResult } from "@/lib/prospect-outreach.server";

/**
 * Prospect autopilot: finds local businesses with no website, builds each a
 * private demo site and sends the preview link where the outreach rules allow.
 *
 * Bounded on every side: off until the operator turns it on, a daily build
 * cap, at most MAX_SEARCHES_PER_RUN Google Places searches per run inside the
 * shared 40-a-day Places budget, each target searched at most once per
 * SEARCH_COOLDOWN_HOURS, and one run at a time (a partial unique index on
 * unfinished runs). Demo builds run on the free AI pool only (the site-engine
 * worker scopes is_demo workspaces to free-only). Every send goes through the
 * outreach backend, which checks do-not-contact, consent for texts, quiet
 * hours and the daily caps.
 *
 * Rotation (off by default) walks built-in trades x metros after the explicit
 * targets, each pair at most once per ROTATION_COOLDOWN_DAYS, recorded in
 * prospect_rotation_cursor. Autopilot uses at most AUTOPILOT_PLACES_SHARE of
 * the daily Places budget so the operator always keeps searches of their own.
 *
 * Email gate: autopilot only emails an address the business published (found
 * on its listed social/directory page) and that enrichment verified (syntax,
 * not a role mailbox, MX, not do-not-contact). Sends are spread through the
 * outreach send queue, each a random 0–20 minutes after the previous one.
 */

export const MAX_SEARCHES_PER_RUN = 3;
export const SEARCH_COOLDOWN_HOURS = 20;
/** A run with no finish recorded after this long died; it no longer blocks new runs. */
export const STALE_RUN_MINUTES = 30;
/** Previews last 30 days; a first message with only days left is not worth sending. */
export const SEND_WITHIN_DAYS = 25;
/** A send that failed or was skipped is retried at most once a day. */
export const SEND_RETRY_HOURS = 24;
/** Bound outbound page lookups per run so third-party websites cannot stall the scheduler. */
export const MAX_PUBLIC_EMAIL_LOOKUPS_PER_RUN = 4;
const MAX_SKIPPED = 50;
/** Searches left for the operator each day: autopilot never uses the last ones. */
export const OPERATOR_PLACES_RESERVE = 10;
export const AUTOPILOT_PLACES_SHARE = MAX_SEARCHES_PER_DAY - OPERATOR_PLACES_RESERVE;
/** Addresses whose MX check could not run (DNS down) are re-checked at most this many times per run. */
export const MAX_EMAIL_REVERIFY_PER_RUN = 5;

export type AutopilotSkip = { reason: string; name?: string; target?: string };

export type AutopilotRunSummary = {
  status: "disabled" | "busy" | "done" | "failed";
  runId: string | null;
  found: number;
  built: number;
  emailed: number;
  texted: number;
  /** Old demos with no enrichment record re-checked this run, and how many results were written. */
  legacyChecked: number;
  legacyWritten: number;
  skipped: AutopilotSkip[];
  error: string | null;
};

export type AutopilotRunRow = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  found: number;
  built: number;
  emailed: number;
  texted: number;
  skipped: AutopilotSkip[];
  error: string | null;
};

export async function getAutopilotSettings(db: SupabaseClient): Promise<AutopilotSettings> {
  const { data, error } = await db.from("prospect_autopilot_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("Couldn't read the autopilot settings.");
  return readAutopilotSettings(data as Record<string, unknown> | null);
}

/** Applies a validated change. The operator who saves becomes the owner of new autopilot demos. */
export async function saveAutopilotSettings(db: SupabaseClient, patch: unknown, actorId: string): Promise<AutopilotSettings> {
  const change = parseAutopilotPatch(patch);
  const current = await getAutopilotSettings(db);
  const next = { ...current, ...change };
  const { error } = await db.from("prospect_autopilot_settings").upsert({
    id: 1,
    enabled: next.enabled,
    targets: next.targets,
    daily_build_cap: next.dailyBuildCap,
    send_email: next.sendEmail,
    send_sms: next.sendSms,
    // Written only when changed, so saves keep working before the rotation column exists.
    ...(change.rotation ? { rotation: next.rotation } : {}),
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Couldn't save the autopilot settings.");
  await db.from("audit_logs").insert({
    organization_id: null,
    actor_id: actorId,
    action: "jarvis.prospect_autopilot.configured",
    entity: "prospect_autopilot_settings",
    entity_id: null,
    metadata: { change },
  });
  return getAutopilotSettings(db);
}

const readRun = (row: Record<string, unknown>): AutopilotRunRow => ({
  id: String(row["id"]),
  startedAt: String(row["started_at"]),
  finishedAt: typeof row["finished_at"] === "string" ? row["finished_at"] : null,
  trigger: typeof row["trigger"] === "string" ? row["trigger"] : "cron",
  found: Number(row["found"]) || 0,
  built: Number(row["built"]) || 0,
  emailed: Number(row["emailed"]) || 0,
  texted: Number(row["texted"]) || 0,
  skipped: Array.isArray(row["skipped"]) ? (row["skipped"] as AutopilotSkip[]).slice(0, MAX_SKIPPED) : [],
  error: typeof row["error"] === "string" ? row["error"] : null,
});

export async function listAutopilotRuns(db: SupabaseClient, limit = 10): Promise<AutopilotRunRow[]> {
  const { data, error } = await db
    .from("prospect_autopilot_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error("Couldn't read the autopilot runs.");
  return (data ?? []).map((row) => readRun(row as Record<string, unknown>));
}

const startOfUtcDay = (now: Date) => {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day.toISOString();
};

const targetQuery = (target: AutopilotTarget) => `${target.niche} in ${target.city}${target.state ? `, ${target.state}` : ""}`;

/** Is the owner who turned autopilot on still a super-admin? Autopilot demos belong to them. */
async function verifiedOwner(db: SupabaseClient, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return !error && data ? userId : null;
}

type DemoRow = { organizationId: string; marker: Record<string, unknown> };

async function prospectDemoRows(db: SupabaseClient, autopilotOnly: boolean): Promise<DemoRow[]> {
  let query = db.from("website_settings").select("organization_id, generation").not("generation->prospectDemo", "is", null);
  if (autopilotOnly) query = query.eq("generation->prospectDemo->>source", "autopilot");
  const { data, error } = await query.limit(1000);
  if (error) throw new Error(`Couldn't read existing demos: ${error.message}`);
  const out: DemoRow[] = [];
  for (const row of data ?? []) {
    const marker = (row.generation as Record<string, unknown> | null)?.["prospectDemo"];
    if (!marker || typeof marker !== "object" || (marker as Record<string, unknown>)["kind"] !== "prospect_demo") continue;
    out.push({ organizationId: String(row.organization_id), marker: marker as Record<string, unknown> });
  }
  return out;
}

/** Place ids, phones and name+city of every business already demoed or texted. */
async function demoFingerprints(db: SupabaseClient): Promise<DemoFingerprints> {
  const seen: DemoFingerprints = { placeIds: new Set(), phones: new Set(), nameCity: new Set() };
  const demos = await prospectDemoRows(db, false);
  for (const demo of demos) if (typeof demo.marker["placeId"] === "string") seen.placeIds.add(demo.marker["placeId"]);
  const ids = demos.map((demo) => demo.organizationId);
  if (ids.length) {
    const [orgs, profiles] = await Promise.all([
      db.from("organizations").select("id, name").in("id", ids),
      db.from("business_profiles").select("organization_id, phone, city").in("organization_id", ids),
    ]);
    const cityByOrg = new Map((profiles.data ?? []).map((row) => [String(row.organization_id), row as Record<string, unknown>]));
    for (const row of profiles.data ?? []) {
      const phone = phoneKey(row.phone as string | null);
      if (phone) seen.phones.add(phone);
    }
    for (const org of orgs.data ?? []) {
      const city = cityByOrg.get(String(org.id))?.["city"];
      seen.nameCity.add(nameCityKey(String(org.name ?? ""), typeof city === "string" ? city : null));
    }
  }
  // Numbers already texted (any mode) are never demoed again.
  const { data: contacted } = await db.from("prospect_outreach").select("recipient").eq("channel", "sms").limit(5000);
  for (const row of contacted ?? []) {
    const phone = phoneKey(row.recipient as string | null);
    if (phone) seen.phones.add(phone);
  }
  return seen;
}

type SendableDemo = {
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  enrichment: ProspectEnrichment | null;
};

/** Finished, unclaimed autopilot demos young enough to share. */
async function sendableDemos(db: SupabaseClient, now: Date): Promise<SendableDemo[]> {
  const rows = (await prospectDemoRows(db, true)).filter((demo) => {
    const created = Date.parse(String(demo.marker["createdAt"] ?? ""));
    const claimed = typeof demo.marker["claimedAt"] === "string" && demo.marker["claimedAt"];
    return !claimed && Number.isFinite(created) && now.getTime() - created <= SEND_WITHIN_DAYS * 86_400_000;
  });
  const ids = rows.map((row) => row.organizationId);
  if (!ids.length) return [];
  const [orgs, jobs, profiles] = await Promise.all([
    db.from("organizations").select("id, name").in("id", ids),
    db
      .from("generation_jobs")
      .select("organization_id, status, created_at")
      .in("organization_id", ids)
      .order("created_at", { ascending: false }),
    db.from("business_profiles").select("organization_id, email, phone, state").in("organization_id", ids),
  ]);
  const latest = new Map<string, string>();
  for (const job of jobs.data ?? []) if (!latest.has(String(job.organization_id))) latest.set(String(job.organization_id), String(job.status));
  const profileByOrg = new Map((profiles.data ?? []).map((row) => [String(row.organization_id), row as Record<string, unknown>]));
  const markerByOrg = new Map(rows.map((row) => [row.organizationId, row.marker]));
  const out: SendableDemo[] = [];
  for (const org of orgs.data ?? []) {
    const id = String(org.id);
    if (latest.get(id) !== "completed") continue;
    const profile = profileByOrg.get(id);
    const email = typeof profile?.["email"] === "string" && profile["email"].includes("@") ? profile["email"] : null;
    const phone = typeof profile?.["phone"] === "string" && profile["phone"] ? profile["phone"] : null;
    const state = typeof profile?.["state"] === "string" && profile["state"] ? profile["state"] : null;
    const enrichment = readProspectEnrichment(markerByOrg.get(id)?.["enrichment"]);
    out.push({ organizationId: id, name: String(org.name ?? ""), email, phone, state, enrichment });
  }
  return out;
}

/**
 * One autopilot pass. Safe to call often: it returns at once when switched
 * off or when another run is still going.
 */
export async function runProspectAutopilot(
  db: SupabaseClient,
  options: {
    trigger?: "cron" | "manual";
    onQueued?: (organizationId: string) => void;
    now?: () => Date;
    /** Send spacing jitter (tests pin it). */
    random?: () => number;
  } = {},
): Promise<AutopilotRunSummary> {
  const now = options.now ?? (() => new Date());
  const summary: AutopilotRunSummary = { status: "done", runId: null, found: 0, built: 0, emailed: 0, texted: 0, legacyChecked: 0, legacyWritten: 0, skipped: [], error: null };
  const skip = (entry: AutopilotSkip) => {
    if (summary.skipped.length < MAX_SKIPPED) summary.skipped.push(entry);
  };

  const settings = await getAutopilotSettings(db);
  if (!settings.enabled) return { ...summary, status: "disabled" };

  // A run that never recorded its finish died; it must not block every later run.
  await db
    .from("prospect_autopilot_runs")
    .update({ finished_at: now().toISOString(), error: "Run stopped without finishing (worker restarted)." })
    .is("finished_at", null)
    .lt("started_at", new Date(now().getTime() - STALE_RUN_MINUTES * 60_000).toISOString());

  const { data: run, error: runError } = await db
    .from("prospect_autopilot_runs")
    .insert({ trigger: options.trigger ?? "cron", started_at: now().toISOString() })
    .select("id")
    .single();
  if (runError || !run) {
    if ((runError as { code?: string } | null)?.code === "23505") return { ...summary, status: "busy" };
    throw new Error(`Couldn't start the autopilot run: ${runError?.message ?? "no run returned"}`);
  }
  summary.runId = String((run as { id: string }).id);
  const record = async (finished: boolean) => {
    await db
      .from("prospect_autopilot_runs")
      .update({
        found: summary.found,
        built: summary.built,
        emailed: summary.emailed,
        texted: summary.texted,
        skipped: summary.skipped,
        error: summary.error,
        ...(finished ? { finished_at: now().toISOString() } : {}),
      })
      .eq("id", summary.runId);
  };

  try {
    await buildPhase(db, settings, summary, skip, now, options.onQueued);
    await reverifyLegacyPhase(db, summary, skip, now);
    await sendPhase(db, settings, summary, skip, now, options.random ?? Math.random);
  } catch (error) {
    summary.status = "failed";
    summary.error = (error instanceof Error ? error.message : "Autopilot run failed.").slice(0, 500);
  } finally {
    await record(true);
  }
  return summary;
}

/** Google Places searches made today by anyone (the shared 40-a-day budget). */
async function placesSearchesToday(db: SupabaseClient, now: Date): Promise<number> {
  const { count, error } = await db
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "jarvis.prospects.search")
    .gte("created_at", startOfUtcDay(now));
  // Unreadable budget: assume it is spent rather than risk going over.
  if (error) return MAX_SEARCHES_PER_DAY;
  return count ?? 0;
}

type CursorRow = { lastSearchedAt: string; searches: number };

async function readRotationCursor(db: SupabaseClient): Promise<Map<string, CursorRow> | null> {
  const { data, error } = await db.from("prospect_rotation_cursor").select("id, last_searched_at, searches").limit(10_000);
  if (error) return null;
  const out = new Map<string, CursorRow>();
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    out.set(String(record["id"]), { lastSearchedAt: String(record["last_searched_at"] ?? ""), searches: Number(record["searches"]) || 0 });
  }
  return out;
}

async function buildPhase(
  db: SupabaseClient,
  settings: AutopilotSettings,
  summary: AutopilotRunSummary,
  skip: (entry: AutopilotSkip) => void,
  now: () => Date,
  onQueued?: (organizationId: string) => void,
) {
  if ((!settings.targets.length && !settings.rotation.enabled) || settings.dailyBuildCap <= 0) return;
  const { data: today } = await db.from("prospect_autopilot_runs").select("built").gte("started_at", startOfUtcDay(now()));
  const builtToday = (today ?? []).reduce((total, row) => total + (Number((row as { built?: unknown }).built) || 0), 0);
  let remaining = settings.dailyBuildCap - builtToday;
  if (remaining <= 0) return skip({ reason: "daily_build_cap_reached" });

  const owner = await verifiedOwner(db, settings.updatedBy);
  if (!owner) return skip({ reason: "no_owner: save the autopilot settings again as a super-admin" });

  // Never exceed the shared Places budget, and leave the operator their reserve.
  let searchesLeft = Math.min(MAX_SEARCHES_PER_RUN, AUTOPILOT_PLACES_SHARE - (await placesSearchesToday(db, now())));
  if (searchesLeft <= 0) return skip({ reason: "places_daily_budget_reached" });

  const { findProspects, provisionProspectDemo } = await import("@/lib/jarvis-demo-site.server");
  const { isDoNotContact } = await import("@/lib/prospect-outreach.server");
  const { prospectDemoInput } = await import("@/lib/prospect-finder");
  const { enrichProspectEmail } = await import("@/lib/prospect-enrichment.server");
  const seen = await demoFingerprints(db);
  let publicEmailLookups = 0;
  let budgetSpent = false;
  const cooldownSince = new Date(now().getTime() - SEARCH_COOLDOWN_HOURS * 3_600_000).toISOString();

  /** Searches one target and builds its best new prospects; null when it was not searched. */
  const searchAndBuild = async (target: AutopilotTarget): Promise<{ found: number; built: number; error: string | null } | null> => {
    const query = targetQuery(target);
    const { count } = await db
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "jarvis.prospects.search")
      .eq("metadata->>query", query)
      .gte("created_at", cooldownSince);
    if ((count ?? 0) > 0) {
      skip({ reason: "searched_recently", target: query });
      return null;
    }
    searchesLeft -= 1;
    let prospects;
    try {
      prospects = (await findProspects(db, owner, target)).prospects;
    } catch (error) {
      const message = error instanceof Error ? error.message : "search failed";
      const budget = /limit reached/i.test(message);
      skip({ reason: budget ? "places_daily_budget_reached" : `search_failed: ${message.slice(0, 160)}`, target: query });
      if (budget) {
        budgetSpent = true;
        return null;
      }
      return { found: 0, built: 0, error: message.slice(0, 200) };
    }
    summary.found += prospects.length;
    let built = 0;
    for (const prospect of rankProspects(prospects)) {
      if (remaining <= 0) break;
      // A business with its own website qualifies only with verified gaps worth fixing.
      if (prospect.presence === "has_website" && !isUpgradeProspect(prospect.siteGaps)) {
        skip({ reason: "has_website", name: prospect.name, target: query });
        continue;
      }
      if (alreadyDemoed(prospect, seen)) {
        skip({ reason: "already_demoed", name: prospect.name, target: query });
        continue;
      }
      const e164 = usPhoneE164(prospect.phone);
      if (e164 && (await isDoNotContact(db, e164))) {
        skip({ reason: "do_not_contact", name: prospect.name, target: query });
        continue;
      }
      // A social/directory listing is not a real website, so it stays eligible.
      // Its public page may publish a business email: find it (never guess),
      // verify it, and record where it came from. Lookups are capped per run.
      let enrichment: ProspectEnrichment | null = null;
      if (prospect.website && publicEmailLookups < MAX_PUBLIC_EMAIL_LOOKUPS_PER_RUN) {
        publicEmailLookups += 1;
        enrichment = await enrichProspectEmail(db, prospect.website, { now }).catch(() => null);
      }
      // A rejected address (role mailbox, no MX, do-not-contact) is not kept on the profile.
      const listedEmail = (prospect as { email?: string | null }).email ?? null; // OpenStreetMap listings can publish one
      const publicEmail = enrichment?.email && enrichment.status !== "rejected" ? enrichment.email : listedEmail;
      let input;
      try {
        input = parseProspectDemoInput(prospectDemoInput(prospect, target.niche, publicEmail));
      } catch (error) {
        skip({ reason: `invalid_facts: ${error instanceof Error ? error.message : "invalid"}`, name: prospect.name, target: query });
        continue;
      }
      try {
        const demo = await provisionProspectDemo(db, input, owner, {
          source: "autopilot",
          placeId: prospect.placeId,
          ...(enrichment ? { enrichment } : {}),
        });
        seen.placeIds.add(prospect.placeId);
        const phone = phoneKey(prospect.phone);
        if (phone) seen.phones.add(phone);
        seen.nameCity.add(nameCityKey(prospect.name, prospect.city));
        summary.built += 1;
        built += 1;
        remaining -= 1;
        // Recorded per build so a run that dies part-way still counts toward today's cap.
        await db.from("prospect_autopilot_runs").update({ built: summary.built, found: summary.found }).eq("id", summary.runId);
        onQueued?.(demo.organizationId);
      } catch (error) {
        skip({ reason: `build_failed: ${(error instanceof Error ? error.message : "failed").slice(0, 160)}`, name: prospect.name, target: query });
      }
    }
    return { found: prospects.length, built, error: null };
  };

  // Explicit targets first: they always take priority over rotation.
  for (const target of settings.targets) {
    if (remaining <= 0 || searchesLeft <= 0 || budgetSpent) return;
    await searchAndBuild(target);
  }

  if (!settings.rotation.enabled || remaining <= 0 || searchesLeft <= 0 || budgetSpent) return;
  const cursor = await readRotationCursor(db);
  if (!cursor) return skip({ reason: "rotation_unavailable: apply the prospect rotation migration" });
  const lastSearched = new Map([...cursor].map(([key, row]) => [key, row.lastSearchedAt]));
  // A few extra candidates, in case some were searched by hand recently.
  const due: RotationPair[] = nextRotationPairs(rotationPairs(settings.rotation), lastSearched, now(), searchesLeft * 3);
  if (!due.length) return skip({ reason: "rotation_exhausted: every pair was searched within the cooldown" });
  for (const pair of due) {
    if (remaining <= 0 || searchesLeft <= 0 || budgetSpent) break;
    const result = await searchAndBuild({ niche: pair.trade, city: pair.city, state: pair.state });
    if (!result) continue;
    // Advance the cursor: this pair is not searched again until its cooldown passes.
    await db.from("prospect_rotation_cursor").upsert({
      id: pair.key,
      trade: pair.trade,
      city: pair.city,
      state: pair.state,
      last_searched_at: now().toISOString(),
      searches: (cursor.get(pair.key)?.searches ?? 0) + 1,
      last_found: result.found,
      last_built: result.built,
      last_error: result.error,
    });
  }
}

/**
 * Once per run, before sending: re-verifies a few old demos that have no
 * enrichment record (their business_profiles email), so the email gate can
 * accept the verified ones. Never blocks the run: a failure is a skip.
 */
async function reverifyLegacyPhase(db: SupabaseClient, summary: AutopilotRunSummary, skip: (entry: AutopilotSkip) => void, now: () => Date) {
  try {
    const { reverifyLegacyDemos } = await import("@/lib/prospect-enrichment.server");
    const result = await reverifyLegacyDemos(db, { now });
    summary.legacyChecked += Number(result?.checked) || 0;
    summary.legacyWritten += Number(result?.written) || 0;
  } catch (error) {
    skip({ reason: `legacy_reverify_failed: ${(error instanceof Error ? error.message : "failed").slice(0, 160)}` });
  }
}

const RETRY_NEXT_RUN = new Set(["quiet_hours", "daily_cap", "outside_business_hours", "sms_not_configured", "email_not_configured"]);

export type OutreachQueueItem = {
  organizationId: string;
  channel: OutreachChannel;
  to: string;
  mode: "autopilot";
  /** Null: the sender drafts the message from the demo's facts at send time. */
  subject: string | null;
  body: string | null;
  /** Not sent before this time (random 0–20 minute spacing between autopilot sends). */
  notBefore: string;
  kind?: "first_touch" | "follow_up";
};

/** Queued, not sent: the send queue drains it at `notBefore` through the consent/do-not-contact/cap-checked backend. */
async function enqueueOutreach(db: SupabaseClient, item: OutreachQueueItem) {
  const { enqueueOutreach: enqueue } = await import("@/lib/prospect-send-queue.server");
  return enqueue(db, { organizationId: item.organizationId, channel: item.channel, to: item.to, mode: item.mode, subject: item.subject, body: item.body, notBefore: new Date(item.notBefore), ...(item.kind ? { kind: item.kind } : {}) });
}

/** Sends already waiting in the queue, so an hourly run never queues the same demo twice. */
async function queuedSends(db: SupabaseClient, organizationIds: string[]): Promise<Set<string>> {
  const { data, error } = await db
    .from("prospect_send_queue")
    .select("organization_id, channel")
    .in("organization_id", organizationIds)
    .eq("status", "queued");
  // No queue yet (Track A not deployed): nothing is waiting.
  if (error) return new Set();
  return new Set((data ?? []).map((row) => `${String(row.organization_id)}|${String(row.channel)}`));
}

async function sendPhase(
  db: SupabaseClient,
  settings: AutopilotSettings,
  summary: AutopilotRunSummary,
  skip: (entry: AutopilotSkip) => void,
  now: () => Date,
  random: () => number,
) {
  if (!settings.sendEmail && !settings.sendSms) return;
  const demos = await sendableDemos(db, now());
  if (!demos.length) return;
  const ids = demos.map((demo) => demo.organizationId);
  const { data: history, error } = await db
    .from("prospect_outreach")
    .select("organization_id, channel, status, reason, created_at, kind")
    .in("organization_id", ids)
    .eq("mode", "autopilot");
  if (error) return skip({ reason: "outreach_unavailable" });
  const queued = await queuedSends(db, ids);
  const retrySince = now().getTime() - SEND_RETRY_HOURS * 3_600_000;
  // A skip that only means "not right now" (quiet hours, today's cap, setup)
  // retries next run; any other recent attempt waits SEND_RETRY_HOURS.
  const blocked = (organizationId: string, channel: OutreachChannel) =>
    queued.has(`${organizationId}|${channel}`) ||
    (history ?? []).some(
      (row) =>
        row.organization_id === organizationId &&
        row.channel === channel &&
        (row.status === "sent" ||
          (Date.parse(String(row.created_at)) >= retrySince && !(row.status === "skipped" && RETRY_NEXT_RUN.has(String(row.reason))))),
    );

  const { smsAllowedNow, nextEmailBusinessHour, isDoNotContact } = await import("@/lib/prospect-outreach.server");
  const { verifyProspectEmail } = await import("@/lib/prospect-enrichment.server");
  const { assessDemoForOutreach } = await import("@/lib/demo-launch-gate.server");
  let reverified = 0;
  let sendAt = now();
  const enqueue = async (demo: SendableDemo, channel: OutreachChannel, to: string) => {
    sendAt = nextSendAt(sendAt, random);
    // Emails wait for business hours in the business's zone; texts check their own window.
    const notBefore = channel === "email" ? nextEmailBusinessHour(sendAt, demo.state, demo.phone) : sendAt;
    return enqueueOutreach(db, { organizationId: demo.organizationId, channel, to, mode: "autopilot", subject: null, body: null, notBefore: notBefore.toISOString() });
  };

  /** The verified-email gate: only an address the business published and enrichment verified. */
  const emailCleared = async (demo: SendableDemo, to: string): Promise<boolean> => {
    if (emailVerifiedFor(demo.enrichment, to)) return true;
    const enrichment = demo.enrichment;
    // Found and published, but DNS was down when it was checked: check again (bounded).
    if (enrichment?.status === "unverified" && enrichment.source && enrichment.email === to.toLowerCase() && reverified < MAX_EMAIL_REVERIFY_PER_RUN) {
      reverified += 1;
      const check = await verifyProspectEmail(db, to, { now });
      if (check.status === "verified") return true;
      skip({ reason: `email_unverified: ${check.reason}`, name: demo.name });
      return false;
    }
    skip({ reason: `email_unverified${enrichment ? `: ${enrichment.reason || enrichment.status}` : ""}`, name: demo.name });
    return false;
  };

  for (const demo of demos) {
    const emailTo = settings.sendEmail && demo.email && !blocked(demo.organizationId, "email") ? demo.email : null;
    // Texts only reach numbers with recorded consent; the outreach backend
    // refuses the rest, so autopilot never cold-texts anyone.
    const e164 = usPhoneE164(demo.phone);
    // Outside the texting window, wait quietly instead of logging an hourly skip.
    const smsTo = settings.sendSms && e164 && !blocked(demo.organizationId, "sms") && smsAllowedNow(now(), demo.state, e164) ? e164 : null;
    const sendEmail = emailTo ? await emailCleared(demo, emailTo) : false;
    if (!sendEmail && !smsTo) continue;

    // Production gate: a demo that isn't good and truthful enough is never sent.
    const gate = await assessDemoForOutreach(db, demo.organizationId);
    if (!gate.ok) {
      skip({ reason: `quality_gate: ${gate.blockers.map((blocker) => blocker.message).join("; ").slice(0, 200)}`, name: demo.name });
      continue;
    }
    if (sendEmail && emailTo) {
      const result = await enqueue(demo, "email", emailTo);
      if (result.ok) summary.emailed += 1;
      else skip({ reason: `email_${result.reason}`, name: demo.name });
    }
    if (smsTo) {
      const result = await enqueue(demo, "sms", smsTo);
      if (result.ok) summary.texted += 1;
      else skip({ reason: `sms_${result.reason}`, name: demo.name });
    }
  }

  // One follow-up email, 48 hours after the first, if there was no reply.
  if (!settings.sendEmail) return;
  const { followUpDue } = await import("@/lib/prospect-follow-up");
  const replied = new Set<string>();
  const { data: inbound } = await db.from("prospect_inbound").select("organization_id").in("organization_id", ids);
  for (const row of inbound ?? []) replied.add(String(row.organization_id));
  for (const demo of demos) {
    if (!demo.email || queued.has(`${demo.organizationId}|email`)) continue;
    const sent = (history ?? []).filter((row) => row.organization_id === demo.organizationId && row.channel === "email" && row.status === "sent");
    const firstSentAt = sent.filter((row) => (row.kind ?? "first_touch") === "first_touch").map((row) => String(row.created_at)).sort()[0] ?? null;
    if (!followUpDue({ firstSentAt, followUpSent: sent.some((row) => row.kind === "follow_up"), replied: replied.has(demo.organizationId), claimed: false, now: now() })) continue;
    // Not queued at all for an opted-out address or a demo that fails the launch
    // gate (sendDemoOutreach re-checks both at send time).
    if (await isDoNotContact(db, demo.email)) {
      skip({ reason: "follow_up_do_not_contact", name: demo.name });
      continue;
    }
    const followUpGate = await assessDemoForOutreach(db, demo.organizationId);
    if (!followUpGate.ok) {
      skip({ reason: `follow_up_quality_gate: ${followUpGate.blockers.map((blocker) => blocker.message).join("; ").slice(0, 200)}`, name: demo.name });
      continue;
    }
    sendAt = nextSendAt(sendAt, random);
    const result = await enqueueOutreach(db, {
      organizationId: demo.organizationId,
      channel: "email",
      to: demo.email,
      mode: "autopilot",
      kind: "follow_up",
      subject: null,
      body: null,
      notBefore: nextEmailBusinessHour(sendAt, demo.state, demo.phone).toISOString(),
    });
    if (result.ok) summary.emailed += 1;
    else skip({ reason: `follow_up_${result.reason}`, name: demo.name });
  }
}
