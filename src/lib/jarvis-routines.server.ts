import type { SupabaseClient } from "@supabase/supabase-js";

export type JarvisRoutine = {
  id: string;
  user_id: string;
  name: string;
  prompt: string;
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_summary: string | null;
  created_at: string;
};

export type RoutineInput = {
  name: string;
  prompt: string;
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
};

const MAX_ROUTINES = 20;
const MAX_NAME = 80;
const MAX_PROMPT = 2000;
/** Routines run per cron pass, so one pass cannot run an unbounded number. */
const MAX_RUNS_PER_PASS = 3;
/** Times are stored in the owner's timezone (America/New_York). */
const OWNER_TZ = "America/New_York";

export function parseRoutineInput(value: unknown): RoutineInput {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const name = typeof raw["name"] === "string" ? raw["name"].trim().slice(0, MAX_NAME) : "";
  if (name.length < 3) throw new Error("Give the routine a short name.");
  const prompt = typeof raw["prompt"] === "string" ? raw["prompt"].trim().slice(0, MAX_PROMPT) : "";
  if (prompt.length < 10) throw new Error("Describe what the routine should do in a sentence.");
  const frequency = raw["frequency"] === "weekly" ? "weekly" : "daily";
  const hour = Math.min(23, Math.max(0, Math.floor(Number(raw["hour"]) || 0)));
  const minute = Math.min(59, Math.max(0, Math.floor(Number(raw["minute"]) || 0)));
  return { name, prompt, frequency, hour, minute };
}

export async function listJarvisRoutines(db: SupabaseClient, userId: string): Promise<JarvisRoutine[]> {
  const { data, error } = await db
    .from("jarvis_routines")
    .select("id,user_id,name,prompt,frequency,hour,minute,enabled,last_run_at,last_status,last_summary,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(MAX_ROUTINES);
  if (error) throw new Error("Couldn't load the routines.");
  return (data ?? []) as JarvisRoutine[];
}

export async function createJarvisRoutine(db: SupabaseClient, userId: string, input: RoutineInput) {
  const count = await db.from("jarvis_routines").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (!count.error && (count.count ?? 0) >= MAX_ROUTINES) throw new Error(`Jarvis keeps at most ${MAX_ROUTINES} routines. Delete one first.`);
  const { data, error } = await db.from("jarvis_routines").insert({ user_id: userId, ...input }).select("id").single();
  if (error) throw new Error("Couldn't save that routine.");
  return { id: String(data.id) };
}

export async function updateJarvisRoutine(
  db: SupabaseClient,
  userId: string,
  routineId: string,
  patch: Partial<RoutineInput> & { enabled?: boolean },
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update["name"] = patch.name;
  if (patch.prompt !== undefined) update["prompt"] = patch.prompt;
  if (patch.frequency !== undefined) update["frequency"] = patch.frequency;
  if (patch.hour !== undefined) update["hour"] = patch.hour;
  if (patch.minute !== undefined) update["minute"] = patch.minute;
  if (patch.enabled !== undefined) update["enabled"] = patch.enabled;
  const { data, error } = await db.from("jarvis_routines").update(update).eq("id", routineId).eq("user_id", userId).select("id");
  if (error) throw new Error("Couldn't update that routine.");
  if (!data?.length) throw new Error("That routine was not found.");
  return { updated: true };
}

export async function deleteJarvisRoutine(db: SupabaseClient, userId: string, routineId: string) {
  const { data, error } = await db.from("jarvis_routines").delete().eq("id", routineId).eq("user_id", userId).select("id");
  if (error) throw new Error("Couldn't delete that routine.");
  if (!data?.length) throw new Error("That routine was not found.");
  return { deleted: true };
}

function ownerLocalParts(now: Date): { date: string; minutes: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OWNER_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  };
}

function lastRunLocalDate(lastRunAt: string | null): string | null {
  if (!lastRunAt) return null;
  const parsed = new Date(lastRunAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return ownerLocalParts(parsed).date;
}

/** A routine is due once per scheduled day (weekly: Mondays) after its local time. */
export function routineIsDue(routine: Pick<JarvisRoutine, "frequency" | "hour" | "minute" | "last_run_at">, now = new Date()): boolean {
  const local = ownerLocalParts(now);
  if (routine.frequency === "weekly" && local.day !== 1) return false;
  if (local.minutes < routine.hour * 60 + routine.minute) return false;
  return lastRunLocalDate(routine.last_run_at) !== local.date;
}

/**
 * Runs due routines as their owner: each posts its prompt into the owner's
 * Jarvis chat and runs the normal Jarvis loop, so approvals and safety rules
 * are unchanged. AI spend goes through the same router and caps as chat.
 */
async function executeRoutine(db: SupabaseClient, routine: JarvisRoutine): Promise<string> {
  const inserted = await db.from("jarvis_messages").insert({ user_id: routine.user_id, role: "user", content: `[Routine: ${routine.name}] ${routine.prompt}` });
  if (inserted.error) throw new Error(inserted.error.message);
  const { runJarvis } = await import("./jarvis.functions");
  const { reply } = await runJarvis(db, routine.user_id, "balanced");
  const { splitReplyMeta } = await import("./jarvis-actions");
  return splitReplyMeta(reply).body.slice(0, 400);
}

export async function runDueJarvisRoutines(db: SupabaseClient, now = new Date(), execute = executeRoutine) {
  const { data, error } = await db
    .from("jarvis_routines")
    .select("id,user_id,name,prompt,frequency,hour,minute,enabled,last_run_at,last_status")
    .eq("enabled", true)
    .limit(200);
  if (error) throw new Error(error.message);
  // A stranded running attempt is uncertain, not permission to spend again.
  const due = ((data ?? []) as JarvisRoutine[]).filter((routine) => routine.last_status !== "running" && routineIsDue(routine, now)).slice(0, MAX_RUNS_PER_PASS);
  const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
  for (const routine of due) {
    const attempt = `Routine attempt ${crypto.randomUUID()}; completion not yet confirmed.`;
    let claim = db.from("jarvis_routines")
      .update({ last_run_at: now.toISOString(), last_status: "running", last_summary: attempt, updated_at: now.toISOString() })
      .eq("id", routine.id).eq("user_id", routine.user_id).eq("enabled", true)
      .eq("name", routine.name).eq("prompt", routine.prompt).eq("frequency", routine.frequency)
      .eq("hour", routine.hour).eq("minute", routine.minute);
    claim = routine.last_run_at === null ? claim.is("last_run_at", null) : claim.eq("last_run_at", routine.last_run_at);
    claim = routine.last_status === null ? claim.is("last_status", null) : claim.eq("last_status", routine.last_status);
    const claimed = await claim.select("id");
    if (claimed.error) throw new Error("Couldn't confirm routine claim; no work dispatched.");
    if (!claimed.data?.length) continue;
    if (claimed.data.length !== 1 || claimed.data[0]?.id !== routine.id) throw new Error("Couldn't verify routine claim identity; no work dispatched.");
    let ok = true;
    let summary: string;
    try {
      summary = (await execute(db, routine)).slice(0, 400);
    } catch (routineError) {
      ok = false;
      summary = routineError instanceof Error ? routineError.message.slice(0, 300) : "failed";
    }
    // Never turn a failed settlement into a second execution or an unfenced error write.
    const settled = await db.from("jarvis_routines")
      .update({ last_status: ok ? "ok" : "error", last_summary: summary, updated_at: new Date().toISOString() })
      .eq("id", routine.id).eq("user_id", routine.user_id)
      .eq("last_run_at", now.toISOString()).eq("last_status", "running").eq("last_summary", attempt).select("id");
    if (settled.error || settled.data?.length !== 1 || settled.data[0]?.id !== routine.id) {
      results.push({ id: routine.id, name: routine.name, ok: false, detail: "Completion unconfirmed; review the recorded attempt before resuming this routine." });
      continue;
    }
    results.push({ id: routine.id, name: routine.name, ok, detail: summary.slice(0, 120) });
  }
  return { ran: results.length, results };
}
