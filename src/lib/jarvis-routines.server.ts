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
/**
 * "JWT issued at future" is the database gateway seeing the caller's token a
 * moment before its own clock reaches the token's issue time (clock skew). It
 * clears within a second or two, so it is retried once instead of failing the
 * whole cron pass.
 */
export const TRANSIENT_CLOCK_SKEW = /issued at (?:a )?future/i;
const CLOCK_SKEW_RETRY_MS = 1_500;

export async function runDueJarvisRoutines(
  db: SupabaseClient,
  now = new Date(),
  options: { retryDelayMs?: number } = {},
) {
  const loadEnabled = () =>
    db
      .from("jarvis_routines")
      .select("id,user_id,name,prompt,frequency,hour,minute,enabled,last_run_at")
      .eq("enabled", true)
      .limit(200);
  let { data, error } = await loadEnabled();
  if (error && TRANSIENT_CLOCK_SKEW.test(error.message ?? "")) {
    await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? CLOCK_SKEW_RETRY_MS));
    ({ data, error } = await loadEnabled());
  }
  if (error) throw new Error(error.message);
  const due = ((data ?? []) as JarvisRoutine[]).filter((routine) => routineIsDue(routine, now)).slice(0, MAX_RUNS_PER_PASS);
  const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
  for (const routine of due) {
    const userId = String(routine.user_id);
    try {
      const marker = `[Routine: ${routine.name}] ${routine.prompt}`;
      const inserted = await db.from("jarvis_messages").insert({ user_id: userId, role: "user", content: marker });
      if (inserted.error) throw new Error(inserted.error.message);
      const { runJarvis } = await import("./jarvis.functions");
      const { reply } = await runJarvis(db, userId, "balanced");
      const { splitReplyMeta } = await import("./jarvis-actions");
      const summary = splitReplyMeta(reply).body.slice(0, 400);
      await db
        .from("jarvis_routines")
        .update({ last_run_at: now.toISOString(), last_status: "ok", last_summary: summary, updated_at: now.toISOString() })
        .eq("id", routine.id);
      results.push({ id: String(routine.id), name: routine.name, ok: true, detail: summary.slice(0, 120) });
    } catch (routineError) {
      const detail = routineError instanceof Error ? routineError.message.slice(0, 300) : "failed";
      await db
        .from("jarvis_routines")
        .update({ last_run_at: now.toISOString(), last_status: "error", last_summary: detail, updated_at: now.toISOString() })
        .eq("id", routine.id);
      results.push({ id: String(routine.id), name: routine.name, ok: false, detail });
    }
  }
  return { ran: results.length, results };
}
