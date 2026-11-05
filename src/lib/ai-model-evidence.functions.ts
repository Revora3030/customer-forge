import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EVIDENCE_ROW_LIMIT, EVIDENCE_WINDOW_DAYS, buildModelEvidence, type ModelEvidence, type RegistryInput, type TraceInput } from "./ai-model-evidence";

/** JC-22: read-only model evidence for the Institute. Platform admins only; a failed read is null, never zero. */
export const getCityModelEvidence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ModelEvidence> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    const since = new Date(now - EVIDENCE_WINDOW_DAYS * 86_400_000).toISOString();
    const read = async <T,>(query: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | null> => {
      try { const r = await query(); return r.error || !Array.isArray(r.data) ? null : (r.data as T[]); } catch { return null; }
    };
    const [trace, registry] = await Promise.all([
      read<TraceInput>(() => db.from("ai_team_trace").select("model,provider,ok,reason,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(EVIDENCE_ROW_LIMIT)),
      read<RegistryInput>(() => db.from("ai_model_registry").select("model,provider,display_name,retired").eq("retired", false).limit(1000)),
    ]);
    return buildModelEvidence({ trace, registry, checkedAt: new Date(now).toISOString() });
  });
