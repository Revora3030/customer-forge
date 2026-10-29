import type { SupabaseClient } from "@supabase/supabase-js";
import { agentKeyMatches } from "@/lib/agent-gateway";

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
  return error ? null : (n ?? 0);
};

/** Counts only; no names, emails or customer data. A failed read reports null, never 0. */
export async function agentHealth(db: SupabaseClient, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const [activeBuilds, failedBuilds24h, leadsAwaitingReview, errors24h] = await Promise.all([
    count(db.from("generation_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"])),
    count(db.from("generation_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since)),
    count(db.from("prospect_import_queue").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(db.from("error_events").select("id", { count: "exact", head: true }).gte("created_at", since)),
  ]);
  return {
    checkedAt: now.toISOString(),
    activeBuilds,
    failedBuilds24h,
    leadsAwaitingReview,
    errors24h,
    note: "null means that number could not be read",
  };
}
