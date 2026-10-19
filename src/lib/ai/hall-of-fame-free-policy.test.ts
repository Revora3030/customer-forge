import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freeAiOnly, paidCollectiveAllowed, type FreeOnlyEnvironment } from "@/lib/ai/free-only-policy.server";

const mocks = vi.hoisted(() => ({ paid: vi.fn(), registry: vi.fn(), pinned: vi.fn(), trace: vi.fn() }));
vi.mock("@/lib/ai/luna.server", () => ({ callCollective: mocks.paid }));
vi.mock("@/lib/ai/registry.server", () => ({ buildFreeModelRegistry: mocks.registry }));
vi.mock("@/lib/ai/router.server", () => ({ callPinnedFreeModel: mocks.pinned, extractJsonObject: () => null }));
vi.mock("@/lib/ai/telemetry.server", () => ({ recordTeamStep: mocks.trace }));
vi.mock("@/lib/ai/free-reputation", () => ({
  freeModelForm: () => ({ score: 0 }), recordFreeModelOutcome: vi.fn(),
}));
import { callBestThinker, resetHallOfFameRuns } from "@/lib/ai/hall-of-fame.server";
import { withAiSpendScope } from "@/lib/ai/spend-scope.server";

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

describe("paid collective gate (owner: paid for the hardest steps, up to a daily cap)", () => {
  it("allows paid for hard steps by default and keeps high-volume steps free", () => {
    expect(paidCollectiveAllowed("creative_direction", {})).toBe(true);
    expect(paidCollectiveAllowed("adversarial_review", {})).toBe(true);
    expect(paidCollectiveAllowed("metadata", {})).toBe(false);
    expect(paidCollectiveAllowed("seo_analysis", {})).toBe(false);
  });
  it("forces free-only when a flag says so or the daily cap is $0", () => {
    expect(paidCollectiveAllowed("creative_direction", { AI_FREE_ONLY: "true" })).toBe(false);
    expect(paidCollectiveAllowed("creative_direction", { ZERO_COST_ONLY: "1" })).toBe(false);
    expect(paidCollectiveAllowed("creative_direction", { AI_PAID_DAILY_CAP_USD: "0" })).toBe(false);
    expect(paidCollectiveAllowed("creative_direction", { AI_FREE_ONLY: "maybe" })).toBe(false);
  });
  it("opens every purpose when free-only is explicitly turned off", () => {
    expect(paidCollectiveAllowed("metadata", { AI_FREE_ONLY: "false" })).toBe(true);
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

  it("skips the paid collective when free-only is forced and uses the free specialist", async () => {
    vi.stubEnv("AI_FREE_ONLY", "true");
    expect(await callBestThinker(request)).toMatchObject({ ok: true, lane: "free", downgraded: false });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.pinned).toHaveBeenCalledTimes(1);
  });
  it("does not use paid fallback when the free squad is empty", async () => {
    vi.stubEnv("AI_FREE_ONLY", "true");
    mocks.registry.mockResolvedValue([]);
    expect(await callBestThinker(request)).toMatchObject({ ok: false, reason: "no_free_model" });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.pinned).not.toHaveBeenCalled();
  });
  it("keeps direct OpenAI and Google entries out of the strict squad", async () => {
    vi.stubEnv("AI_FREE_ONLY", "true");
    mocks.registry.mockResolvedValue([
      { provider: "openai", model: "paid-origin-test", capabilities: ["design"], weight: 99, health: { healthy: true }, quota: { remainingToday: 10 } },
      { provider: "google", model: "google-origin-test", capabilities: ["design"], weight: 98, health: { healthy: true }, quota: { remainingToday: 10 } },
    ]);
    expect(await callBestThinker(request)).toMatchObject({ ok: false, reason: "no_free_model" });
    expect(mocks.paid).not.toHaveBeenCalled();
    expect(mocks.pinned).not.toHaveBeenCalled();
  });
  it("walks the wider squad without ever reaching OpenAI or Google or the paid lane", async () => {
    vi.stubEnv("AI_FREE_ONLY", "true");
    const entry = (provider: string, model: string, weight: number) => ({
      provider, model, capabilities: ["design"], weight, health: { healthy: true }, quota: { remainingToday: 10 },
    });
    mocks.registry.mockResolvedValue([
      entry("openai", "direct-openai", 99), entry("google", "direct-google", 98),
      ...Array.from({ length: 12 }, (_, i) => entry(`free${i}`, `free-model-${i}`, 90 - i)),
    ]);
    mocks.pinned.mockRejectedValue(Object.assign(new Error("bad"), { category: "bad_response" }));
    expect(await callBestThinker(request)).toMatchObject({ ok: false, reason: "squad_exhausted" });
    const providers = mocks.pinned.mock.calls.map((call) => (call[1] as { provider: string }).provider);
    expect(providers).toHaveLength(12);
    expect(providers.some((p) => p === "openai" || p === "google")).toBe(false);
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("uses the paid collective for a hard step by default, within the daily cap", async () => {
    mocks.paid.mockResolvedValue({ ok: true, tier: "sol", wanted: "sol", downgraded: false, text: "Paid answer", model: "paid-test", costMicrocents: 1 });
    expect(await callBestThinker(request)).toMatchObject({ ok: true, lane: "paid" });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
  });
  it("keeps a high-volume step on the free pool by default", async () => {
    const outcome = await callBestThinker({ ...request, purpose: "metadata" });
    expect(outcome).not.toMatchObject({ lane: "paid" });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("preserves the optional paid path only after explicit opt-out", async () => {
    vi.stubEnv("AI_FREE_ONLY", "false");
    mocks.paid.mockResolvedValue({ ok: true, tier: "sol", wanted: "sol", downgraded: false, text: "Explicitly enabled paid answer", model: "paid-test", costMicrocents: 1 });
    expect(await callBestThinker(request)).toMatchObject({ ok: true, lane: "paid" });
    expect(mocks.paid).toHaveBeenCalledTimes(1);
    expect(mocks.pinned).not.toHaveBeenCalled();
  });
  it("skips the paid collective for a hard step inside a free-only spending scope (demo builds)", async () => {
    vi.stubEnv("AI_FREE_ONLY", "false");
    mocks.paid.mockResolvedValue({ ok: true, tier: "sol", wanted: "sol", downgraded: false, text: "Paid answer", model: "paid-test", costMicrocents: 1 });
    const outcome = await withAiSpendScope({ freeOnly: true, reason: "demo_workspace" }, () => callBestThinker(request));
    expect(outcome).toMatchObject({ ok: true, lane: "free", downgraded: false });
    expect(mocks.paid).not.toHaveBeenCalled();
    // Outside the scope the same request may use paid again.
    expect(await callBestThinker(request)).toMatchObject({ ok: true, lane: "paid" });
  });
});
