import type { SupabaseClient } from "@supabase/supabase-js";
import { agentKeyMatches, publicBuildStatus, UUID } from "@/lib/agent-gateway";
import { pendingActionRequestCount } from "@/lib/agent-action-requests.server";

/** Returns a 401 Response unless the request carries the REVORA_AGENT_API_KEY. */
export function denyUnlessAgent(request: Request): Response | null {
  const expected = process.env["REVORA_AGENT_API_KEY"];
  if (!expected) return Response.json({ error: "Agent gateway is not configured." }, { status: 503 });
  const presented = request.headers.get("x-revora-agent-key");
  return agentKeyMatches(presented, expected) ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** Leads imported by the bot are recorded against the platform owner (first super-admin). */
export async function ownerActorId(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.from("user_roles").select("user_id").eq("role", "super_admin").order("user_id").limit(1).maybeSingle();
  if (error) throw new Error("Couldn't read the owner account.");
  return data ? String(data.user_id) : null;
}

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> => {
  const { count: n, error } = await q;
  // A read that returns no number and no error still couldn't be read.
  return error || n === null ? null : n;
};

/** Counts only; no names, emails or customer data. A failed read reports null, never 0. */
export async function agentHealth(db: SupabaseClient, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [activeBuilds, failedBuilds24h, leadsAwaitingReview, errors24h, approvalsWaiting] = await Promise.all([
    count(db.from("generation_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"])),
    count(db.from("generation_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since)),
    count(db.from("prospect_import_queue").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(db.from("error_events").select("id", { count: "exact", head: true }).gte("created_at", since)),
    pendingActionRequestCount(db, now.getTime()),
  ]);
  return {
    checkedAt: now.toISOString(),
    activeBuilds,
    failedBuilds24h,
    leadsAwaitingReview,
    errors24h,
    approvalsWaiting,
    note: "null means that number could not be read",
  };
}

const BUILD_COLUMNS =
  "id, organization_id, status, progress, current_step, failed_stage, failure_kind, error_message, wait_reason, resumes_at, attempts, capacity_deferrals, stage_checkpoints, created_at, started_at, updated_at, completed_at";

/** One build's progress and stage. Never returns site content or customer details. */
export async function agentBuild(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) return null;
  const { data, error } = await db.from("generation_jobs").select(BUILD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("Couldn't read that build.");
  return data ? publicBuildStatus(data as Record<string, unknown>) : null;
}

const LIST_STATUSES = new Set(["queued", "processing", "completed", "failed", "cancelled"]);

/** Recent builds, newest first, optionally one status. */
export async function agentBuilds(db: SupabaseClient, input: { status?: string | null; limit?: number }) {
  const limit = Math.min(50, Math.max(1, Math.round(input.limit ?? 20)));
  let query = db.from("generation_jobs").select(BUILD_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (input.status && LIST_STATUSES.has(input.status)) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) throw new Error("Couldn't read builds.");
  return ((data ?? []) as Record<string, unknown>[]).map(publicBuildStatus);
}

/**
 * Platform analytics for the bot: the same numbers the admin dashboard shows
 * (customers, paying, MRR, sessions, conversion). Counts only.
 */
export async function agentAnalytics(days = 30) {
  const { computePlatformMetrics } = await import("@/lib/admin.functions");
  const { computePlatformFunnel } = await import("@/lib/platform-funnel.functions");
  const [metrics, funnel] = await Promise.allSettled([computePlatformMetrics(), computePlatformFunnel(days)]);
  return {
    checkedAt: new Date().toISOString(),
    days,
    platform: metrics.status === "fulfilled" ? metrics.value : null,
    funnel:
      funnel.status === "fulfilled"
        ? { stages: funnel.value.stages, rates: funnel.value.rates, convertedTrials: funnel.value.convertedTrials, errors: funnel.value.errors }
        : null,
    note: "null means that section could not be read; MRR counts live, active, non-cancelling subscriptions only",
  };
}

type Briefing = {
  health: Awaited<ReturnType<typeof agentHealth>>;
  analytics: Awaited<ReturnType<typeof agentAnalytics>> | null;
};

const n = (value: number | null | undefined, one: string, many: string) =>
  value === null || value === undefined ? `an unknown number of ${many}` : `${value} ${value === 1 ? one : many}`;

/** Plain sentences for the 8 AM spoken briefing. The bot adds PRs from its own GitHub access. */
export function briefingText({ health, analytics }: Briefing): string {
  const p = analytics?.platform ?? null;
  const lines = [
    "Good morning. Here is the Revora briefing.",
    `Approvals: ${n(health.approvalsWaiting, "request is", "requests are")} waiting for you.`,
    `Leads: ${n(health.leadsAwaitingReview, "lead is", "leads are")} waiting in the review list.`,
    `Builds: ${n(health.activeBuilds, "build is", "builds are")} running, and ${n(health.failedBuilds24h, "build", "builds")} failed in the last day.`,
    `Errors: ${n(health.errors24h, "error was", "errors were")} logged in the last day.`,
  ];
  if (p) {
    lines.push(`Customers: ${p.clients} in total, ${p.active} paying, ${p.trialing} on trial, and ${p.published} sites published.`);
    lines.push(`Monthly recurring revenue is $${p.mrr.toLocaleString("en-US")}.`);
  } else lines.push("Revenue numbers could not be read this morning.");
  return lines.join(" ");
}
