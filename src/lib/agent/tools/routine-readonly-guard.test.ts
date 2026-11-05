/**
 * Routine / background runs must not expose PAI-11 write_internal tools
 * (or undo helpers) to the model. Depends on write-policy.ts + loop-install
 * filtering from New Bot 1's pai-11-routine-undo-fixes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_LOOP_FLAG,
  createLoopBuilder,
  resetAgentLoopInstall,
  workspaceReadClient,
  type LoopInstallDeps,
} from "@/lib/agent/loop-install.server";
import { registerAgentRunExecutor, type AgentRun } from "@/lib/agent/run-store.server";
import type { ApprovalRepo, ApprovalRow } from "@/lib/agent/approvals.server";
import type { AdmitResult, LimitsDeps } from "@/lib/agent/limits.server";
import {
  runAllowsWriteInternalTools,
  writeInternalToolNames,
} from "@/lib/agent/tools/write-policy";

const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: "run-rrg",
  organization_id: ORG,
  user_id: OWNER,
  goal: "Weekly digest of leads.",
  source: "owner",
  status: "processing",
  attempts: 1,
  max_attempts: 3,
  fence: 1,
  checkpoint: {},
  budget_cap: null,
  budget_used: 0,
  result_summary: null,
  error_plain: null,
  ...over,
});

afterEach(() => {
  registerAgentRunExecutor(null);
  resetAgentLoopInstall();
  vi.restoreAllMocks();
});

function approvalRepo(): ApprovalRepo {
  return {
    async request() {
      return {
        approval: {
          id: "00000000-0000-4000-8000-000000000001",
          organization_id: ORG,
          scope: "run",
          run_id: "run-rrg",
          step_id: null,
          requested_by: OWNER,
          tool: "x",
          args: {},
          args_hash: "h",
          summary: "s",
          status: "pending",
          created_at: "",
          expires_at: "",
          decided_by: null,
          decided_at: null,
          consumed_at: null,
        } as ApprovalRow,
        created: true,
      };
    },
    async decide() {
      return { outcome: "not_found", approval: null };
    },
    async consume() {
      return { outcome: "not_found", approval: null };
    },
    async cancelForRun() {
      return 0;
    },
    async sweep() {
      return 0;
    },
  };
}

function limits(): LimitsDeps {
  return {
    env: {},
    store: {
      getSettings: vi.fn(async () => ({ enabled: true, reason: null })),
      getOverrides: async () => ({}),
      listDisabledOrganizations: vi.fn(async () => []),
    },
    ledger: {
      admit: vi.fn(async () => ({ admitted: true, reason: "ok", inFlight: 1, runsLastHour: 1 }) as AdmitResult),
      markStarted: vi.fn(async () => true),
      markFinished: vi.fn(async () => true),
      cancelQueued: vi.fn(async () => []),
    },
    toolCalls: { countSince: vi.fn(async () => 0) },
  } as unknown as LimitsDeps;
}

function installDeps(): LoopInstallDeps {
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
        if (prop === "eq") return () => chain;
        return () => chain;
      },
    },
  );
  const admin = {
    from: () => ({
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
      upsert: () => chain,
    }),
  };
  return {
    env: { [AGENT_LOOP_FLAG]: "1" },
    limits: limits(),
    approvals: { repo: approvalRepo() },
    client: (org) => workspaceReadClient(admin, org),
    model: {
      call: vi.fn(async () => ({ data: { final: { status: "done", summary: "x" } }, usage: { inputTokens: 1, outputTokens: 1 } })),
      pricing: { estimate: () => 1, cost: () => 1, failureCharge: () => 0 },
      ledger: { reserve: vi.fn(async () => ({ allowed: true })), settle: vi.fn(async () => undefined) } as never,
    },
  };
}

function installedNames(tools: { name: string }[]): Set<string> {
  return new Set(tools.map((t) => t.name));
}

function assertReadOnlyInstall(names: Set<string>, writeNames: Set<string>) {
  const overlap = [...writeNames].filter((n) => names.has(n));
  expect(overlap, `write tools leaked into install: ${overlap.join(", ")}`).toEqual([]);
  expect(names.has("leads.restore_notes")).toBe(false);
  expect(names.has("leads.delete_task")).toBe(false);
}

describe("routine-tools read-only guard", () => {
  it("runAllowsWriteInternalTools is false for routine and no_external_actions", () => {
    expect(runAllowsWriteInternalTools({ source: "routine", checkpoint: {} })).toBe(false);
    expect(
      runAllowsWriteInternalTools({
        source: "owner",
        checkpoint: { routine: { send_policy: "no_external_actions" } },
      }),
    ).toBe(false);
    expect(runAllowsWriteInternalTools({ source: "owner", checkpoint: {} })).toBe(true);
  });

  it("installed tools for routine and no_external_actions never include writeInternalToolNames or undo helpers", async () => {
    const writeNames = writeInternalToolNames();
    expect(writeNames.size).toBeGreaterThan(0);
    expect(writeNames.has("leads.update_status")).toBe(true);
    // Undo helpers are not model-callable writes.
    expect(writeNames.has("leads.restore_notes")).toBe(false);
    expect(writeNames.has("leads.delete_task")).toBe(false);

    const build = createLoopBuilder(installDeps());

    const routine = await build(run({ source: "routine" }));
    assertReadOnlyInstall(installedNames(routine.tools.list()), writeNames);

    const noExt = await build(
      run({
        source: "owner",
        checkpoint: { routine: { send_policy: "no_external_actions" } },
      }),
    );
    assertReadOnlyInstall(installedNames(noExt.tools.list()), writeNames);

    // Owner chat still gets writes (sanity: policy is not global).
    const owner = await build(run({ source: "owner", checkpoint: {} }));
    const ownerNames = installedNames(owner.tools.list());
    expect([...writeNames].some((n) => ownerNames.has(n))).toBe(true);
    expect(ownerNames.has("leads.restore_notes")).toBe(false);
    expect(ownerNames.has("leads.delete_task")).toBe(false);
  });
});
