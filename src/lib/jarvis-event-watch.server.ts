/**
 * Event-driven nudges for Jarvis. Each pass looks for platform events (today:
 * site builds that failed in the last day) and, per the cooldown rules in
 * cognition/event-rules, posts a plain notice into every super admin's Jarvis
 * chat with a suggested question. No model runs and nothing is changed: the
 * owner decides whether to ask Jarvis to look into it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_EVENT_RULES, planEventResponses, type PlatformEvent } from "@/lib/cognition/event-rules";

type Db = Pick<SupabaseClient, "from">;

const DAY = 86_400_000;
const MARKER = /\[event:([a-z0-9-]+)\|([^\]]{1,120})\]/;

export function eventMarker(ruleId: string, subject: string): string {
  return `[event:${ruleId}|${subject.replace(/[\]\n]/g, " ").slice(0, 120)}]`;
}

/** ruleId|subject -> when it was last posted, read back from the owner's own earlier notices. */
export function lastProposedFrom(rows: readonly { content: string; created_at: string }[]): Record<string, number> {
  const last: Record<string, number> = {};
  for (const row of rows) {
    const match = MARKER.exec(row.content);
    const at = Date.parse(row.created_at);
    if (!match || !Number.isFinite(at)) continue;
    const key = `${match[1]}|${match[2]}`;
    if (last[key] === undefined || at > last[key]) last[key] = at;
  }
  return last;
}

export type EventWatchRun = { events: number; users: number; posted: number; failed: number };

export async function runJarvisEventWatch(db: Db, now = Date.now()): Promise<EventWatchRun> {
  const run: EventWatchRun = { events: 0, users: 0, posted: 0, failed: 0 };
  const { data: jobs, error } = await db
    .from("generation_jobs")
    .select("id, organization_id, updated_at, failed_stage")
    .eq("status", "failed")
    .gte("updated_at", new Date(now - DAY).toISOString())
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`generation_jobs: ${error.message}`);
  if (!jobs?.length) return run;

  const orgIds = [...new Set(jobs.map((job) => job.organization_id as string))];
  const { data: orgs } = await db.from("organizations").select("id, name").in("id", orgIds);
  const names = new Map((orgs ?? []).map((org) => [org.id as string, String(org.name ?? "a workspace")]));
  const events: PlatformEvent[] = jobs.map((job) => ({
    id: String(job.id),
    type: "build.failed",
    occurredAt: Date.parse(String(job.updated_at)),
    subject: names.get(job.organization_id as string) ?? "a workspace",
  }));
  run.events = events.length;

  const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "super_admin");
  const userIds = [...new Set((admins ?? []).map((row) => String(row.user_id)))];
  run.users = userIds.length;

  for (const userId of userIds) {
    const { data: earlier } = await db
      .from("jarvis_messages")
      .select("content, created_at")
      .eq("user_id", userId)
      .eq("role", "assistant")
      .ilike("content", "%[event:%")
      .gte("created_at", new Date(now - 7 * DAY).toISOString())
      .limit(500);
    const { proposals } = planEventResponses({ events, rules: DEFAULT_EVENT_RULES, lastProposed: lastProposedFrom((earlier ?? []) as never[]), now });
    for (const proposal of proposals) {
      const content = `Heads up ${eventMarker(proposal.ruleId, proposal.subject)}\n\nA site build for ${proposal.subject} failed in the last day. I haven't looked into it yet and nothing was changed. If you want me to, ask: “${proposal.prompt}”`;
      const { error: postError } = await db.from("jarvis_messages").insert({ user_id: userId, role: "assistant", content });
      if (postError) run.failed += 1;
      else run.posted += 1;
    }
  }
  return run;
}
