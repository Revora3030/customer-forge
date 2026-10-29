/**
 * Event-driven nudges for Jarvis. Each pass collects platform events (failed
 * builds, failed release CI, routines that did not finish, failed payments, sites that did not load, unanswered
 * Revora leads, trials about to end) and,
 * per the cooldown rules in cognition/event-rules, posts a plain notice into
 * every super admin's Jarvis chat with a suggested question. No model runs and
 * nothing is changed, retried or sent to anyone: the owner decides whether to
 * ask Jarvis to look into it. A source that cannot be read is reported by name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectEvents, type EventSource } from "@/lib/cognition/event-emitter";
import { DEFAULT_EVENT_RULES, planEventResponses } from "@/lib/cognition/event-rules";
import { buildFailedSource, ciFailedSource, leadUnansweredSource, paymentFailedSource, routineFailedSource, siteDownSource, trialExpiringSource } from "@/lib/event-sources.server";

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

export type EventWatchRun = { events: number; users: number; posted: number; failed: number; failedSources: string[] };

export async function runJarvisEventWatch(db: Db, now = Date.now(), sources: readonly EventSource[] = defaultSources(db)): Promise<EventWatchRun> {
  const run: EventWatchRun = { events: 0, users: 0, posted: 0, failed: 0, failedSources: [] };
  const collected = await collectEvents(sources, now);
  run.events = collected.events.length;
  run.failedSources = collected.failedSources;
  if (!collected.events.length) return run;

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
    const { proposals } = planEventResponses({ events: collected.events, rules: DEFAULT_EVENT_RULES, lastProposed: lastProposedFrom((earlier ?? []) as never[]), now });
    for (const proposal of proposals) {
      const content = `Heads up ${eventMarker(proposal.ruleId, proposal.subject)}\n\n${proposal.summary}\n\nNothing was changed or sent. Send this to Jarvis to open the recovery: “${proposal.prompt}”`;
      const { error: postError } = await db.from("jarvis_messages").insert({ user_id: userId, role: "assistant", content });
      if (postError) run.failed += 1;
      else run.posted += 1;
    }
  }
  return run;
}

function defaultSources(db: Db): EventSource[] {
  return [buildFailedSource(db), ciFailedSource(), routineFailedSource(db), paymentFailedSource(db), siteDownSource(db), leadUnansweredSource(db), trialExpiringSource(db)];
}
