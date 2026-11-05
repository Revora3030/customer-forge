/**
 * Owner routines, server side (PAI-17).
 *
 * A routine is a saved schedule that starts an agent run (PAI-2) for a
 * workspace. Routines cannot send anything: the run they create carries a send
 * policy of `no_external_actions` or `approval_required` (set in SQL from the
 * preset), so any outside message still waits for the owner's approval.
 * Presets use fixed server-side wording, so the model is never handed an
 * owner-written instruction by accident.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextRunAfter, validateSchedule, type RoutineFrequency, type RoutineSchedule } from "./routine-schedule";

export const MAX_ROUTINES_PER_ORG = 5;

export type RoutinePreset = "weekly_digest" | "review_asks" | "site_refresh" | "custom";
export type SendPolicy = "no_external_actions" | "approval_required";

export const ROUTINE_PRESETS: Record<Exclude<RoutinePreset, "custom">, { label: string; goal: string; sendPolicy: SendPolicy; schedule: RoutineSchedule }> = {
  weekly_digest: {
    label: "Weekly digest",
    goal: "Write an internal weekly summary for the owner: new leads, replies waiting, bookings and the site's status. Report only numbers you read from the workspace with your tools, and say plainly when something could not be checked. Do not contact anyone.",
    sendPolicy: "no_external_actions",
    schedule: { frequency: "weekly", weekday: 1, hour: 8, minute: 0 },
  },
  review_asks: {
    label: "Ask for reviews",
    goal: "Find recent customers who could be asked for a review and prepare a review request for each. Prepare drafts only: nothing is sent until the owner approves each one.",
    sendPolicy: "approval_required",
    schedule: { frequency: "weekly", weekday: 5, hour: 10, minute: 0 },
  },
  site_refresh: {
    label: "Site refresh ideas",
    goal: "Look over the owner's website for out-of-date or thin content and write proposed changes for the owner to review. Propose only: do not change or publish the site.",
    sendPolicy: "no_external_actions",
    schedule: { frequency: "monthly", monthDay: 1, hour: 9, minute: 0 },
  },
};

export type AgentRoutine = {
  id: string;
  organization_id: string;
  created_by: string | null;
  name: string;
  preset: RoutinePreset;
  prompt: string | null;
  frequency: RoutineFrequency;
  weekday: number | null;
  month_day: number | null;
  hour: number;
  minute: number;
  enabled: boolean;
  next_run_at: string;
  claim_token: string | null;
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
};

export type RoutineInput = {
  name: string;
  preset: RoutinePreset;
  prompt?: string | null;
  schedule: RoutineSchedule;
};

export function parseRoutineInput(value: unknown): RoutineInput {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const preset = raw["preset"] as RoutinePreset;
  if (preset !== "custom" && !(preset in ROUTINE_PRESETS)) throw new Error("Pick one of the routine types.");
  const presetDef = preset === "custom" ? null : ROUTINE_PRESETS[preset];
  const name = (typeof raw["name"] === "string" ? raw["name"].trim() : presetDef?.label ?? "").slice(0, 80);
  if (name.length < 3) throw new Error("Give the routine a short name.");
  let prompt: string | null = null;
  if (preset === "custom") {
    prompt = typeof raw["prompt"] === "string" ? raw["prompt"].trim().slice(0, 2000) : "";
    if (prompt.length < 10) throw new Error("Describe what the routine should do in a sentence.");
  }
  const rawSchedule = raw["schedule"] && typeof raw["schedule"] === "object" ? (raw["schedule"] as Record<string, unknown>) : null;
  const schedule: RoutineSchedule = rawSchedule
    ? {
        frequency: rawSchedule["frequency"] as RoutineFrequency,
        weekday: rawSchedule["weekday"] === undefined || rawSchedule["weekday"] === null ? null : Number(rawSchedule["weekday"]),
        monthDay: rawSchedule["monthDay"] === undefined || rawSchedule["monthDay"] === null ? null : Number(rawSchedule["monthDay"]),
        hour: Number(rawSchedule["hour"]),
        minute: Number(rawSchedule["minute"]),
      }
    : presetDef?.schedule ?? { frequency: "daily", hour: 9, minute: 0 };
  const problem = validateSchedule(schedule);
  if (problem) throw new Error(problem);
  return { name, preset, prompt, schedule };
}

/** What the run is asked to do. Presets use fixed wording; custom routines add a guard line. */
export function routineGoal(routine: Pick<AgentRoutine, "preset" | "prompt">): string {
  if (routine.preset !== "custom") return ROUTINE_PRESETS[routine.preset].goal;
  return `${(routine.prompt ?? "").trim()}\n\nThis is a scheduled routine: prepare drafts and proposals only. Anything that would be sent outside the business waits for the owner's approval.`;
}

function scheduleOf(r: Pick<AgentRoutine, "frequency" | "weekday" | "month_day" | "hour" | "minute">): RoutineSchedule {
  return { frequency: r.frequency, weekday: r.weekday, monthDay: r.month_day, hour: r.hour, minute: r.minute };
}

// ---- Owner-facing storage (callers have already checked the user belongs to the workspace) ----

export async function listAgentRoutines(db: SupabaseClient, organizationId: string): Promise<AgentRoutine[]> {
  const { data, error } = await db.from("agent_routines").select("*").eq("organization_id", organizationId).order("created_at", { ascending: true }).limit(MAX_ROUTINES_PER_ORG);
  if (error) throw new Error("Couldn't load the routines.");
  return (data ?? []) as AgentRoutine[];
}

export async function createAgentRoutine(db: SupabaseClient, organizationId: string, userId: string, input: RoutineInput, now = new Date()) {
  const { data, error } = await db
    .from("agent_routines")
    .insert({
      organization_id: organizationId, created_by: userId, name: input.name, preset: input.preset, prompt: input.prompt ?? null,
      frequency: input.schedule.frequency, weekday: input.schedule.weekday ?? null, month_day: input.schedule.monthDay ?? null,
      hour: input.schedule.hour, minute: input.schedule.minute, next_run_at: nextRunAfter(input.schedule, now).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (/routine_limit/.test(error.message)) throw new Error(`A workspace can have at most ${MAX_ROUTINES_PER_ORG} routines. Delete one first.`);
    throw new Error("Couldn't save that routine.");
  }
  return { id: String(data.id) };
}

export async function updateAgentRoutine(
  db: SupabaseClient, organizationId: string, routineId: string,
  patch: { name?: string; enabled?: boolean; schedule?: RoutineSchedule }, now = new Date(),
) {
  const update: Record<string, unknown> = { updated_at: now.toISOString() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 80);
    if (name.length < 3) throw new Error("Give the routine a short name.");
    update["name"] = name;
  }
  let schedule = patch.schedule;
  if (schedule) {
    const problem = validateSchedule(schedule);
    if (problem) throw new Error(problem);
    Object.assign(update, { frequency: schedule.frequency, weekday: schedule.weekday ?? null, month_day: schedule.monthDay ?? null, hour: schedule.hour, minute: schedule.minute });
  }
  if (patch.enabled !== undefined) update["enabled"] = patch.enabled;
  // Re-enabling or rescheduling starts from now: a routine paused for a month does not fire the backlog.
  if (schedule || patch.enabled === true) {
    if (!schedule) {
      const current = await db.from("agent_routines").select("frequency,weekday,month_day,hour,minute").eq("id", routineId).eq("organization_id", organizationId).maybeSingle();
      if (current.error || !current.data) throw new Error("That routine was not found.");
      schedule = scheduleOf(current.data as AgentRoutine);
    }
    update["next_run_at"] = nextRunAfter(schedule, now).toISOString();
  }
  const { data, error } = await db.from("agent_routines").update(update).eq("id", routineId).eq("organization_id", organizationId).select("id");
  if (error) throw new Error("Couldn't update that routine.");
  if (!data?.length) throw new Error("That routine was not found.");
  return { updated: true };
}

export async function deleteAgentRoutine(db: SupabaseClient, organizationId: string, routineId: string) {
  const { data, error } = await db.from("agent_routines").delete().eq("id", routineId).eq("organization_id", organizationId).select("id");
  if (error) throw new Error("Couldn't delete that routine.");
  if (!data?.length) throw new Error("That routine was not found.");
  return { deleted: true };
}

// ---- Scheduler pass ----------------------------------------------------------

export interface RoutineRepo {
  claimDue(limit: number, leaseSeconds: number): Promise<AgentRoutine[]>;
  fire(routineId: string, token: string, nextRunAt: Date, goal: string): Promise<string | null>;
  release(routineId: string, token: string, nextRunAt: Date, status: string): Promise<boolean>;
}

export type RoutinePassResult = { claimed: number; started: { routineId: string; runId: string }[]; skipped: number };

export async function runDueAgentRoutines(repo: RoutineRepo, now = new Date(), limit = 10): Promise<RoutinePassResult> {
  const due = await repo.claimDue(limit, 300);
  const result: RoutinePassResult = { claimed: due.length, started: [], skipped: 0 };
  for (const routine of due) {
    const token = routine.claim_token;
    if (!token) { result.skipped++; continue; }
    let next: Date;
    try {
      next = nextRunAfter(scheduleOf(routine), now);
    } catch {
      // A broken schedule must not retry every pass: park it a day and say why.
      await repo.release(routine.id, token, new Date(now.getTime() + 86_400_000), "Schedule could not be read; check this routine.");
      result.skipped++;
      continue;
    }
    try {
      const runId = await repo.fire(routine.id, token, next, routineGoal(routine));
      if (runId) result.started.push({ routineId: routine.id, runId });
      else result.skipped++;
    } catch (error) {
      console.error("[agent-routine]", routine.id, error);
      await repo.release(routine.id, token, next, "Could not start this time; it will try again at the next scheduled time.").catch(() => undefined);
      result.skipped++;
    }
  }
  return result;
}

type RpcClient = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };

export function supabaseRoutineRepo(admin: SupabaseClient | unknown): RoutineRepo {
  const client = admin as RpcClient;
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  return {
    async claimDue(limit, leaseSeconds) {
      const data = await call("agent_routine_claim_due", { _limit: limit, _lease_seconds: leaseSeconds });
      return Array.isArray(data) ? (data as AgentRoutine[]) : [];
    },
    async fire(routineId, token, nextRunAt, goal) {
      const data = await call("agent_routine_fire", { _id: routineId, _token: token, _next_run_at: nextRunAt.toISOString(), _goal: goal });
      return typeof data === "string" ? data : null;
    },
    async release(routineId, token, nextRunAt, status) {
      return (await call("agent_routine_release", { _id: routineId, _token: token, _next_run_at: nextRunAt.toISOString(), _status: status })) === true;
    },
  };
}
