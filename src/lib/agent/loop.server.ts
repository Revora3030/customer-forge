/**
 * PAI-3: the agent loop engine.
 *
 * plan -> pick a tool -> run it -> read the result -> repeat, until the model
 * says it is finished or a limit stops it. It plugs into the run store as a
 * `RunExecutor`: the store owns leases, fences and the final status; the loop
 * owns what happens between claiming a run and handing back a `RunOutcome`.
 *
 * Guarantees (each covered by loop.server.test.ts):
 * - Hard limits: max steps, wall-clock time, and a spend ceiling. Hitting one
 *   ends the run honestly with a plain-English reason, never silently.
 * - A checkpoint is saved after every step, so a retry after a worker crash
 *   resumes from the last finished step instead of starting over.
 * - A malformed model reply is re-asked once with the exact problem named; a
 *   second one fails the run.
 * - A tool timeout is retried once; if it times out again the run fails and
 *   says which tool. Tool failures are never hidden from the model or owner.
 * - A tool that needs approval ends the run as `needs_approval`; the loop never
 *   sends anything itself and never gets an organization id from the model.
 * - Write tools are followed by a verification read when one is provided.
 * - Every exit path writes one terminal event (`run_finished`) first.
 *
 * Everything outside the loop (model, tools, clock) is injected, so tests run
 * with a stub model and no network. Server-only.
 */

import type { ToolResultV2 } from "@/lib/ai/tool-registry-v2.server";
import {
  LostLeaseError,
  registerAgentRunExecutor,
  type AgentRun,
  type RunContext,
  type RunExecutor,
  type RunOutcome,
} from "@/lib/agent/run-store.server";
import { buildSystemPrompt, formatObservation, parseNextStep, type ProtocolTool } from "@/lib/agent/protocol";

export type LoopMessage = { role: "user" | "assistant"; content: string };

export type LoopLimits = {
  maxSteps: number;
  maxWallMs: number;
  toolTimeoutMs: number;
  /** Extra attempts after a tool timeout. */
  toolTimeoutRetries: number;
  /** Extra model asks after an unusable reply. */
  malformedRetries: number;
  /** Messages kept in the checkpoint (oldest dropped first). */
  maxHistory: number;
};

export const DEFAULT_LOOP_LIMITS: LoopLimits = {
  maxSteps: 12,
  maxWallMs: 4 * 60_000,
  toolTimeoutMs: 25_000,
  toolTimeoutRetries: 1,
  malformedRetries: 1,
  maxHistory: 40,
};

/** Thrown by `askModel` when the run's spend ceiling (or Luna's caps) refuse another call. */
export class LoopBudgetError extends Error {
  constructor(message = "This run reached its spending limit.") {
    super(message);
    this.name = "LoopBudgetError";
  }
}

export type LoopToolCall = { name: string; args: unknown; requestId: string; stepId: string };

export type LoopDeps = {
  /** One model turn. Returns the parsed JSON object. Throws LoopBudgetError when over budget. */
  askModel: (input: { system: string; messages: LoopMessage[]; run: AgentRun }) => Promise<{ data: unknown; costMicrocents?: number }>;
  tools: {
    list: () => ProtocolTool[];
    run: (call: LoopToolCall) => Promise<ToolResultV2>;
  };
  /** Re-reads what a write tool changed. Without it the loop says verification was skipped. */
  verifyWrite?: (input: { tool: string; args: unknown; result: ToolResultV2 & { ok: true } }) => Promise<{ ok: boolean; detail: string }>;
  limits?: Partial<LoopLimits>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type LoopState = { step: number; history: LoopMessage[]; spent: number };

function readState(checkpoint: Record<string, unknown>): LoopState {
  const raw = checkpoint["loop"] as Partial<LoopState> | undefined;
  const history = Array.isArray(raw?.history)
    ? raw.history.filter(
        (m): m is LoopMessage =>
          !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
    : [];
  return {
    step: typeof raw?.step === "number" && raw.step >= 0 ? Math.floor(raw.step) : 0,
    history,
    spent: typeof raw?.spent === "number" && raw.spent >= 0 ? raw.spent : 0,
  };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export async function runAgentLoop(ctx: RunContext, deps: LoopDeps): Promise<RunOutcome> {
  const limits: LoopLimits = { ...DEFAULT_LOOP_LIMITS, ...deps.limits };
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))); // DevSkim: ignore DS172411 -- Numeric delay only; no untrusted data.
  const startedAt = now();
  const state = readState(ctx.checkpoint);
  const tools = deps.tools.list();
  const toolNames = new Set(tools.map((t) => t.name));
  const system = buildSystemPrompt(tools, limits.maxSteps);

  const emit = async (kind: string, message: string, data: Record<string, unknown> = {}) => {
    try {
      await ctx.event(kind, clip(message, 1000), data);
    } catch (error) {
      if (error instanceof LostLeaseError) throw error;
      /* the feed is best-effort; it must never change the run's outcome */
    }
  };
  const finish = async (outcome: RunOutcome): Promise<RunOutcome> => {
    await emit("run_finished", outcome.summary ?? outcome.error ?? outcome.status, {
      status: outcome.status,
      steps: state.step,
    });
    return outcome;
  };
  const checkpoint = () =>
    ctx.save({ ...ctx.checkpoint, loop: { step: state.step, history: state.history.slice(-limits.maxHistory), spent: state.spent } }, state.spent);
  const push = (message: LoopMessage) => {
    state.history.push(message);
  };

  if (state.history.length === 0) push({ role: "user", content: `Goal: ${ctx.run.goal}` });
  await emit("run_started", state.step === 0 ? "Started working on the goal." : `Resumed after step ${state.step}.`, {
    resumedFromStep: state.step,
  });

  try {
    while (true) {
      if (state.step >= limits.maxSteps)
        return await finish({
          status: "failed",
          error: `I stopped after ${limits.maxSteps} steps without finishing. Nothing further was changed. Try a smaller goal.`,
        });
      if (now() - startedAt > limits.maxWallMs)
        return await finish({
          status: "failed",
          error: "I stopped because this run took longer than its time limit. Anything already done is listed in the activity feed.",
        });

      // ---- ask the model (one re-ask when the reply is unusable) ----
      let step = null as ReturnType<typeof parseNextStep> | null;
      let problem = "";
      for (let attempt = 0; attempt <= limits.malformedRetries; attempt++) {
        let reply;
        try {
          reply = await deps.askModel({ system, messages: state.history, run: ctx.run });
        } catch (error) {
          if (error instanceof LoopBudgetError)
            return await finish({
              status: "needs_input",
              summary: `${error.message} Raise the run budget or narrow the goal and I'll continue.`,
            });
          throw error;
        }
        state.spent += reply.costMicrocents ?? 0;
        step = parseNextStep(reply.data);
        if (step.ok) {
          push({ role: "assistant", content: JSON.stringify(reply.data) });
          break;
        }
        problem = step.error;
        await emit("model_reply_rejected", `The model's reply could not be used: ${problem}`, { attempt: attempt + 1 });
        push({ role: "assistant", content: JSON.stringify(reply.data ?? null) });
        push({ role: "user", content: `That reply was not valid. ${problem}` });
      }
      if (!step || !step.ok)
        return await finish({
          status: "failed",
          error: "The AI gave a reply I couldn't act on twice in a row, so I stopped. Nothing was changed by that step.",
        });

      const next = step.step;
      if (next.kind === "final") {
        await checkpoint();
        return await finish({ status: next.status, summary: next.summary });
      }

      // ---- run the tool ----
      state.step += 1;
      const stepId = `${ctx.run.id}:${state.step}`;
      if (!toolNames.has(next.tool)) {
        await emit("tool_unknown", `The AI asked for "${clip(next.tool, 60)}", which isn't available.`, { tool: next.tool.slice(0, 60) });
        push({ role: "user", content: formatObservation(next.tool, { ok: false, payload: { error: "That tool is not available.", available: [...toolNames] } }) });
        await checkpoint();
        continue;
      }

      await emit("tool_started", next.why ? `${next.tool}: ${next.why}` : `Using ${next.tool}.`, { tool: next.tool, step: state.step });
      let result: ToolResultV2 | null = null;
      for (let attempt = 0; attempt <= limits.toolTimeoutRetries; attempt++) {
        result = await runWithTimeout(
          () => deps.tools.run({ name: next.tool, args: next.args, requestId: `${stepId}:${attempt + 1}`, stepId }),
          limits.toolTimeoutMs,
          next.tool,
        );
        if (result.ok || result.reason !== "timeout") break;
        await emit("tool_timeout", `${next.tool} timed out${attempt < limits.toolTimeoutRetries ? "; trying once more" : ""}.`, { tool: next.tool, attempt: attempt + 1 });
        if (attempt < limits.toolTimeoutRetries) await sleep(500 * (attempt + 1));
      }
      if (!result) throw new Error("tool produced no result");

      if (!result.ok) {
        if (result.reason === "needs_approval")
          return await finish({
            status: "needs_approval",
            summary: `I need your approval before using ${next.tool}. Nothing was sent.`,
          });
        if (result.reason === "timeout")
          return await finish({
            status: "failed",
            error: `${next.tool} didn't answer in time, even after a retry. I stopped; nothing further was changed.`,
          });
        await emit("tool_failed", `${next.tool} failed: ${result.error}`, { tool: next.tool, reason: result.reason });
        push({ role: "user", content: formatObservation(next.tool, { ok: false, payload: { reason: result.reason, error: result.error } }) });
        await checkpoint();
        continue;
      }

      await emit("tool_finished", `${next.tool} finished${result.replayed ? " (already done earlier)" : ""}.`, {
        tool: next.tool,
        risk: result.risk,
        replayed: result.replayed,
        durationMs: result.durationMs,
      });
      push({ role: "user", content: formatObservation(next.tool, { ok: true, payload: result.data }) });

      // ---- verify writes ----
      if (result.risk === "write_internal" && !result.replayed) {
        if (!deps.verifyWrite) {
          await emit("verify_skipped", `${next.tool} changed something and no check was available, so I can't confirm it.`, { tool: next.tool });
          push({ role: "user", content: "NOTE: that change was not verified. Do not say it is confirmed." });
        } else {
          let verdict: { ok: boolean; detail: string };
          try {
            verdict = await deps.verifyWrite({ tool: next.tool, args: next.args, result });
          } catch (error) {
            if (error instanceof LostLeaseError) throw error;
            verdict = { ok: false, detail: "The check itself failed." };
          }
          await emit(verdict.ok ? "verify_passed" : "verify_failed", `${next.tool}: ${verdict.detail}`, { tool: next.tool, ok: verdict.ok });
          push({ role: "user", content: `VERIFICATION ${verdict.ok ? "passed" : "FAILED"}: ${clip(verdict.detail, 500)}` });
        }
      }
      await checkpoint();
    }
  } catch (error) {
    if (error instanceof LostLeaseError) throw error;
    return await finish({
      status: "failed",
      error: "The run hit an unexpected problem and was stopped. Nothing was sent to customers.",
    });
  }
}

async function runWithTimeout(run: () => Promise<ToolResultV2>, ms: number, tool: string): Promise<ToolResultV2> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ToolResultV2>((resolve) => {
    timer = setTimeout( // DevSkim: ignore DS172411 -- Fixed callback and numeric delay; no untrusted data.
      () => resolve({ ok: false, tool, risk: null, reason: "timeout", error: `${tool} timed out.`, durationMs: ms }),
      ms,
    );
  });
  try {
    return await Promise.race([run(), timeout]);
  } catch (error) {
    if (error instanceof LostLeaseError) throw error;
    return { ok: false, tool, risk: null, reason: "failed", error: `${tool} failed unexpectedly.`, durationMs: 0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Builds the executor the run store calls. `build` supplies per-run model and tools. */
export function createAgentLoopExecutor(build: (run: AgentRun) => Promise<LoopDeps> | LoopDeps): RunExecutor {
  return async (ctx) => runAgentLoop(ctx, await build(ctx.run));
}

/** Registers the loop with the run store. Called once by the worker wiring, not at import time. */
export function installAgentLoop(build: (run: AgentRun) => Promise<LoopDeps> | LoopDeps): void {
  registerAgentRunExecutor(createAgentLoopExecutor(build));
}
