/**
 * Admin-only read of the paid orchestrator's state: is it on, what is the
 * monthly cap, how much of it is used, and what happened on recent calls.
 * No secret, key fragment or prompt content is ever returned.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LunaEvent = {
  id: string;
  purpose: string;
  outcome: string;
  reason: string | null;
  costUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  createdAt: string;
};

export type LunaStatus = {
  enabled: boolean;
  keyPresent: boolean;
  model: string;
  capUsd: number;
  spentUsd: number;
  remainingUsd: number;
  calls: number;
  month: string;
  blocked: boolean;
  events: LunaEvent[];
};

export const getLunaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LunaStatus> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );

    const { lunaEnabled, lunaModel, lunaMonthlyCapMicrocents, MICROCENTS_PER_DOLLAR } =
      await import("@/lib/ai/luna.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const month = new Date().toISOString().slice(0, 7);
    const cap = lunaMonthlyCapMicrocents();

    const state = await supabaseAdmin
      .from("luna_budget_state")
      .select("spent_microcents, cap_microcents, calls")
      .eq("month", month)
      .maybeSingle();

    const spent = Number(state.data?.spent_microcents ?? 0);
    const calls = Number(state.data?.calls ?? 0);
    const capMicrocents = Number(state.data?.cap_microcents ?? cap) || cap;

    const recent = await supabaseAdmin
      .from("luna_usage_events")
      .select(
        "id, purpose, outcome, reason, cost_microcents, input_tokens, cached_input_tokens, output_tokens, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    const usd = (value: number) => Math.round((value / MICROCENTS_PER_DOLLAR) * 10_000) / 10_000;

    return {
      enabled: lunaEnabled(),
      keyPresent: Boolean(process.env["OPENAI_API_KEY"]),
      model: lunaModel(),
      capUsd: usd(capMicrocents),
      spentUsd: usd(spent),
      remainingUsd: usd(Math.max(capMicrocents - spent, 0)),
      calls,
      month,
      blocked: spent >= capMicrocents,
      events: (recent.data ?? []).map((row) => ({
        id: String(row.id),
        purpose: String(row.purpose),
        outcome: String(row.outcome),
        reason: row.reason ? String(row.reason) : null,
        costUsd: usd(Number(row.cost_microcents ?? 0)),
        inputTokens: Number(row.input_tokens ?? 0),
        cachedInputTokens: Number(row.cached_input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
        createdAt: String(row.created_at),
      })),
    };
  });
