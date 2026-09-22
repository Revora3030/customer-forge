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

export type AiFreeProviderStatus = {
  name: string;
  label: string;
  allowance: string;
  configured: boolean;
  healthy: boolean;
  openFailures: number;
  cooldownUntil: number | null;
  remainingToday: number | null;
  models: { role: string; model: string }[];
};

export type AiLastOutcome = {
  at: number;
  provider: string;
  model: string;
  task: string;
  ok: boolean;
  category: string | null;
  fallbackUsed: boolean;
  free: boolean;
};

export type AiFreeStatus = {
  freeAiEnabled: boolean;
  freeOnly: boolean;
  paidFallbackReachable: boolean;
  /** Who served the most recent request, and how it ended. */
  last: AiLastOutcome | null;
  providers: AiFreeProviderStatus[];
};


export type AiHealth = {
  configured: boolean;
  /** Free-AI-first status: what is reachable at no cost right now. */
  free: AiFreeStatus;
  /** Whether the builder can reach any model at all (free or explicitly paid). */
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
    const providers: AiProviderStatus[] = (["google", "openai"] as const).map((name) => {
      const config = providerConfig(name);
      const order = chain.findIndex((entry) => entry.name === name);
      return {
        name,
        configured: config !== null,
        order: order === -1 ? null : order + 1,
        models: config
          ? Object.entries(config.models).map(([role, model]) => ({ role, model }))
          : [],
      };
    });

    const { freeAiStatus } = await import("@/lib/ai/router.server");
    const { builderAiAvailable } = await import("@/lib/ai/availability");
    const free = freeAiStatus() as AiFreeStatus;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const { data: rows, error } = await supabaseAdmin
      .from("ai_usage_events")
      .select(
        "created_at, provider, model, task, latency_ms, ok, error_category, input_tokens, output_tokens, estimated_cost_usd, fallback_used, tool_calls",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw new Error("Couldn't read AI usage.");

    const events = rows ?? [];
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

    const { data: audit } = await supabaseAdmin
      .from("ai_tool_audit")
      .select("tool, reason, ok")
      .eq("ok", false)
      .gte("created_at", since)
      .limit(5000);

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

    return {
      configured: chain.length > 0 || free.providers.some((entry) => entry.configured),
      free,
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

/**
 * Provider priority, for the platform admin only.
 *
 * Changes the order free providers are tried in for this server process. It
 * cannot introduce a paid provider and it never touches credentials.
 */
export const setFreeAiProviderOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order: string[] | null }) => ({
    order: input.order === null ? null : input.order.slice(0, 8).map((name) => String(name)),
  }))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );
    const { setRuntimeFreeProviderOrder, isFreeProvider, freeProviderOrder } =
      await import("@/lib/ai/free");
    if (data.order && data.order.some((name) => !isFreeProvider(name)))
      throw new Error("Only free providers can be ordered here.");
    setRuntimeFreeProviderOrder(data.order);
    return { order: freeProviderOrder() };
  });

/* --------------------------- free model inventory -------------------------- */

export type InventoryModel = {
  provider: string;
  model: string;
  displayName: string;
  modality: string;
  capabilities: string[];
  weight: number;
  /** "live" when the provider's own catalogue listed it, "configured" otherwise. */
  confidence: string;
  freeEvidence: string;
  structuredOutput: boolean;
  streaming: boolean;
  healthy: boolean;
  remainingToday: number | null;
};

export type AiModelInventory = {
  /** Every verified free model Revora can actually reach right now. */
  models: InventoryModel[];
  totals: { models: number; providers: number; free: number };
  byProvider: { provider: string; models: number; healthy: boolean }[];
  /** The last few multi-model builds, with each model's part in them. */
  runs: import("@/lib/ai/ensemble.server").EnsembleRun[];
  lanes: { id: string; title: string; capability: string }[];
  /** Measured reliability/latency per model, derived only from recorded calls. */
  benchmarks: import("@/lib/ai/benchmark.server").ModelBenchmark[];
};

/**
 * The live inventory of the free model pool, for the platform admin only.
 *
 * Nothing is listed as reachable unless the free-eligibility gate accepts it,
 * and no credential value is ever returned.
 */
export const getAiModelInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiModelInventory> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );

    const { buildFreeModelRegistry } = await import("@/lib/ai/registry.server");
    const { ensembleRuns, ENSEMBLE_LANES } = await import("@/lib/ai/ensemble.server");
    const { modelBenchmarks } = await import("@/lib/ai/benchmark.server");

    const deduped = new Map<string, InventoryModel>();
    for (const role of ["design", "primary", "coding", "fast", "vision"] as const) {
      let models: Awaited<ReturnType<typeof buildFreeModelRegistry>> = [];
      try {
        models = await buildFreeModelRegistry(role);
      } catch {
        // A provider catalogue being unreachable means fewer rows, not an error page.
      }
      for (const entry of models) {
        const key = `${entry.provider}|${entry.model}`;
        const existing = deduped.get(key);
        if (existing && existing.capabilities.length >= entry.capabilities.length) continue;
        deduped.set(key, {
          provider: entry.provider,
          model: entry.model,
          displayName: entry.displayName,
          modality: entry.modality,
          capabilities: entry.capabilities,
          weight: entry.weight,
          confidence: entry.confidence,
          freeEvidence: entry.freeEvidence,
          structuredOutput: entry.structuredOutput,
          streaming: entry.streaming,
          healthy: entry.health.healthy,
          remainingToday: entry.quota.remainingToday,
        });
      }
    }

    const models = [...deduped.values()].sort(
      (a, b) => a.provider.localeCompare(b.provider) || b.weight - a.weight,
    );
    const providers = new Map<string, { provider: string; models: number; healthy: boolean }>();
    for (const entry of models) {
      const row = providers.get(entry.provider) ?? {
        provider: entry.provider,
        models: 0,
        healthy: false,
      };
      row.models += 1;
      row.healthy = row.healthy || entry.healthy;
      providers.set(entry.provider, row);
    }

    return {
      models,
      totals: { models: models.length, providers: providers.size, free: models.length },
      byProvider: [...providers.values()].sort((a, b) => b.models - a.models),
      runs: ensembleRuns(),
      lanes: ENSEMBLE_LANES.map((lane) => ({
        id: lane.id,
        title: lane.title,
        capability: lane.capability,
      })),
      benchmarks: await modelBenchmarks(),
    };
  });

/* ------------------------- orchestration visibility ------------------------ */

export type OrchestrationModel = {
  provider: string;
  model: string;
  displayName: string;
  quality: number;
  reliability: number;
  healthy: boolean;
  blockedReason: string | null;
  /** Where the capability data came from: a live probe, provider metadata, or a declaration. */
  evidence: string;
  verifiedAt: number;
  costPerMTok: number | null;
  paid: boolean;
  /** Only capabilities Revora has actually proven. */
  proven: string[];
  /** Capabilities that are still unproven — never advertised as supported. */
  unknown: string[];
};

export type AiOrchestration = {
  at: number | null;
  /**
   * Honest, separated counts. "Discovered" is only what the provider catalogues
   * listed; nothing here is a marketing number.
   */
  totals: {
    discovered: number;
    verified: number;
    healthy: number;
    specialists: number;
    specialistsHealthy: number;
    participated: number;
  };
  specialists: (OrchestrationModel & { charter: string; domains: string[] })[];
  /** A bounded window of the catalogue for display; `totals.discovered` is the truth. */
  models: OrchestrationModel[];
  modelsShown: number;
  decisions: import("@/lib/ai/orchestration/telemetry").RoutingDecision[];
  participation: ReturnType<
    typeof import("@/lib/ai/orchestration/telemetry").participationSummary
  >;
  outcomes: import("@/lib/ai/orchestration/telemetry").CallOutcome[];
  probe: { version: number; capabilities: string[] };
  /**
   * The free stand-in squads that keep building when the paid lanes are spent,
   * plus the most recent hand-overs. Nothing here is a capability claim: a
   * member is only listed because a real capability check passed.
   */
  hallOfFame: {
    squads: {
      purpose: string;
      capability: string;
      members: { provider: string; model: string; ready: boolean }[];
    }[];
    runs: import("@/lib/ai/hall-of-fame.server").HallOfFameRun[];
  };
};

/**
 * The live orchestration picture, for the platform admin only: what was
 * discovered, what is proven, what is healthy, which models actually
 * participated in recent work, and why each was chosen or skipped.
 */
export const getAiOrchestration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiOrchestration> => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await assertSuperAdmin(
      context.supabase as unknown as Parameters<typeof assertSuperAdmin>[0],
      String(context.userId),
    );

    const { buildModelCatalog } = await import("@/lib/ai/orchestration/catalog.server");
    const { SPECIALIST_SIX } = await import("@/lib/ai/orchestration/specialists");
    const { PROBE_VERSION, probeableCapabilities } = await import(
      "@/lib/ai/orchestration/probe.server"
    );
    const { recentRoutingDecisions, recentCallOutcomes, participationSummary } = await import(
      "@/lib/ai/orchestration/telemetry"
    );

    let snapshot: Awaited<ReturnType<typeof buildModelCatalog>> | null = null;
    try {
      snapshot = await buildModelCatalog();
    } catch {
      // A provider catalogue being unreachable means fewer rows, not an error page.
    }

    const shape = (
      record: import("@/lib/ai/orchestration/contracts").ModelRecord,
    ): OrchestrationModel => {
      const proven: string[] = [];
      const unknown: string[] = [];
      for (const [capability, state] of Object.entries(record.capabilities))
        if (state === "supported") proven.push(capability);
        else if (state !== "unsupported") unknown.push(capability);
      return {
        provider: record.provider,
        model: record.id,
        displayName: record.displayName,
        quality: record.quality,
        reliability: record.reliability,
        healthy: record.healthy,
        blockedReason: record.blockedReason,
        evidence: record.evidence,
        verifiedAt: record.verifiedAt,
        costPerMTok: record.costPerMTok,
        paid: record.paid,
        proven,
        unknown,
      };
    };

    const participation = participationSummary();
    const specialists = (snapshot?.specialists ?? []).map((record) => {
      const entry = SPECIALIST_SIX.find((candidate) => candidate.model === record.id);
      return {
        ...shape(record),
        charter: entry?.charter ?? "",
        domains: entry ? [...entry.domains] : [],
      };
    });
    const models = (snapshot?.models ?? []).map(shape);

    const { hallOfFameSquad, recentHallOfFameRuns } = await import("@/lib/ai/hall-of-fame.server");
    const squadPurposes = [
      "creative_direction",
      "content_strategy",
      "adversarial_review",
      "page_planning",
      "metadata",
    ] as const;
    const squads = await Promise.all(
      squadPurposes.map(async (purpose) => {
        const built = await hallOfFameSquad(purpose);
        return {
          purpose,
          capability: built.capability,
          members: built.squad.map((member) => ({
            provider: member.provider,
            model: member.model,
            ready: member.healthy && (member.remainingToday ?? 1) > 0,
          })),
        };
      }),
    );

    return {
      at: snapshot?.at ?? null,
      totals: {
        discovered: snapshot?.totals.discovered ?? 0,
        verified: snapshot?.totals.verified ?? 0,
        healthy: snapshot?.totals.healthy ?? 0,
        specialists: specialists.length,
        specialistsHealthy: specialists.filter((entry) => entry.healthy).length,
        participated: participation.length,
      },
      specialists,
      models: models.slice(0, 200),
      modelsShown: Math.min(models.length, 200),
      decisions: recentRoutingDecisions(15),
      participation,
      outcomes: recentCallOutcomes(25),
      probe: { version: PROBE_VERSION, capabilities: probeableCapabilities() },
      hallOfFame: { squads, runs: recentHallOfFameRuns(15) },
    };
  });
