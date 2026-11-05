/**
 * PAI-3 production install: the one place the agent loop is wired together.
 *
 * Behind `AGENT_LOOP_ENABLED` (default OFF). With the flag off nothing is
 * registered, no executor exists, and the worker route behaves exactly as it did
 * before. With it on, `installAgentLoopWithMemory` registers one executor built from:
 *
 *  - memory (PAI-10): recall before the run, proposals after it;
 *  - approvals (PAI-4): ONE `createAgentApprovalWiring` feeds both the tool
 *    registry (`send_external` tools run only on an approved, unused approval)
 *    and the loop (which files the owner's approval request and pauses);
 *  - limits (PAI-5): the registry's tool groups are wrapped in the per-minute and
 *    kill-switch guard once (inside `agentTools`), and the loop gets `runLimits`
 *    for admission, the per-step kill-switch check and slot release. The loop does
 *    not count tool calls and the memory step does not re-admit, so nothing is
 *    counted twice;
 *  - PAI-11 writes: stripped from routine-source and no_external_actions runs so
 *    read-only routine presets cannot change leads, quotes, bookings, or automations;
 *  - spend: the run's own ceiling plus Luna's caps (`createAskModel`).
 *
 * Tools get a workspace-pinned, read-only database client built from the run's
 * workspace, never from anything the model says. Runs with no owner are refused
 * tool access. Server-only.
 */
import { createAgentApprovalWiring } from "@/lib/agent/loop-approvals.server";
import { createAskModel, type AskModelOptions } from "@/lib/agent/agent-model.server";
import { installAgentLoopWithMemory, type MemoryStepConfig } from "@/lib/agent/memory-step.server";
import {
  resolveLimits,
  sweepKillSwitches,
  supabaseLimitsDeps,
  type LimitsDeps,
} from "@/lib/agent/limits.server";
import { supabaseApprovalRepo, type ApprovalDeps } from "@/lib/agent/approvals.server";
import type { LoopDeps } from "@/lib/agent/loop.server";
import type { AgentRun } from "@/lib/agent/run-store.server";
import {
  createDefaultToolRegistryV2,
  type ToolAuditEntry,
  type ToolContextV2,
} from "@/lib/ai/tool-registry-v2.server";
import {
  runAllowsWriteInternalTools,
  writeInternalToolNames,
} from "@/lib/agent/tools/write-policy";

export const AGENT_LOOP_FLAG = "AGENT_LOOP_ENABLED";

type Env = Record<string, string | undefined>;

/** Only an explicit "1", "true", "on" or "yes" turns it on. Anything else, or nothing, is off. */
export function agentLoopEnabled(env: Env = process.env): boolean {
  const raw = (env[AGENT_LOOP_FLAG] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

type DbLike = { from: (table: string) => unknown };

/**
 * What a tool may use as its database: reads of one workspace only. Every select
 * is pinned to the run's workspace before the tool adds its own filters, and any
 * write (insert, update, delete, upsert) or rpc is refused outright.
 */
export function workspaceReadClient(admin: DbLike, organizationId: string) {
  return {
    from(table: string) {
      const base = admin.from(table) as Record<string, unknown>;
      return new Proxy(base, {
        get(target, prop) {
          if (prop === "select") {
            return (...args: unknown[]) => {
              const query = (
                target["select"] as (...a: unknown[]) => { eq: (c: string, v: unknown) => unknown }
              )(...args);
              return query.eq("organization_id", organizationId);
            };
          }
          throw new Error("The assistant's workspace client is read-only.");
        },
      });
    },
  };
}

export type LoopInstallDeps = {
  env?: Env;
  limits?: LimitsDeps;
  approvals?: ApprovalDeps;
  /** The database tools read from, per workspace. Default: the workspace-pinned read client over the service client. */
  client?: (organizationId: string) => Promise<DbLike> | DbLike;
  model?: Partial<AskModelOptions>;
  memory?: MemoryStepConfig;
  audit?: (entry: ToolAuditEntry) => Promise<void>;
  /** Test seam. */
  install?: typeof installAgentLoopWithMemory;
};

async function serviceClient() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as DbLike;
}

/** Builds what the loop needs for one run. Everything is resolved once per install, then per run. */
export function createLoopBuilder(deps: LoopInstallDeps = {}) {
  const limits = deps.limits ?? supabaseLimitsDeps();
  let approvalDeps = deps.approvals ?? null;
  const readClient =
    deps.client ?? (async (orgId: string) => workspaceReadClient(await serviceClient(), orgId));

  const capFor = async (run: AgentRun) =>
    (await resolveLimits(run.organization_id, limits)).runBudgetMicrocents;

  // One approvals service, one registry, tools wrapped in the limits once.
  const lazy = async () => {
    approvalDeps ??= { repo: supabaseApprovalRepo(await serviceClient()) };
    const wiring = createAgentApprovalWiring(approvalDeps);
    const registry = createDefaultToolRegistryV2({
      approvals: wiring.registry,
      limits,
      ...(deps.audit ? { audit: deps.audit } : {}),
    });
    return { wiring, registry };
  };
  let built: ReturnType<typeof lazy> | null = null;

  return async function build(run: AgentRun): Promise<LoopDeps> {
    const { wiring, registry } = await (built ??= lazy());
    const allowWrites = runAllowsWriteInternalTools(run);
    const writeNames = writeInternalToolNames();
    return {
      askModel: createAskModel(run, { capFor, ...deps.model }),
      tools: {
        list: () =>
          registry
            .list({ isSuperAdmin: false })
            .filter((tool) => allowWrites || !writeNames.has(tool.name)),
        run: async (call) => {
          if (!run.user_id)
            return {
              ok: false,
              tool: call.name,
              risk: null,
              reason: "forbidden",
              error: "This run has no owner, so it can't use workspace tools.",
              durationMs: 0,
            };
          if (!allowWrites && writeNames.has(call.name))
            return {
              ok: false,
              tool: call.name,
              risk: "write_internal",
              reason: "forbidden",
              error:
                "Scheduled and read-only runs can't change workspace data. Ask the owner to make that change in chat.",
              durationMs: 0,
            };
          const context = {
            supabase: await readClient(run.organization_id),
            userId: run.user_id,
            organizationId: run.organization_id,
            isSuperAdmin: false,
            runId: run.id,
            stepId: call.stepId,
          } as unknown as ToolContextV2;
          return registry.run(context, {
            name: call.name,
            arguments: call.args,
            requestId: call.requestId,
          });
        },
      },
      approvals: wiring.loop,
      runLimits: limits,
    };
  };
}

let installed = false;

/** For tests only. */
export function resetAgentLoopInstall() {
  installed = false;
}

/**
 * Registers the loop with the run store when the flag is on. Safe to call on
 * every worker tick: it registers once, and does nothing at all when the flag is off.
 */
export async function ensureAgentLoopInstalled(deps: LoopInstallDeps = {}): Promise<boolean> {
  if (!agentLoopEnabled(deps.env ?? process.env)) return false;
  if (installed) return true;
  const memory: MemoryStepConfig =
    deps.memory ??
    (await (async () => {
      const admin = await serviceClient();
      return { db: admin as never, vectors: { admin: admin as never } };
    })());
  (deps.install ?? installAgentLoopWithMemory)(createLoopBuilder(deps), memory);
  installed = true;
  return true;
}

/**
 * Worker tick helper: with the flag on, cancels queued runs when a kill switch
 * is on. A run already working stops at its next step. Does nothing with the flag off.
 */
export async function sweepAgentKillSwitches(deps: Pick<LoopInstallDeps, "env" | "limits"> = {}) {
  if (!agentLoopEnabled(deps.env ?? process.env)) return null;
  try {
    return await sweepKillSwitches(deps.limits ?? supabaseLimitsDeps());
  } catch (error) {
    // The sweep is housekeeping; the worker tick must still run. Admission re-checks the switches anyway.
    console.error("[agent-loop] kill-switch sweep failed", (error as Error).message);
    return null;
  }
}
