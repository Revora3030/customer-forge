/**
 * The agent loop's model turn, under the per-run spend ceiling.
 *
 * `createAskModel(run, …)` returns the loop's `askModel`. Each call reserves its
 * estimated cost against this run's own ceiling AND Luna's workspace and monthly
 * caps (`createRunBudgetGuard`), calls the platform router with
 * `budgetReservedExternally` so the router does not reserve a second time, then
 * settles the real cost. A refused reservation throws `LoopBudgetError`, which
 * the loop turns into an honest "reached its spending limit" outcome.
 *
 * The provider call, the price tables and the ledger are injectable so tests run
 * with no network and no database. Server-only.
 */
import { LoopBudgetError, type LoopDeps, type LoopMessage } from "@/lib/agent/loop.server";
import { createRunBudgetGuard, type BudgetLedger } from "@/lib/agent/limits.server";
import type { AgentRun } from "@/lib/agent/run-store.server";

export type ModelTurn = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  maxOutputTokens: number;
  organizationId: string;
  userId: string | null;
};
export type ModelAnswer = {
  data: unknown;
  usage: { inputTokens: number | null; outputTokens: number | null };
};
export type ModelCall = (turn: ModelTurn) => Promise<ModelAnswer>;

export type ModelPricing = {
  estimate: (promptChars: number, maxOutputTokens: number) => number;
  cost: (usage: { inputTokens: number; outputTokens: number }) => number;
  /** What a failed call is charged: 0 for a definite rejection, the estimate when it may still be billed. */
  failureCharge: (error: unknown, estimate: number) => number;
};

export type AskModelOptions = {
  call?: ModelCall;
  ledger?: BudgetLedger;
  pricing?: ModelPricing;
  /** The run's ceiling in microcents when the run has none of its own (the workspace's PAI-5 limit), before what it already spent. */
  capFor: (run: AgentRun) => Promise<number>;
  maxOutputTokens?: number;
};

const DEFAULT_MAX_OUTPUT = 1200;

const platformCall: ModelCall = async (turn) => {
  const router = await import("@/lib/ai/router.server");
  const outcome = await router.generateStructuredOutput(
    { task: "agent.loop", organizationId: turn.organizationId, userId: turn.userId },
    {
      role: "primary",
      paidOnly: true,
      messages: turn.messages,
      maxOutputTokens: turn.maxOutputTokens,
    },
    { budgetReservedExternally: true },
  );
  return { data: outcome.data, usage: outcome.usage };
};

async function platformPricing(): Promise<ModelPricing> {
  const [luna, router, errors] = await Promise.all([
    import("@/lib/ai/luna.server"),
    import("@/lib/ai/router.server"),
    import("@/lib/ai/errors"),
  ]);
  return {
    estimate: (chars, out) => luna.estimateMicrocents(chars, out, "luna"),
    cost: (usage) =>
      luna.costMicrocents(
        { inputTokens: usage.inputTokens, cachedInputTokens: 0, outputTokens: usage.outputTokens },
        "luna",
      ),
    failureCharge: (error, estimate) =>
      error instanceof errors.RevoraAiError ? router.paidFailureCharge(error, estimate) : estimate,
  };
}

export function createAskModel(run: AgentRun, options: AskModelOptions): LoopDeps["askModel"] {
  const call = options.call ?? platformCall;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT;
  let guard: ReturnType<typeof createRunBudgetGuard> | null = null;
  let pricing: ModelPricing | null = options.pricing ?? null;

  return async ({ system, messages }: { system: string; messages: LoopMessage[] }) => {
    pricing ??= await platformPricing();
    if (!guard) {
      const cap = run.budget_cap ?? (await options.capFor(run));
      guard = createRunBudgetGuard({
        organizationId: run.organization_id,
        capMicrocents: Math.max(0, cap - run.budget_used),
        ...(options.ledger ? { ledger: options.ledger } : {}),
      });
    }
    const chars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
    const estimate = pricing.estimate(chars, maxOutputTokens);
    const grant = await guard.reserve(estimate);
    if (!grant.allowed) throw new LoopBudgetError(grant.message);
    let answer: ModelAnswer;
    try {
      answer = await call({
        messages: [{ role: "system", content: system }, ...messages],
        maxOutputTokens,
        organizationId: run.organization_id,
        userId: run.user_id,
      });
    } catch (error) {
      await guard.settle(grant, pricing.failureCharge(error, estimate)).catch(() => undefined);
      throw error;
    }
    const billed =
      answer.usage.inputTokens === null && answer.usage.outputTokens === null
        ? estimate
        : pricing.cost({
            inputTokens: answer.usage.inputTokens ?? Math.ceil(chars / 4),
            outputTokens: answer.usage.outputTokens ?? 0,
          });
    // The answer is already paid for; a ledger hiccup must not throw it away.
    await guard.settle(grant, billed).catch(() => undefined);
    return { data: answer.data, costMicrocents: billed };
  };
}
