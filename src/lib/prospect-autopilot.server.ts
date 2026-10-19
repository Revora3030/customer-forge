import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProspectDemoInput } from "@/lib/jarvis-demo-site";
import {
  alreadyDemoed,
  nameCityKey,
  parseAutopilotPatch,
  phoneKey,
  rankProspects,
  readAutopilotSettings,
  usPhoneE164,
  type AutopilotSettings,
  type AutopilotTarget,
  type DemoFingerprints,
} from "@/lib/prospect-autopilot";

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

export type AutopilotSkip = { reason: string; name?: string; target?: string };

export type AutopilotRunSummary = {
  status: "disabled" | "busy" | "done" | "failed";
  runId: string | null;
  found: number;
  built: number;
  emailed: number;
  texted: number;
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
    db.from("business_profiles").select("organization_id, email, phone").in("organization_id", ids),
  ]);
  const latest = new Map<string, string>();
  for (const job of jobs.data ?? []) if (!latest.has(String(job.organization_id))) latest.set(String(job.organization_id), String(job.status));
  const profileByOrg = new Map((profiles.data ?? []).map((row) => [String(row.organization_id), row as Record<string, unknown>]));
  const out: SendableDemo[] = [];
  for (const org of orgs.data ?? []) {
    const id = String(org.id);
    if (latest.get(id) !== "completed") continue;
    const profile = profileByOrg.get(id);
    const email = typeof profile?.["email"] === "string" && profile["email"].includes("@") ? profile["email"] : null;
    const phone = typeof profile?.["phone"] === "string" && profile["phone"] ? profile["phone"] : null;
    out.push({ organizationId: id, name: String(org.name ?? ""), email, phone });
  }
  return out;
}

/**
 * One autopilot pass. Safe to call often: it returns at once when switched
 * off or when another run is still going.
 */
export async function runProspectAutopilot(
  db: SupabaseClient,
  options: { trigger?: "cron" | "manual"; onQueued?: (organizationId: string) => void; now?: () => Date } = {},
): Promise<AutopilotRunSummary> {
  const now = options.now ?? (() => new Date());
  const summary: AutopilotRunSummary = { status: "done", runId: null, found: 0, built: 0, emailed: 0, texted: 0, skipped: [], error: null };
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
    await sendPhase(db, settings, summary, skip, now);
  } catch (error) {
    summary.status = "failed";
    summary.error = (error instanceof Error ? error.message : "Autopilot run failed.").slice(0, 500);
  } finally {
    await record(true);
  }
  return summary;
}

async function buildPhase(
  db: SupabaseClient,
  settings: AutopilotSettings,
  summary: AutopilotRunSummary,
  skip: (entry: AutopilotSkip) => void,
  now: () => Date,
  onQueued?: (organizationId: string) => void,
) {
  if (!settings.targets.length || settings.dailyBuildCap <= 0) return;
  const { data: today } = await db.from("prospect_autopilot_runs").select("built").gte("started_at", startOfUtcDay(now()));
  const builtToday = (today ?? []).reduce((total, row) => total + (Number((row as { built?: unknown }).built) || 0), 0);
  let remaining = settings.dailyBuildCap - builtToday;
  if (remaining <= 0) return skip({ reason: "daily_build_cap_reached" });

  const owner = await verifiedOwner(db, settings.updatedBy);
  if (!owner) return skip({ reason: "no_owner: save the autopilot settings again as a super-admin" });

  const { findProspects, provisionProspectDemo } = await import("@/lib/jarvis-demo-site.server");
  const { isDoNotContact } = await import("@/lib/prospect-outreach.server");
  const { prospectDemoInput } = await import("@/lib/prospect-finder");
  const { findPublicEmail } = await import("@/lib/prospect-email.server");
  const seen = await demoFingerprints(db);
  let publicEmailLookups = 0;
  const cooldownSince = new Date(now().getTime() - SEARCH_COOLDOWN_HOURS * 3_600_000).toISOString();

  let searches = 0;
  for (const target of settings.targets) {
    if (remaining <= 0 || searches >= MAX_SEARCHES_PER_RUN) break;
    const query = targetQuery(target);
    const { count } = await db
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "jarvis.prospects.search")
      .eq("metadata->>query", query)
      .gte("created_at", cooldownSince);
    if ((count ?? 0) > 0) {
      skip({ reason: "searched_recently", target: query });
      continue;
    }
    searches += 1;
    let prospects;
    try {
      prospects = (await findProspects(db, owner, target)).prospects;
    } catch (error) {
      const message = error instanceof Error ? error.message : "search failed";
      skip({ reason: /limit reached/i.test(message) ? "places_daily_budget_reached" : `search_failed: ${message.slice(0, 160)}`, target: query });
      if (/limit reached/i.test(message)) break;
      continue;
    }
    summary.found += prospects.length;
    for (const prospect of rankProspects(prospects)) {
      if (remaining <= 0) break;
      if (alreadyDemoed(prospect, seen)) {
        skip({ reason: "already_demoed", name: prospect.name, target: query });
        continue;
      }
      const e164 = usPhoneE164(prospect.phone);
      if (e164 && (await isDoNotContact(db, e164))) {
        skip({ reason: "do_not_contact", name: prospect.name, target: query });
        continue;
      }
      let publicEmail: string | null = null;
      // A social/directory listing is not a real website, so it remains eligible
      // for a demo. When its public page lists a business email, carry that fact
      // into the profile; never guess addresses and cap lookups per scheduled run.
      if (prospect.presence === "social_only" && prospect.website && publicEmailLookups < MAX_PUBLIC_EMAIL_LOOKUPS_PER_RUN) {
        publicEmailLookups += 1;
        publicEmail = await findPublicEmail(prospect.website).catch(() => null);
      }
      let input;
      try {
        input = parseProspectDemoInput(prospectDemoInput(prospect, target.niche, publicEmail));
      } catch (error) {
        skip({ reason: `invalid_facts: ${error instanceof Error ? error.message : "invalid"}`, name: prospect.name, target: query });
        continue;
      }
      try {
        const demo = await provisionProspectDemo(db, input, owner, { source: "autopilot", placeId: prospect.placeId });
        seen.placeIds.add(prospect.placeId);
        const phone = phoneKey(prospect.phone);
        if (phone) seen.phones.add(phone);
        seen.nameCity.add(nameCityKey(prospect.name, prospect.city));
        summary.built += 1;
        remaining -= 1;
        // Recorded per build so a run that dies part-way still counts toward today's cap.
        await db.from("prospect_autopilot_runs").update({ built: summary.built, found: summary.found }).eq("id", summary.runId);
        onQueued?.(demo.organizationId);
      } catch (error) {
        skip({ reason: `build_failed: ${(error instanceof Error ? error.message : "failed").slice(0, 160)}`, name: prospect.name, target: query });
      }
    }
  }
}

async function sendPhase(
  db: SupabaseClient,
  settings: AutopilotSettings,
  summary: AutopilotRunSummary,
  skip: (entry: AutopilotSkip) => void,
  now: () => Date,
) {
  if (!settings.sendEmail && !settings.sendSms) return;
  const demos = await sendableDemos(db, now());
  if (!demos.length) return;
  const { data: history, error } = await db
    .from("prospect_outreach")
    .select("organization_id, channel, status, created_at")
    .in("organization_id", demos.map((demo) => demo.organizationId))
    .eq("mode", "autopilot");
  if (error) return skip({ reason: "outreach_unavailable" });
  const retrySince = now().getTime() - SEND_RETRY_HOURS * 3_600_000;
  const blocked = (organizationId: string, channel: "email" | "sms") =>
    (history ?? []).some(
      (row) =>
        row.organization_id === organizationId &&
        row.channel === channel &&
        (row.status === "sent" || Date.parse(String(row.created_at)) >= retrySince),
    );

  const { sendDemoOutreach } = await import("@/lib/prospect-outreach.server");
  for (const demo of demos) {
    if (settings.sendEmail && demo.email && !blocked(demo.organizationId, "email")) {
      const result = await sendDemoOutreach(db, { organizationId: demo.organizationId, channel: "email", to: demo.email, mode: "autopilot", actorId: null });
      if (result.ok) summary.emailed += 1;
      else skip({ reason: `email_${result.reason}`, name: demo.name });
    }
    // Texts only reach numbers with recorded consent; the outreach backend
    // refuses the rest, so autopilot never cold-texts anyone.
    const e164 = usPhoneE164(demo.phone);
    if (settings.sendSms && e164 && !blocked(demo.organizationId, "sms")) {
      const result = await sendDemoOutreach(db, { organizationId: demo.organizationId, channel: "sms", to: e164, mode: "autopilot", actorId: null });
      if (result.ok) summary.texted += 1;
      else skip({ reason: `sms_${result.reason}`, name: demo.name });
    }
  }
}
