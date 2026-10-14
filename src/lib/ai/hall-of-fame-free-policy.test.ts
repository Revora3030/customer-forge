import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freeAiOnly, type FreeOnlyEnvironment } from "@/lib/ai/free-only-policy.server";

const mocks = vi.hoisted(() => ({ paid: vi.fn(), registry: vi.fn(), pinned: vi.fn(), trace: vi.fn() }));
vi.mock("@/lib/ai/luna.server", () => ({ callCollective: mocks.paid }));
vi.mock("@/lib/ai/registry.server", () => ({ buildFreeModelRegistry: mocks.registry }));
vi.mock("@/lib/ai/router.server", () => ({ callPinnedFreeModel: mocks.pinned }));
vi.mock("@/lib/ai/telemetry.server", () => ({ recordTeamStep: mocks.trace }));
vi.mock("@/lib/ai/free-reputation", () => ({
  freeModelForm: () => ({ score: 0 }), recordFreeModelOutcome: vi.fn(),
}));
import { callBestThinker, resetHallOfFameRuns } from "@/lib/ai/hall-of-fame.server";

const cases: Array<[FreeOnlyEnvironment, boolean]> = [
  [{}, true],
  [{ AI_FREE_ONLY: "true" }, true],
  [{ AI_FREE_ONLY: "false" }, false],
  [{ FREE_AI_ONLY: "false" }, false],
  [{ ZERO_COST_ONLY: "off" }, false],
  [{ AI_FREE_ONLY: "  FALSE  " }, false],
  [{ AI_FREE_ONLY: "tru" }, true],
  [{ AI_FREE_ONLY: "" }, true],
  [{ AI_FREE_ONLY: "false", FREE_AI_ONLY: "true" }, true],
  [{ AI_FREE_ONLY: "false", ZERO_COST_ONLY: "unexpected" }, true],
];

describe("free-only flag policy", () => {
  it.each(cases)("handles configuration %j conservatively", (environment, expected) => {
    expect(freeAiOnly(environment)).toBe(expected);
  });
});

describe("Hall of Fame spending boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AI_FREE_ONLY", undefined);
    vi.stubEnv("FREE_AI_ONLY", undefined);
    vi.stubEnv("ZERO_COST_ONLY", undefined);
    resetHallOfFameRuns();
    mocks.paid.mockRejectedValue(new Error("Paid collective must not run in free-only mode."));
    mocks.registry.mockResolvedValue([{
      provider: "groq", model: "openai/gpt-oss-120b",
      capabilities: ["design", "planning", "reasoning", "critique"],
      weight: 90, health: { healthy: true }, quota: { remainingToday: 10 },
    }]);
    mocks.pinned.mockResolvedValue({ text: "Free specialist answer", data: null, latencyMs: 1 });
  });
  afterEach(() => vi.unstubAllEnvs());
  const request = { purpose: "creative_direction" as const, system: "Design safely.", user: "Plan a business site." };

  it("skips the paid collective by default and uses the free specialist", async () => {
    expect(await callBestThinker(request)).toMatchObject({ ok: true, lane: "free", downgraded: false });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.pinned).toHaveBeenCalledTimes(1);
  });
  it("does not use paid fallback when the free squad is empty", async () => {
    mocks.registry.mockResolvedValue([]);
    expect(await callBestThinker(request)).toMatchObject({ ok: false, reason: "no_free_model" });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.pinned).not.toHaveBeenCalled();
  });
  it("keeps direct OpenAI and Google entries out of the strict squad", async () => {
    mocks.registry.mockResolvedValue([
      { provider: "openai", model: "paid-origin-test", capabilities: ["design"], weight: 99, health: { healthy: true }, quota: { remainingToday: 10 } },
      { provider: "google", model: "google-origin-test", capabilities: ["design"], weight: 98, health: { healthy: true }, quota: { remainingToday: 10 } },
    ]);
    expect(await callBestThinker(request)).toMatchObject({ ok: false, reason: "no_free_model" });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.pinned).not.toHaveBeenCalled();
  });
  it("preserves the optional paid path only after explicit opt-out", async () => {
    vi.stubEnv("AI_FREE_ONLY", "false");
    mocks.paid.mockResolvedValue({ ok: true, tier: "sol", wanted: "sol", downgraded: false, text: "Explicitly enabled paid answer", model: "paid-test", costMicrocents: 1 });
    expect(await callBestThinker(request)).toMatchObject({ ok: true, lane: "paid" });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
    expect(mocks.pinned).not.toHaveBeenCalled();
  });
});
