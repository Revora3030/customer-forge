/**
 * Platform-owner view of the AI team: which model did which job in recent
 * builds and edits, and the durable model registry totals. Row-level security
 * limits both tables to the platform owner; nothing here uses elevated access.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TeamTraceRow = {
  id: string;
  at: string;
  organizationId: string | null;
  stage: string;
  lane: string;
  provider: string | null;
  model: string | null;
  ok: boolean;
  latencyMs: number | null;
  reason: string | null;
  contribution: string | null;
};

export const getTeamTrace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const [trace, registry] = await Promise.all([
      context.supabase
        .from("ai_team_trace")
        .select("id,created_at,organization_id,stage,lane,provider,model,ok,latency_ms,reason,contribution")
        .order("created_at", { ascending: false })
        .limit(data.limit ?? 60),
      context.supabase.from("ai_model_registry").select("provider,evidence,healthy,retired,paid"),
    ]);
    if (trace.error) throw new Error(trace.error.message);
    const models = registry.data ?? [];
    const live = models.filter((m) => !m.retired);
    const providers = new Set(live.map((m) => m.provider));
    return {
      rows: (trace.data ?? []).map(
        (r): TeamTraceRow => ({
          id: r.id,
          at: r.created_at,
          organizationId: r.organization_id,
          stage: r.stage,
          lane: r.lane,
          provider: r.provider,
          model: r.model,
          ok: r.ok,
          latencyMs: r.latency_ms,
          reason: r.reason,
          contribution: r.contribution,
        }),
      ),
      registry: {
        tracked: live.length,
        probed: live.filter((m) => m.evidence === "probe").length,
        healthy: live.filter((m) => m.healthy).length,
        paid: live.filter((m) => m.paid).length,
        providers: providers.size,
        retired: models.length - live.length,
      },
    };
  });
