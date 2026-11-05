import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildScoreboard, recentSitesFromJobs, type GateScoreboard, type ScoreRow } from "./gate-scoreboard";

const WINDOW_DAYS = 14;
const SITE_LIMIT = 20;

/** Read-only. Any query that fails yields null, which the board shows as unavailable / NOT_VERIFIED. */
export async function collectGateScoreboard(db: SupabaseClient<Database>, now = Date.now()): Promise<GateScoreboard> {
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const safe = async <T,>(q: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> => {
    try { const r = await q(); return r.error || !Array.isArray(r.data) ? null : (r.data as T); } catch { return null; }
  };
  const jobs = await safe<{ organization_id: string; updated_at: string }[]>(() =>
    db.from("generation_jobs").select("organization_id,updated_at").gte("updated_at", since).order("updated_at", { ascending: false }).limit(500));
  const ids = [...new Set((jobs ?? []).map((j) => j.organization_id))].slice(0, SITE_LIMIT);
  const [orgs, rows] = ids.length
    ? await Promise.all([
      safe<{ id: string; name: string }[]>(() => db.from("organizations").select("id,name").in("id", ids)),
      safe<ScoreRow[]>(() => db.from("builder_quality_log").select("organization_id,event_kind,score,bar,passed,gate_mode,failures,created_at")
        .in("organization_id", ids).in("event_kind", ["build_score", "publish_check"]).order("created_at", { ascending: false }).limit(1000)),
    ])
    : [[], await safe<ScoreRow[]>(() => db.from("builder_quality_log").select("organization_id,event_kind,score,bar,passed,gate_mode,failures,created_at").limit(0))];
  const names = orgs ? new Map(orgs.map((o) => [o.id, o.name])) : null;
  return buildScoreboard({ sites: recentSitesFromJobs(jobs, names, SITE_LIMIT), rows, now });
}
