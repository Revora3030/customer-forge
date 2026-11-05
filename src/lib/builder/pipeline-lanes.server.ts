import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildSuccess, type JobOutcome } from "@/lib/ai-city-metrics";
import { GENERATION_STEPS } from "@/lib/site-engine";
import { ACTIVE_STATUSES, buildLanes, type LaneJob, type PipelineLanes, type Tier, type TraceRow } from "./pipeline-lanes";

const WINDOW_DAYS = 7;
const STOPPED_WINDOW_MS = 24 * 3_600_000;
const LANE_LIMIT = 30;

/** Read-only. A query that fails yields null and the board says so instead of showing zero. */
export async function collectPipelineLanes(db: SupabaseClient<Database>, now = Date.now()): Promise<PipelineLanes> {
  const safe = async <T,>(q: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> => {
    try { const r = await q(); return r.error || !Array.isArray(r.data) ? null : (r.data as T); } catch { return null; }
  };
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const [rawJobs, outcomes] = await Promise.all([
    safe<LaneJob[]>(() => db.from("generation_jobs")
      .select("id,organization_id,status,current_step,failed_stage,failure_kind,wait_reason,resumes_at,started_at,created_at,updated_at,lease_expires_at,attempts,stage_checkpoints")
      .in("status", [...ACTIVE_STATUSES]).order("updated_at", { ascending: false }).limit(200)),
    safe<JobOutcome[]>(() => db.from("generation_jobs").select("status,failure_kind").in("status", ["completed", "failed"]).gte("updated_at", since).limit(10000)),
  ]);
  // Failed and parked jobs stay on the board for 24 hours, so a recent stop with a saved resume point is visible.
  const jobs = rawJobs === null ? null : rawJobs.filter((j) => (j.status !== "failed" && j.status !== "parked") || now - Date.parse(j.updated_at) <= STOPPED_WINDOW_MS).slice(0, LANE_LIMIT);
  const orgIds = [...new Set((jobs ?? []).map((j) => j.organization_id))];
  const earliest = (jobs ?? []).reduce((min, j) => Math.min(min, Date.parse(j.started_at ?? j.created_at) || now), now);
  const [orgs, trace] = orgIds.length
    ? await Promise.all([
      safe<{ id: string; name: string }[]>(() => db.from("organizations").select("id,name").in("id", orgIds)),
      safe<TraceRow[]>(() => db.from("ai_team_trace").select("organization_id,model,stage,created_at").in("organization_id", orgIds).gte("created_at", new Date(earliest).toISOString()).order("created_at", { ascending: false }).limit(2000)),
    ])
    : [[], []];
  const { tierModel } = await import("@/lib/ai/luna.server");
  const byModel = new Map<string, Tier>();
  for (const tier of ["sol", "terra", "luna"] as const) { const m = tierModel(tier); if (m && !byModel.has(m)) byModel.set(m, tier); }
  return buildLanes({
    jobs,
    names: orgs ? new Map(orgs.map((o) => [o.id, o.name])) : null,
    trace,
    steps: GENERATION_STEPS,
    tierOfModel: (model) => byModel.get(model) ?? byModel.get(model.split("/").pop() ?? model) ?? null,
    success: buildSuccess(outcomes, WINDOW_DAYS),
    now,
  });
}
