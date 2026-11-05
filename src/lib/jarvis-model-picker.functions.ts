import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildModelPickerData, type ModelPickerData, type PaidBudgetSnapshot, type RegistryRow, type TraceRow } from "./jarvis-model-picker";

const TRACE_WINDOW_DAYS = 30;
const TRACE_ROW_LIMIT = 5000;

/**
 * JC-38: options for the per-chat model picker. Super-admin only. Reads
 * configured providers, registry (retired/paid), recorded call health, and
 * today's paid budget. A failed source is null / unavailable — never zeroed.
 */
export const getJarvisModelPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ModelPickerData> => {
    const { assertSuperAdmin } = await import("./admin.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { configuredProviders } = await import("./jarvis-model-status.server");
    const configured = Boolean(configuredProviders(process.env)['lovable']);
    const now = Date.now();
    const since = new Date(now - TRACE_WINDOW_DAYS * 86_400_000).toISOString();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    const read = async <T,>(query: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | null> => {
      try {
        const result = await query();
        return result.error || !Array.isArray(result.data) ? null : (result.data as T[]);
      } catch {
        return null;
      }
    };

    const [registry, trace, spend] = await Promise.all([
      read<RegistryRow>(() =>
        db.from("ai_model_registry").select("model,provider,display_name,retired,paid").limit(2000),
      ),
      read<TraceRow>(() =>
        db
          .from("ai_team_trace")
          .select("model,ok,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(TRACE_ROW_LIMIT),
      ),
      read<{ actual_microcents: number | null; estimate_microcents: number | null; settled_at: string | null }>(() =>
        db
          .from("ai_paid_spend_reservations")
          .select("actual_microcents,estimate_microcents,settled_at")
          .gte("created_at", dayStart.toISOString())
          .limit(10000),
      ),
    ]);

    let paidBudget: PaidBudgetSnapshot | null = null;
    try {
      const { paidDailyCapMicrocents } = await import("./ai/paid-budget.server");
      const { MICROCENTS_PER_DOLLAR } = await import("./ai/luna.server");
      const { paidSpend } = await import("./ai-city-metrics");
      const spendRows = spend
        ? spend.map((r) => ({
            actual_microcents: r.actual_microcents,
            estimate_microcents: r.estimate_microcents ?? 0,
            settled_at: r.settled_at,
          }))
        : null;
      paidBudget = paidSpend(spendRows, paidDailyCapMicrocents(), MICROCENTS_PER_DOLLAR, dayStart.toISOString().slice(0, 10));
    } catch {
      paidBudget = null;
    }

    return buildModelPickerData({
      configured,
      registry,
      trace,
      paidBudget,
      checkedAt: new Date(now).toISOString(),
    });
  });
