/**
 * Durable record of Jarvis diagnostic runs, in the existing ai_tool_audit table.
 *
 * A row is written only after the owner or Jarvis asked for a check; nothing
 * here probes on its own. Rows carry the tool id, outcome category, duration,
 * request id and actor only: never args, targets, queries or output, and no
 * organization (these are platform checks, not tenant data).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type JarvisToolRunStatus = "observed" | "failed" | "unknown" | "needs_verification";

export type JarvisToolRunRecord = {
  toolId: string;
  status: JarvisToolRunStatus;
  /** The result's data.reason, if any; only a short code-like category is kept. */
  reason?: unknown;
  durationMs: number;
  requestId: string;
  userId: string | null;
};

export type JarvisToolLastRun = { at: string; status: JarvisToolRunStatus; reason: string | null; ok: boolean };

const PREFIX = "jarvis:";
const STATUSES = new Set<JarvisToolRunStatus>(["observed", "failed", "unknown", "needs_verification"]);

/** A reason category such as "needs_key" or "pagespeed_http_429"; anything else becomes "other". */
function reasonCategory(reason: unknown): string | null {
  if (reason === undefined || reason === null || reason === "") return null;
  return typeof reason === "string" && /^[a-z0-9_]{1,60}$/.test(reason) ? reason : "other";
}

/** The data.reason of a diagnostic result, when its data is an object. */
export function resultReason(data: unknown): unknown {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)["reason"] : undefined;
}

export async function recordJarvisToolRun(run: JarvisToolRunRecord): Promise<void> {
  try {
    const category = reasonCategory(run.reason);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_tool_audit").insert({
      request_id: run.requestId.slice(0, 80),
      tool: `${PREFIX}${run.toolId}`.slice(0, 120),
      organization_id: null,
      user_id: run.userId,
      // ok means the tool produced evidence (a pass or a finding), not that the page passed.
      ok: run.status === "observed" || run.status === "failed",
      reason: category ? `${run.status}:${category}` : run.status,
      duration_ms: Math.max(0, Math.round(run.durationMs)),
    });
    // Codes only: database messages can echo row details.
    if (error) console.error("[jarvis] tool run record failed", { code: (error as { code?: string }).code ?? "unknown" });
  } catch (error) {
    console.error("[jarvis] tool run record failed", { code: error instanceof Error ? error.name : "unknown" });
  }
}

/** Newest recorded run per Jarvis tool, from the most recent `limit` rows. Throws when the read fails. */
export async function latestJarvisToolRuns(db: SupabaseClient, limit = 300): Promise<Record<string, JarvisToolLastRun>> {
  const { data, error } = await db
    .from("ai_tool_audit")
    .select("tool, ok, reason, created_at")
    .like("tool", `${PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(Math.min(1000, Math.max(1, limit)));
  if (error) throw new Error("tool_runs_unavailable");
  const latest: Record<string, JarvisToolLastRun> = {};
  for (const row of (data ?? []) as { tool?: unknown; ok?: unknown; reason?: unknown; created_at?: unknown }[]) {
    if (typeof row.tool !== "string" || !row.tool.startsWith(PREFIX)) continue;
    const toolId = row.tool.slice(PREFIX.length);
    if (latest[toolId]) continue;
    const [status, category] = typeof row.reason === "string" ? row.reason.split(":", 2) : [];
    latest[toolId] = {
      at: typeof row.created_at === "string" ? row.created_at : "",
      status: STATUSES.has(status as JarvisToolRunStatus) ? (status as JarvisToolRunStatus) : "unknown",
      reason: category ?? null,
      ok: row.ok === true,
    };
  }
  return latest;
}
