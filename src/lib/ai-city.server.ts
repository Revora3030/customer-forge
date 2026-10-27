import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CitySnapshot, CitySource, CityWork } from "./ai-city";
import { summarize } from "./jarvis-events";

export async function collectCitySnapshot(db: SupabaseClient<Database>, userId: string): Promise<CitySnapshot> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const limit = 100;
  async function source(query: PromiseLike<{ data: unknown; error: unknown; count?: number | null }>, map: (row: Record<string, unknown>) => CityWork): Promise<CitySource> {
    try {
      const result = await query;
      if (result.error || !Array.isArray(result.data)) return { available: false, rows: [], total: null, truncated: false };
      return { available: true, rows: result.data.map(map), total: result.count ?? result.data.length, truncated: (result.count ?? result.data.length) > result.data.length || result.data.length === limit };
    } catch { return { available: false, rows: [], total: null, truncated: false }; }
  }
  const text = (r: Record<string, unknown>, key: string) => summarize(r[key], 180) ?? "";
  const base = (r: Record<string, unknown>, district: CityWork["district"], table: string, title: string): CityWork => ({ id: `${table}:${text(r, "id")}`, district, source: table, title, status: text(r, "status") || "recorded", at: text(r, "updated_at") || text(r, "created_at"), ...(typeof r["organization_id"] === "string" ? { organizationId: r["organization_id"] } : {}) });
  const [jobs, events, routines, traces, images, approvals, automations, errors, memories] = await Promise.all([
    source(db.from("generation_jobs").select("id,organization_id,status,current_step,progress,updated_at,wait_reason,resumes_at", { count: "exact" }).in("status", ["queued", "running", "waiting", "retrying", "failed"]).order("updated_at", { ascending: false }).limit(limit), r => ({ ...base(r, "factory", "generation_jobs", text(r, "current_step") || "Website build"), progress: Number(r["progress"]) || 0, detail: text(r, "wait_reason") || (r["resumes_at"] ? `Retry: ${text(r, "resumes_at")}` : null) })),
    source(db.from("jarvis_run_events").select("id,run_id,status,label,model,provider,created_at,output_summary,tool_id").eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(limit), r => ({ ...base(r, "executive", "jarvis_run_events", text(r, "label") || text(r, "tool_id") || "Jarvis work"), runId: text(r, "run_id"), model: r["provider"] === "lovable" ? text(r, "model") : null, detail: text(r, "output_summary") })),
    source(db.from("jarvis_routines").select("id,name,enabled,last_status,last_run_at,created_at,hour,minute,frequency").eq("user_id", userId).order("created_at").limit(limit), r => ({ ...base(r, "executive", "jarvis_routines", text(r, "name")), status: r["enabled"] ? text(r, "last_status") || "scheduled" : "paused", at: text(r, "last_run_at") || text(r, "created_at"), detail: `${text(r, "frequency")} · ${String(r["hour"]).padStart(2, "0")}:${String(r["minute"]).padStart(2, "0")} Eastern` })),
    source(db.from("ai_team_trace").select("id,stage,model,ok,created_at,organization_id").eq("provider", "lovable").gte("created_at", since).order("created_at", { ascending: false }).limit(limit), r => ({ ...base(r, "institute", "ai_team_trace", text(r, "stage")), status: r["ok"] === true ? "ok" : "failed", model: text(r, "model") })),
    source(db.from("image_records").select("id,organization_id,slot,status,updated_at,model,provider", { count: "exact" }).eq("status", "pending").order("updated_at", { ascending: false }).limit(limit), r => ({ ...base(r, "creative", "image_records", text(r, "slot") || "Image review"), model: r["provider"] === "lovable" ? text(r, "model") : null })),
    source(db.from("approval_queue").select("id,summary,status,created_at,module,executed_at", { count: "exact" }).eq("status", "pending").order("created_at", { ascending: false }).limit(limit), r => ({ ...base(r, "growth", "approval_queue", text(r, "summary")), detail: text(r, "module") })),
    source(db.from("automation_runs").select("id,organization_id,action_type,status,created_at,scheduled_for", { count: "exact" }).in("status", ["pending", "running", "failed"]).order("created_at", { ascending: false }).limit(limit), r => ({ ...base(r, "growth", "automation_runs", text(r, "action_type")), detail: `Scheduled: ${text(r, "scheduled_for")}` })),
    source(db.from("error_events").select("id,message,created_at", { count: "exact" }).gte("created_at", since).order("created_at", { ascending: false }).limit(limit), r => ({ ...base(r, "security", "error_events", summarize(r["message"], 120) || "Recorded error"), status: "error" })),
    source(db.from("jarvis_memories").select("id,kind,source,updated_at", { count: "exact" }).eq("user_id", userId).order("updated_at", { ascending: false }).limit(limit), r => ({ ...base(r, "knowledge", "jarvis_memories", text(r, "kind") || "Saved memory"), detail: text(r, "source") })),
  ]);
  return { checkedAt: new Date().toISOString(), sources: { jobs, events, routines, traces, images, approvals, automations, errors, memories } };
}