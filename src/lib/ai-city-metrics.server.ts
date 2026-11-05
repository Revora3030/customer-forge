import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildSuccess, failuresByCause, paidSpend, type CityMetrics, type JobOutcome, type SpendRow } from "./ai-city-metrics";

const WINDOW_DAYS = 7;

export async function collectCityMetrics(db: SupabaseClient<Database>, now = Date.now()): Promise<CityMetrics> {
  const since = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const safe = async <T,>(q: () => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>, pick: (r: { data: unknown; count?: number | null }) => T | null): Promise<T | null> => {
    try { const r = await q(); return r.error ? null : pick(r); } catch { return null; }
  };
  const [queued, outcomes, spend] = await Promise.all([
    safe(() => db.from("generation_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"), r => (typeof r.count === "number" ? r.count : null)),
    safe(() => db.from("generation_jobs").select("status,failure_kind").in("status", ["completed", "failed"]).gte("updated_at", since).limit(10000), r => (Array.isArray(r.data) ? (r.data as JobOutcome[]) : null)),
    safe(() => db.from("ai_paid_spend_reservations").select("actual_microcents,estimate_microcents,settled_at").gte("created_at", dayStart.toISOString()).limit(10000), r => (Array.isArray(r.data) ? (r.data as SpendRow[]) : null)),
  ]);
  const { paidDailyCapMicrocents } = await import("./ai/paid-budget.server");
  const { MICROCENTS_PER_DOLLAR } = await import("./ai/luna.server");
  return {
    checkedAt: new Date(now).toISOString(),
    queuedBuilds: queued,
    success: buildSuccess(outcomes, WINDOW_DAYS),
    failuresByCause: failuresByCause(outcomes),
    paidSpend: paidSpend(spend, paidDailyCapMicrocents(), MICROCENTS_PER_DOLLAR, dayStart.toISOString().slice(0, 10)),
  };
}
