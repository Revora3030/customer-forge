/**
 * automations.list / automations.history: read-only, same queries as the
 * Automations page (queries.ts useAutomations / useAutomationRuns). History is
 * PII-light: no recipient address and no message body reach the model.
 */
import { z } from "zod";
import { defineToolV2 } from "@/lib/ai/tool-registry-v2.server";
import { bounded, db, readFailed } from "./shared";

export const automationsList = defineToolV2({
  name: "automations.list",
  description:
    "List this workspace's automations: name, trigger, on/off, and their steps (action, channel, delay).",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({}),
  run: async (_input, context) => {
    const { data, error } = await db(context)
      .from("automations")
      .select(
        "id, name, trigger_event, is_active, created_at, automation_steps!automation_steps_automation_id_fkey(id, sort_order, delay_minutes, action_type, channel, subject, body)",
      )
      .eq("organization_id", context.organizationId)
      .order("created_at");
    if (error) readFailed(error);
    const automations = (
      (data ?? []) as Array<{
        id: string;
        name: string;
        trigger_event: string;
        is_active: boolean;
        created_at: string;
        automation_steps: Array<{
          sort_order: number;
          delay_minutes: number;
          action_type: string;
          channel: string | null;
        }> | null;
      }>
    ).map((a) => ({
      id: a.id,
      name: a.name,
      trigger: a.trigger_event,
      active: a.is_active,
      created_at: a.created_at,
      steps: [...(a.automation_steps ?? [])]
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((s) => ({ action: s.action_type, channel: s.channel, delayMinutes: s.delay_minutes })),
    }));
    return bounded({ automations }, "automations");
  },
});

const STATUSES = ["pending", "sent", "failed", "skipped", "cancelled"] as const;

export const automationsHistory = defineToolV2({
  name: "automations.history",
  description:
    "Recent automation runs (newest first, up to 50): action, trigger, status, scheduled and sent times, plus counts by status.",
  risk: "read",
  scope: "owner",
  schema: z.strictObject({
    status: z.enum(STATUSES).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  run: async (input, context) => {
    const { data, error } = await db(context)
      .from("automation_runs")
      .select(
        "id, action_type, recipient, subject, body, status, scheduled_for, sent_at, trigger_event, leads(name)",
      )
      .eq("organization_id", context.organizationId)
      .order("scheduled_for", { ascending: false })
      .limit(60);
    if (error) readFailed(error);
    const all = (data ?? []) as Array<{
      id: string;
      action_type: string;
      status: string;
      scheduled_for: string;
      sent_at: string | null;
      trigger_event: string | null;
    }>;
    const byStatus: Record<string, number> = {};
    for (const run of all) byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    const runs = all
      .filter((run) => !input.status || run.status === input.status)
      .slice(0, input.limit ?? 50)
      .map((run) => ({
        id: run.id,
        action: run.action_type,
        trigger: run.trigger_event,
        status: run.status,
        scheduled_for: run.scheduled_for,
        sent_at: run.sent_at,
      }));
    return bounded({ byStatus, runs }, "runs");
  },
});
