/**
 * Revora AI health, for the platform admin only.
 *
 * Answers three questions honestly: which AI providers Revora actually owns a
 * key for, how the last day and week of calls went, and what they cost. Every
 * number comes from the recorded usage rows — nothing here is estimated except
 * cost, which is labelled as an estimate because providers bill on their own
 * token accounting.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AiProviderStatus = {
  name: string;
  configured: boolean;
  order: number | null;
  models: { role: string; model: string }[];
};

export type AiTaskStat = {
  task: string;
  calls: number;
  failures: number;
  p95LatencyMs: number;
  estimatedCostUsd: number | null;
};

export type AiLastOutcome = {
  at: number;
  provider: string;
  model: string;
  task: string;
  ok: boolean;
  category: string | null;
  fallbackUsed: boolean;
};

/** Lovable AI status: the per-job rosters and the most recent call. */
export type AiLovableStatus = {
  configured: boolean;
  last: AiLastOutcome | null;
  roles: { role: string; models: string[] }[];
};

export type AiHealth = {
  configured: boolean;
  lovable: AiLovableStatus;
  /** Whether the builder can reach Lovable AI at all. */
  builderAiAvailable: boolean;
  /** The exact sentence users see when Revora owns no provider key. */
  unconfiguredMessage: string;
  providers: AiProviderStatus[];
  window: { calls: number; failures: number; fallbacks: number; toolCalls: number };
  last24h: { calls: number; failures: number; medianLatencyMs: number };
  tokens: { input: number; output: number };
  estimatedCostUsd: number | null;
  errorsByCategory: { category: string; count: number }[];
  byTask: AiTaskStat[];
  byModel: { provider: string; model: string; calls: number; failures: number }[];
  refusedToolCalls: { tool: string; reason: string; count: number }[];
  /** Live catalogue vs app routes, with real last-24h telemetry per model. */
  catalogue: {
    state: "live" | "stale" | "unavailable";
    fetchedAt: string | null;
    error: string | null;
    staleRosterIds: { role: string; id: string; reason: string }[];
    models: CatalogueModelReport[];
  };
};

export type CatalogueModelReport = {
  id: string;
  outputs: string[];
  roles: string[];
  eligible: boolean;
  reason: string | null;
  last24h: { attempts: number; successes: number; failures: number; medianLatencyMs: number | null; estimatedCostUsd: number | null; lastUsedAt: string | null };
};

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return Math.round(sorted[index] ?? 0);
};

export const getAiHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiHealth> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );

    const { providerChain, providerConfig } = await import("@/lib/ai/config");
    const { AI_NOT_CONFIGURED_MESSAGE } = await import("@/lib/ai/errors");
    const chain = providerChain();
    const config = providerConfig();
    const providers: AiProviderStatus[] = [
      {
        name: "lovable",
        configured: config !== null,
        order: config ? 1 : null,
        models: config ? Object.entries(config.models).map(([role, model]) => ({ role, model })) : [],
      },
    ];
    const { aiRuntimeStatus } = await import("@/lib/ai/router.server");
    const { builderAiAvailable } = await import("@/lib/ai/availability");
    const lovable: AiLovableStatus = {
      configured: config !== null,
      last: aiRuntimeStatus().last,
      roles: config
        ? Object.entries(config.models).map(([role, list]) => ({ role, models: list.split(",").map((id) => id.trim()).filter(Boolean) }))
        : [],
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    // Paged to completion: a single read is capped at 1,000 rows by the API,
    // which made busy days look like exactly 1,000 calls.
    const { fetchAllRows } = await import("@/lib/paginate");
    const { rows, error } = await fetchAllRows((from, to) =>
      supabaseAdmin
        .from("ai_usage_events")
        .select(
          "created_at, provider, model, task, latency_ms, ok, error_category, input_tokens, output_tokens, estimated_cost_usd, fallback_used, tool_calls",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (error) throw new Error("Couldn't read AI usage.");

    const { currentLovableUsage } = await import("@/lib/ai/health-merge");
    const events = currentLovableUsage(rows ?? []);
    const day = events.filter((row) => new Date(row.created_at).getTime() >= dayAgo);

    const tasks = new Map<
      string,
      { calls: number; failures: number; latency: number[]; cost: number; priced: boolean }
    >();
    const models = new Map<
      string,
      { provider: string; model: string; calls: number; failures: number }
    >();
    const categories = new Map<string, number>();
    let input = 0;
    let output = 0;
    let cost = 0;
    let priced = false;
    let failures = 0;
    let fallbacks = 0;
    let toolCalls = 0;

    for (const row of events) {
      if (!row.ok) failures += 1;
      if (row.fallback_used) fallbacks += 1;
      toolCalls += row.tool_calls ?? 0;
      input += row.input_tokens ?? 0;
      output += row.output_tokens ?? 0;
      if (row.estimated_cost_usd !== null) {
        cost += Number(row.estimated_cost_usd);
        priced = true;
      }
      if (!row.ok && row.error_category)
        categories.set(row.error_category, (categories.get(row.error_category) ?? 0) + 1);

      const task = tasks.get(row.task) ?? {
        calls: 0,
        failures: 0,
        latency: [] as number[],
        cost: 0,
        priced: false,
      };
      task.calls += 1;
      if (!row.ok) task.failures += 1;
      task.latency.push(row.latency_ms ?? 0);
      if (row.estimated_cost_usd !== null) {
        task.cost += Number(row.estimated_cost_usd);
        task.priced = true;
      }
      tasks.set(row.task, task);

      const key = `${row.provider}:${row.model}`;
      const model = models.get(key) ?? {
        provider: row.provider,
        model: row.model,
        calls: 0,
        failures: 0,
      };
      model.calls += 1;
      if (!row.ok) model.failures += 1;
      models.set(key, model);
    }

    {
      const { lastRecordedOutcome } = await import("@/lib/ai/health-merge");
      lovable.last = lastRecordedOutcome(events) ?? lovable.last;
    }

    const { rows: audit } = await fetchAllRows((from, to) =>
      supabaseAdmin
        .from("ai_tool_audit")
        .select("tool, reason, ok")
        .eq("ok", false)
        .gte("created_at", since)
        .order("id", { ascending: true })
        .range(from, to),
    );

    const refused = new Map<string, { tool: string; reason: string; count: number }>();
    for (const row of audit ?? []) {
      const key = `${row.tool}:${row.reason ?? "unknown"}`;
      const entry = refused.get(key) ?? {
        tool: row.tool,
        reason: row.reason ?? "unknown",
        count: 0,
      };
      entry.count += 1;
      refused.set(key, entry);
    }

    const { liveCatalogue } = await import("@/lib/ai/catalogue.server");
    const { routeStatus, staleRosterIds } = await import("@/lib/ai/catalogue");
    const snapshot = await liveCatalogue();
    const rosters: Record<string, string[]> = Object.fromEntries(lovable.roles.map((entry) => [entry.role, entry.models]));
    const { speechModel } = await import("./lovable-speech.server");
    rosters["speech"] = [speechModel()];
    const usage = new Map<string, { attempts: number; successes: number; latency: number[]; cost: number; priced: boolean; last: string | null }>();
    for (const row of day) {
      // Telemetry stores the provider's model id; normalise to the catalogue's vendor/id form.
      const id = String(row.model ?? "");
      const entry = usage.get(id) ?? { attempts: 0, successes: 0, latency: [], cost: 0, priced: false, last: null };
      entry.attempts += 1;
      if (row.ok) entry.successes += 1;
      if (typeof row.latency_ms === "number") entry.latency.push(row.latency_ms);
      if (row.estimated_cost_usd !== null) { entry.cost += Number(row.estimated_cost_usd); entry.priced = true; }
      if (!entry.last || row.created_at > entry.last) entry.last = row.created_at;
      usage.set(id, entry);
    }
    const usageFor = (id: string) => usage.get(id) ?? usage.get(id.split("/").pop() ?? id);
    const catalogue: AiHealth["catalogue"] = snapshot.models
      ? {
          state: snapshot.state,
          fetchedAt: snapshot.fetchedAt,
          error: snapshot.error,
          staleRosterIds: staleRosterIds(snapshot.models, rosters),
          models: routeStatus(snapshot.models, rosters).map((model) => {
            const u = usageFor(model.id);
            return {
              id: model.id,
              outputs: model.outputs,
              roles: model.roles,
              eligible: model.roles.length > 0,
              reason: model.reason ?? (u ? null : "Not used yet: routed, but no recorded calls in the last 24 hours, so untested."),
              last24h: {
                attempts: u?.attempts ?? 0,
                successes: u?.successes ?? 0,
                failures: u ? u.attempts - u.successes : 0,
                medianLatencyMs: u?.latency.length ? percentile(u.latency, 0.5) : null,
                estimatedCostUsd: u?.priced ? Math.round(u.cost * 10000) / 10000 : null,
                lastUsedAt: u?.last ?? null,
              },
            };
          }),
        }
      : {
          state: "unavailable",
          fetchedAt: null,
          error: snapshot.error,
          staleRosterIds: [],
          // Static rosters in use, unverified against the live catalogue.
          models: [...new Set(Object.values(rosters).flat())].sort().map((id) => {
            const u = usageFor(id);
            return {
              id,
              outputs: [],
              roles: Object.entries(rosters).filter(([, ids]) => ids.includes(id)).map(([role]) => role),
              eligible: false,
              reason: "Unverified: live catalogue unavailable, using the saved model list.",
              last24h: {
                attempts: u?.attempts ?? 0,
                successes: u?.successes ?? 0,
                failures: u ? u.attempts - u.successes : 0,
                medianLatencyMs: u?.latency.length ? percentile(u.latency, 0.5) : null,
                estimatedCostUsd: u?.priced ? Math.round(u.cost * 10000) / 10000 : null,
                lastUsedAt: u?.last ?? null,
              },
            };
          }),
        };

    return {
      catalogue,
      configured: chain.length > 0,
      lovable,
      builderAiAvailable: builderAiAvailable(),
      unconfiguredMessage: AI_NOT_CONFIGURED_MESSAGE,
      providers,
      window: { calls: events.length, failures, fallbacks, toolCalls },
      last24h: {
        calls: day.length,
        failures: day.filter((row) => !row.ok).length,
        medianLatencyMs: percentile(
          day.map((row) => row.latency_ms ?? 0),
          0.5,
        ),
      },
      tokens: { input, output },
      estimatedCostUsd: priced ? Math.round(cost * 10000) / 10000 : null,
      errorsByCategory: [...categories.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      byTask: [...tasks.entries()]
        .map(([task, value]) => ({
          task,
          calls: value.calls,
          failures: value.failures,
          p95LatencyMs: percentile(value.latency, 0.95),
          estimatedCostUsd: value.priced ? Math.round(value.cost * 10000) / 10000 : null,
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 20),
      byModel: [...models.values()].sort((a, b) => b.calls - a.calls).slice(0, 20),
      refusedToolCalls: [...refused.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    };
  });

export type TeamReviewRow = {
  id: string;
  createdAt: string;
  kind: string;
  business: string;
  accepted: number;
  kept: number;
  lastReason: string | null;
};

/** Recent team reviews across every customer: did the revision beat the prior version? */
export const getTeamReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamReviewRow[]> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_generations")
      .select("id,created_at,kind,result,organization_id,organizations(name)")
      .in("kind", ["first_build_compositions", "redesign_team_review", "edit_team_review"])
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error("Could not read team reviews.");
    return (data ?? []).map((row) => {
      const reports = ((row.result as { gateReports?: { accepted: boolean; reason: string }[] } | null)?.gateReports ?? []);
      const org = row.organizations as { name?: string } | null;
      return {
        id: row.id,
        createdAt: row.created_at,
        kind: row.kind,
        business: org?.name ?? "Unknown",
        accepted: reports.filter((r) => r.accepted).length,
        kept: reports.filter((r) => !r.accepted).length,
        lastReason: reports.at(-1)?.reason ?? null,
      };
    });
  });
