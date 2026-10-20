import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoEngineEvidence, DemoEngineRowId } from "./jarvis-capability-scorecard";

/**
 * Live evidence for the prospect demo engine's seven self-audit rows, read
 * from its own tables (read-only, service role). Runtime-gated: a table that
 * is missing (its migration not applied yet) or unreadable makes that row
 * "unknown" with the reason, never a pass. Activity proves a stage runs in
 * production; code that exists but has left no trace is only "configured".
 */

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;
/** The autopilot runs hourly; a run older than this is stale. */
const RUNTIME_STALE_MS = 3 * 3_600_000;
/** An unfinished run older than this is stuck. */
const RUNTIME_STUCK_MS = 3_600_000;

type Query = PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>;

async function read<T>(run: () => Query): Promise<{ ok: true; data: T; count: number | null } | { ok: false; reason: string }> {
  try {
    const response = await run();
    if (response.error) return { ok: false, reason: response.error.message.slice(0, 120) };
    return { ok: true, data: response.data as T, count: response.count ?? null };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 120) : "unreadable" };
  }
}

const countOf = (result: { ok: true; count: number | null } | { ok: false }) => (result.ok ? result.count ?? 0 : null);

export async function collectDemoEngineEvidence(
  db: SupabaseClient,
  now = new Date(),
): Promise<Partial<Record<DemoEngineRowId, DemoEngineEvidence>>> {
  const checkedAt = now.toISOString();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();
  const head = { count: "exact" as const, head: true };

  const [searches, runs, demos, gateSkips, sent, failed, inbound, inboundHandled, events, lastEvent] = await Promise.all([
    read<null>(() => db.from("audit_logs").select("id", head).eq("action", "jarvis.prospects.search").gte("created_at", since)),
    read<Array<{ started_at: string; finished_at: string | null; found: number; built: number; emailed: number; texted: number; error: string | null }>>(() =>
      db.from("prospect_autopilot_runs").select("started_at, finished_at, found, built, emailed, texted, error").order("started_at", { ascending: false }).limit(10),
    ),
    read<Array<{ generation: unknown }>>(() => db.from("website_settings").select("generation").not("generation->prospectDemo", "is", null).limit(500)),
    read<null>(() => db.from("prospect_outreach").select("id", head).eq("reason", "quality_gate").gte("created_at", since)),
    read<null>(() => db.from("prospect_outreach").select("id", head).eq("status", "sent").gte("created_at", since)),
    read<null>(() => db.from("prospect_outreach").select("id", head).eq("status", "failed").gte("created_at", since)),
    read<null>(() => db.from("prospect_inbound").select("id", head).gte("created_at", since)),
    read<null>(() => db.from("prospect_inbound").select("id", head).gte("created_at", since).not("handled_at", "is", null)),
    read<null>(() => db.from("prospect_preview_events").select("id", head).gte("created_at", since)),
    read<Array<{ created_at: string }>>(() => db.from("prospect_preview_events").select("created_at").order("created_at", { ascending: false }).limit(1)),
  ]);

  const evidence: Partial<Record<DemoEngineRowId, DemoEngineEvidence>> = {};
  const set = (id: DemoEngineRowId, status: DemoEngineEvidence["status"], summary: string, source: string, metrics: DemoEngineEvidence["metrics"] = {}) => {
    evidence[id] = { status, summary, source, checkedAt, metrics };
  };

  // Acquisition: real searches or autopilot finds in the window.
  const runRows = runs.ok ? runs.data ?? [] : [];
  const recentRuns = runRows.filter((row) => Date.parse(row.started_at) >= Date.parse(since));
  const found = recentRuns.reduce((sum, row) => sum + (Number(row.found) || 0), 0);
  const searchCount = countOf(searches);
  if (searchCount === null && !runs.ok) set("acquisition", "unknown", "Search and autopilot history couldn't be read.", "audit_logs, prospect_autopilot_runs");
  else if ((searchCount ?? 0) > 0 || found > 0)
    set("acquisition", "verified", `${searchCount ?? 0} Places searches and ${found} businesses found by autopilot in ${WINDOW_DAYS} days.`, "audit_logs, prospect_autopilot_runs", { searches: searchCount, found });
  else set("acquisition", "configured", `No Places searches or autopilot finds in ${WINDOW_DAYS} days.`, "audit_logs, prospect_autopilot_runs", { searches: searchCount, found });

  // Enrichment: demo markers carrying a verified enrichment result.
  if (!demos.ok) set("enrichment", "unknown", "Demo records couldn't be read.", "website_settings");
  else {
    let total = 0;
    let verified = 0;
    for (const row of demos.data ?? []) {
      const marker = (row.generation as Record<string, unknown> | null)?.["prospectDemo"] as Record<string, unknown> | undefined;
      if (!marker || marker["kind"] !== "prospect_demo") continue;
      total += 1;
      const enrichment = marker["enrichment"] as Record<string, unknown> | undefined;
      if (enrichment && (enrichment["status"] === "verified" || enrichment["emailStatus"] === "verified")) verified += 1;
    }
    if (verified > 0) set("enrichment", "verified", `${verified} of ${total} demos have a verified published email.`, "website_settings.generation", { demos: total, verified });
    else if (total > 0) set("enrichment", "configured", `${total} demos, none with a recorded verified email yet.`, "website_settings.generation", { demos: total, verified });
    else set("enrichment", "unknown", "No prospect demos exist yet.", "website_settings.generation", { demos: 0 });
  }

  // Gate: recorded gate decisions prove it runs before sends.
  const gateCount = countOf(gateSkips);
  if (gateCount === null) set("gate", "unknown", "Outreach history couldn't be read.", "prospect_outreach");
  else if (gateCount > 0) set("gate", "verified", `The quality gate stopped ${gateCount} sends in ${WINDOW_DAYS} days.`, "prospect_outreach", { blocked: gateCount });
  else set("gate", "configured", `The gate is in code; no gate decision was recorded in ${WINDOW_DAYS} days.`, "prospect_outreach", { blocked: 0 });

  // Outreach: delivered sends, failures not dominating.
  const sentCount = countOf(sent);
  const failedCount = countOf(failed);
  if (sentCount === null || failedCount === null) set("outreach", "unknown", "Outreach history couldn't be read.", "prospect_outreach");
  else if (sentCount === 0 && failedCount > 0) set("outreach", "failed", `${failedCount} sends failed and none were delivered in ${WINDOW_DAYS} days.`, "prospect_outreach", { sent: 0, failed: failedCount });
  else if (sentCount > 0 && failedCount > sentCount) set("outreach", "failed", `${failedCount} failed vs ${sentCount} sent in ${WINDOW_DAYS} days.`, "prospect_outreach", { sent: sentCount, failed: failedCount });
  else if (sentCount > 0) set("outreach", "verified", `${sentCount} sent, ${failedCount} failed in ${WINDOW_DAYS} days.`, "prospect_outreach", { sent: sentCount, failed: failedCount });
  else set("outreach", "configured", `Nothing sent in ${WINDOW_DAYS} days.`, "prospect_outreach", { sent: 0, failed: 0 });

  // Inbound: replies stored and handled.
  const inboundCount = countOf(inbound);
  const handledCount = countOf(inboundHandled);
  if (inboundCount === null) set("inbound", "unknown", `Inbound replies couldn't be read (${inbound.ok ? "" : inbound.reason}).`.replace(" ()", ""), "prospect_inbound");
  else if (inboundCount > 0 && (handledCount ?? 0) > 0)
    set("inbound", "verified", `${inboundCount} replies, ${handledCount} handled in ${WINDOW_DAYS} days.`, "prospect_inbound", { replies: inboundCount, handled: handledCount });
  else if (inboundCount > 0) set("inbound", "failed", `${inboundCount} replies in ${WINDOW_DAYS} days, none handled.`, "prospect_inbound", { replies: inboundCount, handled: 0 });
  else set("inbound", "configured", `No replies recorded in ${WINDOW_DAYS} days.`, "prospect_inbound", { replies: 0 });

  // Engagement: preview beacons recorded.
  const eventCount = countOf(events);
  const lastSeen = lastEvent.ok ? lastEvent.data?.[0]?.created_at ?? null : null;
  if (eventCount === null) set("engagement", "unknown", `Preview events couldn't be read (${events.ok ? "" : events.reason}).`.replace(" ()", ""), "prospect_preview_events");
  else if (eventCount > 0) set("engagement", "verified", `${eventCount} preview events in ${WINDOW_DAYS} days.`, "prospect_preview_events", { events: eventCount, lastSeen });
  else set("engagement", "configured", `No preview events in ${WINDOW_DAYS} days.`, "prospect_preview_events", { events: 0, lastSeen });

  // Runtime: the latest scheduled run is recent, finished and error-free.
  const latest = runRows[0];
  if (!runs.ok) set("runtime", "unknown", "Autopilot run history couldn't be read.", "prospect_autopilot_runs");
  else if (!latest) set("runtime", "unknown", "The autopilot has never run.", "prospect_autopilot_runs", { runs: 0 });
  else {
    const started = Date.parse(latest.started_at);
    const metrics = { lastRun: latest.started_at, errors: recentRuns.filter((row) => row.error).length };
    if (!latest.finished_at && now.getTime() - started > RUNTIME_STUCK_MS) set("runtime", "failed", "The latest run never finished (stuck for over an hour).", "prospect_autopilot_runs", metrics);
    else if (latest.error) set("runtime", "failed", `The latest run failed: ${latest.error.slice(0, 120)}`, "prospect_autopilot_runs", metrics);
    else if (now.getTime() - started > RUNTIME_STALE_MS) set("runtime", "unknown", "The latest run is over three hours old (autopilot off or the schedule isn't firing).", "prospect_autopilot_runs", metrics);
    else set("runtime", "verified", "The latest scheduled run is recent and finished without an error.", "prospect_autopilot_runs", metrics);
  }

  return evidence;
}
