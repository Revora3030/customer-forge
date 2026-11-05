import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OWNER_ROUTINE_PRESETS } from "./routine-presets";
import type { RoutineSchedule } from "./routine-schedule";

/** A routine as the app shows it (no claim tokens). */
export type RoutineView = {
  id: string;
  name: string;
  preset: string;
  frequency: "daily" | "weekly" | "monthly";
  weekday: number | null;
  month_day: number | null;
  hour: number;
  minute: number;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_run_id: string | null;
  last_status: string | null;
};

const orgInput = z.object({ organizationId: z.string().uuid() });
const schedule = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  monthDay: z.number().int().min(1).max(28).nullable().optional(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});
const createInput = orgInput.extend({ preset: z.enum(OWNER_ROUTINE_PRESETS), schedule: schedule.optional() });
const updateInput = orgInput.extend({
  routineId: z.string().uuid(),
  enabled: z.boolean().optional(),
  schedule: schedule.optional(),
});
const deleteInput = orgInput.extend({ routineId: z.string().uuid() });

type Result = { ok: true } | { ok: false; message: string };
const fail = (error: unknown): Result => ({
  ok: false,
  message: error instanceof Error && error.message ? error.message : "Something went wrong. Try again.",
});

function toView(row: Record<string, unknown>): RoutineView {
  const { claim_token: _t, claimed_until: _c, organization_id: _o, created_by: _b, prompt: _p, ...rest } = row;
  return rest as unknown as RoutineView;
}

/** The workspace's routines. Any member can see them. */
export const listRoutinesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => orgInput.parse(input))
  .handler(async ({ data, context }): Promise<{ routines: RoutineView[] }> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, String(context.userId), "viewer");
    const { listAgentRoutines } = await import("./routines.server");
    const rows = await listAgentRoutines(context.supabase as never, orgId);
    return { routines: rows.map((r) => toView(r as unknown as Record<string, unknown>)) };
  });

/** Turn on a read-only preset. Owner only; writes go through the service role (members can only read). */
export const createRoutineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createInput.parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, String(context.userId), "owner");
    const { createAgentRoutine, parseRoutineInput } = await import("./routines.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const input = parseRoutineInput({ preset: data.preset, ...(data.schedule ? { schedule: data.schedule } : {}) });
      await createAgentRoutine(supabaseAdmin as never, orgId, String(context.userId), input);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });

/** Pause, resume or reschedule. Owner only. */
export const updateRoutineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, String(context.userId), "owner");
    const { updateAgentRoutine } = await import("./routines.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await updateAgentRoutine(supabaseAdmin as never, orgId, data.routineId, {
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.schedule ? { schedule: data.schedule as RoutineSchedule } : {}),
      });
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });

/** Remove a routine. Owner only. Past runs stay in the run history. */
export const deleteRoutineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteInput.parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    const orgId = await requireOrgRole(context.supabase, data.organizationId, String(context.userId), "owner");
    const { deleteAgentRoutine } = await import("./routines.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await deleteAgentRoutine(supabaseAdmin as never, orgId, data.routineId);
      return { ok: true };
    } catch (error) {
      return fail(error);
    }
  });
