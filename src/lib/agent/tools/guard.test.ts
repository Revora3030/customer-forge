import { describe, expect, it } from "vitest";
import type { LimitsDeps } from "@/lib/agent/limits.server";
import { createDefaultToolRegistryV2, type ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const SIX = [
  "campaigns.list",
  "campaigns.results",
  "automations.list",
  "automations.history",
  "analytics.summary",
  "domain.status",
];

function limits({ enabled = true, used = 0, env = {} as Record<string, string> } = {}): LimitsDeps {
  return {
    env,
    store: {
      getSettings: async () => ({ enabled, reason: null }),
      getOverrides: async () => ({}),
      listDisabledOrganizations: async () => [],
    },
    ledger: {
      admit: async () => ({ admitted: true, reason: "ok", inFlight: 0, runsLastHour: 0 }),
      markStarted: async () => true,
      markFinished: async () => true,
      cancelQueued: async () => [],
    },
    toolCalls: { countSince: async () => used },
  } as LimitsDeps;
}

const context = {
  supabase: {
    from: () => {
      throw new Error("tool body must not run");
    },
  },
  userId: "u",
  organizationId: ORG,
  isSuperAdmin: false,
  runId: "33333333-3333-4333-8333-333333333333",
  stepId: "44444444-4444-4444-8444-444444444444",
} as unknown as ToolContextV2;

const call = (name: string) => ({ name, arguments: {}, requestId: "r1" }) as never;

describe("agent tools go through the PAI-5 limits", () => {
  it("are in the default registry", () => {
    const registry = createDefaultToolRegistryV2({
      audit: async () => undefined,
      limits: limits(),
    });
    for (const name of SIX) expect(registry.find(name)).not.toBeNull();
  });

  for (const [label, deps] of [
    ["workspace switched off", limits({ enabled: false })],
    ["global kill switch", limits({ env: { AGENT_RUNS_DISABLED: "1" } })],
    ["per-minute limit reached", limits({ used: 100_000 })],
  ] as const) {
    it(`refuse every tool when ${label}, without touching data`, async () => {
      const registry = createDefaultToolRegistryV2({ audit: async () => undefined, limits: deps });
      for (const name of SIX) {
        const result = await registry.run(context, call(name));
        expect(result.ok).toBe(false);
        expect(result.ok ? "" : result.error).not.toContain("tool body must not run");
      }
    });
  }

  it("let the call through when allowed", async () => {
    const registry = createDefaultToolRegistryV2({
      audit: async () => undefined,
      limits: limits(),
    });
    const result = await registry.run(context, call("domain.status"));
    expect(result.ok ? "" : result.error).toContain("tool body must not run");
  });
});
