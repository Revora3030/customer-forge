/**
 * Truthful AI telemetry and cost control.
 *
 * One row per model call, written with the service-role client so a failed or
 * denied call is still recorded. Rows carry provider, model, task, workspace,
 * request id, latency, outcome, token usage when the provider reported it and
 * an estimated cost only when Revora knows that model's price.
 *
 * Deliberately never stored: API keys, prompts, generated content, customer
 * PII. The row is for operating the platform, not for reading a client's work.
 */

import { aiLimits, estimateCostUsd, type ProviderName } from "@/lib/ai/config";
import type { AiErrorCategory } from "@/lib/ai/errors";

export type AiEvent = {
  requestId: string;
  provider: ProviderName;
  model: string;
  task: string;
  organizationId: string | null;
  userId: string | null;
  latencyMs: number;
  ok: boolean;
  errorCategory: AiErrorCategory | null;
  inputTokens: number | null;
  outputTokens: number | null;
  fallbackUsed: boolean;
  toolCalls: number;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Records one call. Telemetry failure never breaks the AI request itself. */
export async function recordAiEvent(event: AiEvent) {
  try {
    const client = await admin();
    await client.from("ai_usage_events").insert({
      request_id: event.requestId ?? crypto.randomUUID(),
      provider: event.provider,
      model: event.model,
      task: event.task.slice(0, 60),
      organization_id: event.organizationId,
      user_id: event.userId,
      latency_ms: Math.round(event.latencyMs),
      ok: event.ok,
      error_category: event.errorCategory,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      estimated_cost_usd: estimateCostUsd(
        event.model,
        event.inputTokens ?? 0,
        event.outputTokens ?? 0,
      ),
      fallback_used: event.fallbackUsed,
      tool_calls: event.toolCalls,
    });
  } catch (error) {
    console.error("[revora-ai] telemetry write failed", (error as Error).message);
  }
}

export type LimitVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Rolling-window usage caps. Counting failures too is deliberate: a loop that
 * fails every call still costs provider requests, so it must still be stopped.
 * A counting failure denies the request rather than opening the gate.
 */
export async function checkAiLimits(caller: {
  organizationId?: string | null;
  userId?: string | null;
}): Promise<LimitVerdict> {
  const limits = aiLimits();
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // No identity means there is no per-user or per-workspace cap to enforce.
  // Anonymous/system callers must not be denied because usage telemetry cannot
  // be attributed to anyone — the caps below are keyed by id and simply do not
  // apply. This also keeps the provider layers usable when the usage-tracking
  // store is temporarily unavailable to anonymous paths.
  if (!caller.userId && !caller.organizationId) {
    return { allowed: true };
  }

  try {
    const client = await admin();

    if (caller.userId) {
      const { count, error } = await client
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", caller.userId)
        .gte("created_at", dayAgo);
      if (error) throw error;
      if ((count ?? 0) >= limits.perUserDaily)
        return {
          allowed: false,
          reason: "You've reached today's Revora AI limit. It resets within 24 hours.",
        };
    }

    if (caller.organizationId) {
      const [{ count: dayCount, error: dayError }, { count: monthCount, error: monthError }] =
        await Promise.all([
          client
            .from("ai_usage_events")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", caller.organizationId)
            .gte("created_at", dayAgo),
          client
            .from("ai_usage_events")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", caller.organizationId)
            .gte("created_at", monthAgo),
        ]);
      if (dayError) throw dayError;
      if (monthError) throw monthError;
      if ((dayCount ?? 0) >= limits.perWorkspaceDaily)
        return {
          allowed: false,
          reason: "This workspace has reached today's Revora AI limit. It resets within 24 hours.",
        };
      if ((monthCount ?? 0) >= limits.perWorkspaceMonthly)
        return {
          allowed: false,
          reason: "This workspace has reached its monthly Revora AI limit.",
        };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[revora-ai] limit check failed", (error as Error).message);
    return { allowed: false, reason: "Revora AI usage limits can't be checked right now." };
  }
}
