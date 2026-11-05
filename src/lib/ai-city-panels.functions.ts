import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildGrowthFunnel,
  buildMemoryHealth,
  buildReleaseBoard,
  staleCutoff,
  type ContractProbeInput,
  type FunnelWindowInput,
  type GrowthFunnel,
  type MemoryHealth,
  type ReleaseBoard,
  type ReleaseEvidenceInput,
} from "./ai-city-panels";

/**
 * JC-25 / JC-26 / JC-27: read-only district panels. Platform admins only.
 * Each read that fails reports null ("unavailable"), never zero, and nothing
 * here writes, sends or edits.
 */

type Counter = PromiseLike<{ count: number | null; error: unknown }>;
const settled = async (query: () => Counter): Promise<number | null> => {
  try {
    const result = await query();
    return result.error || typeof result.count !== "number" ? null : result.count;
  } catch {
    return null;
  }
};

export const getCityGrowthFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GrowthFunnel> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { computePlatformFunnel } = await import("./platform-funnel.functions");
    const { collectSalesPipeline } = await import("./ai-city.server");
    const funnelFor = async (days: number): Promise<FunnelWindowInput> => {
      try {
        const funnel = await computePlatformFunnel(days);
        return { days, stages: funnel.stages, unavailable: funnel.errors };
      } catch {
        return null;
      }
    };
    const [funnel7, funnel30, pipeline, inboxTotal, needsReview, unprocessed] = await Promise.all([
      funnelFor(7),
      funnelFor(30),
      collectSalesPipeline(db).catch(() => null),
      settled(() => db.from("prospect_inbound").select("id", { count: "exact", head: true })),
      settled(() => db.from("prospect_inbound").select("id", { count: "exact", head: true }).eq("status", "awaiting_operator")),
      settled(() => db.from("prospect_inbound").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"])),
    ]);
    return buildGrowthFunnel({
      funnel7,
      funnel30,
      inboxTotal,
      inboxNeedsReview: needsReview,
      inboxUnprocessed: unprocessed,
      demosFound: pipeline?.found ?? null,
      demosReady: pipeline?.demoReady ?? null,
      approvals: pipeline?.awaitingApproval ?? null,
      checkedAt: new Date().toISOString(),
    });
  });

export const getCityReleaseBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReleaseBoard> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { releaseEvidence } = await import("./jarvis-diagnostic-tools.server");
    const { probeSchemaContracts } = await import("./jarvis-diagnostics.server");
    const [evidence, probes] = await Promise.all([
      releaseEvidence().catch(() => null) as Promise<ReleaseEvidenceInput>,
      probeSchemaContracts(db)
        .then((result) => result.contracts as ContractProbeInput[])
        .catch(() => null),
    ]);
    return buildReleaseBoard({ evidence, contracts: probes, checkedAt: new Date().toISOString() });
  });

export const getCityMemoryHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MemoryHealth> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const owned = () => db.from("jarvis_memories").select("id", { count: "exact", head: true }).eq("user_id", context.userId);
    const cutoff = staleCutoff(Date.now());
    const [saved, stale, replaced] = await Promise.all([
      settled(() => owned()),
      settled(() => owned().lt("updated_at", cutoff)),
      // Only readable once the supersession migration is applied; null before.
      settled(() => owned().not("superseded_by", "is", null)),
    ]);
    return buildMemoryHealth({ saved, stale, replaced, checkedAt: new Date().toISOString() });
  });
