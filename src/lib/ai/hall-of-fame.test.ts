import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CollectivePurpose } from "@/lib/ai/collective";
import {
  capabilityForPurpose,
  rankHallOfFame,
  roleForPurpose,
  spreadProviders,
  type HallOfFameCandidate,
} from "@/lib/ai/hall-of-fame";

const mocks = vi.hoisted(() => ({ registry: vi.fn(), pinned: vi.fn() }));
vi.mock("@/lib/ai/luna.server", () => ({ callCollective: vi.fn() }));
vi.mock("@/lib/ai/registry.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/registry.server")>()),
  buildFreeModelRegistry: mocks.registry,
}));
vi.mock("@/lib/ai/router.server", async () => {
  const { extractJsonObject } = await vi.importActual<typeof import("@/lib/ai/router.server")>("@/lib/ai/router.server");
  return { callPinnedFreeModel: mocks.pinned, extractJsonObject };
});
vi.mock("@/lib/ai/telemetry.server", () => ({ recordTeamStep: vi.fn() }));
vi.mock("@/lib/ai/free-reputation", () => ({
  freeModelForm: () => ({ score: 0 }),
  recordFreeModelOutcome: vi.fn(),
}));
import { inferCapabilities } from "@/lib/ai/registry.server";
import { callHallOfFame, resetHallOfFameRuns } from "@/lib/ai/hall-of-fame.server";

const candidate = (
  provider: string,
  model: string,
  weight: number,
  extra?: Partial<HallOfFameCandidate>,
): HallOfFameCandidate => ({
  provider,
  model,
  weight,
  capabilities: ["planning", "reasoning", "design", "copy", "critique"],
  healthy: true,
  remainingToday: null,
  ...extra,
});

describe("hall of fame roster", () => {
  it("routes each purpose to a pool and a real capability", () => {
    expect(roleForPurpose("creative_direction")).toBe("design");
    expect(roleForPurpose("visual_review")).toBe("vision");
    expect(roleForPurpose("small_edit")).toBe("fast");
    expect(roleForPurpose("synthesis")).toBe("primary");
    expect(capabilityForPurpose("adversarial_review")).toBe("critique");
    expect(capabilityForPurpose("seo_analysis")).toBe("seo");
    expect(capabilityForPurpose("information_architecture")).toBe("planning");
  });

  it("drops models that cannot serve the capability", () => {
    const squad = rankHallOfFame({
      purpose: "seo_analysis",
      candidates: [
        candidate("groq", "big-70b", 80, { capabilities: ["copy"] }),
        candidate("nvidia", "seo-32b", 66, { capabilities: ["seo"] }),
      ],
    });
    expect(squad.map((entry) => entry.model)).toEqual(["seo-32b"]);
  });

  it("puts the strongest ready model first", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "small", 40),
        candidate("groq", "huge", 95),
        candidate("groq", "mid", 66),
      ],
    });
    expect(squad.map((entry) => entry.model)).toEqual(["huge", "mid", "small"]);
  });

  it("sinks resting providers and spent allowances behind ready ones", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "resting-huge", 95, { healthy: false }),
        candidate("nvidia", "spent-huge", 92, { remainingToday: 0 }),
        candidate("llm7", "ready-mid", 60),
      ],
    });
    expect(squad[0]?.model).toBe("ready-mid");
  });

  it("spreads consecutive attempts across providers", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: [
        candidate("groq", "groq-a", 95),
        candidate("groq", "groq-b", 90),
        candidate("nvidia", "nvidia-a", 85),
        candidate("nvidia", "nvidia-b", 80),
      ],
    });
    expect(squad.map((entry) => entry.provider)).toEqual(["groq", "nvidia", "groq", "nvidia"]);
  });

  it("caps the squad size", () => {
    const squad = rankHallOfFame({
      purpose: "creative_direction",
      candidates: Array.from({ length: 40 }, (_, index) =>
        candidate(`p${index % 5}`, `m${index}`, 90 - index),
      ),
      squadSize: 6,
    });
    expect(squad).toHaveLength(6);
  });

  it("keeps every entry when spreading providers", () => {
    const entries = [
      { provider: "a", id: 1 },
      { provider: "a", id: 2 },
      { provider: "b", id: 3 },
    ];
    expect(spreadProviders(entries).map((entry) => entry.id).sort()).toEqual([1, 2, 3]);
  });
});

/* ----------------------- capability guard (3.1a) ----------------------- */

// Typed as a full record so adding a CollectivePurpose without listing it here
// fails the type check, keeping the guard exhaustive.
const EVERY_PURPOSE: Record<CollectivePurpose, true> = {
  creative_direction: true, information_architecture: true, conversion_architecture: true,
  content_strategy: true, content_strategy_targeted_revision: true, visual_review: true,
  repair_priority: true, quality_review: true, adversarial_review: true, synthesis: true,
  hard_request: true, second_opinion: true, page_planning: true, seo_analysis: true,
  design_alternative: true, specialist_review: true, repair_plan: true, plan_review: true,
  funnel_verification: true, site_consistency_audit: true, industry_gap_analysis: true,
  final_review: true, whole_site_review: true, markup_review: true, deep_conversion_audit: true,
  intent: true, extraction: true, classification: true, rewrite: true, small_edit: true,
  metadata: true, schema_markup: true, completeness_check: true,
  mobile_responsiveness_audit: true, performance_audit: true, conversion_friction_audit: true,
  accessibility_audit: true, content_quality_review: true,
};

// Representative free catalogue ids: small, large, coder and vision models.
const SAMPLE_MODELS = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "qwen-2.5-coder-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.2-90b-vision-preview",
];

describe("every purpose can actually be staffed", () => {
  it.each(Object.keys(EVERY_PURPOSE) as CollectivePurpose[])(
    "%s asks for a capability the registry grants in its pool",
    (purpose) => {
      const role = roleForPurpose(purpose);
      const capability = capabilityForPurpose(purpose);
      const producible = SAMPLE_MODELS.some((model) =>
        (inferCapabilities(model, role) as readonly string[]).includes(capability),
      );
      expect(producible, `${purpose} -> ${role}/${capability}`).toBe(true);
    },
  );

  it("staffs the metadata squad from the fast pool (it used to be always empty)", () => {
    expect(capabilityForPurpose("metadata")).toBe("seo");
    const candidates = SAMPLE_MODELS.map((model, index) => ({
      provider: `p${index}`,
      model,
      capabilities: inferCapabilities(model, roleForPurpose("metadata")),
      weight: 50,
      healthy: true,
      remainingToday: null,
    }));
    expect(rankHallOfFame({ purpose: "metadata", candidates }).length).toBeGreaterThan(0);
  });
});

/* -------------------------- squad walk (3.1b/c) -------------------------- */

const registryEntry = (provider: string, model: string, weight: number) => ({
  provider,
  model,
  capabilities: ["design", "planning", "reasoning", "critique", "copy", "seo"],
  weight,
  health: { healthy: true },
  quota: { remainingToday: 10 },
});

describe("Hall of Fame squad walk", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AI_FREE_ONLY", "true");
    vi.stubEnv("HALL_OF_FAME_MAX_ATTEMPTS", undefined);
    vi.stubEnv("HALL_OF_FAME_CHAIN_MS", undefined);
    resetHallOfFameRuns();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  const request = { purpose: "creative_direction" as const, system: "s", user: "u" };

  it("walks past the old 8-member squad until the 9th answers", async () => {
    mocks.registry.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => registryEntry(`prov${i}`, `model-${i}`, 95 - i)),
    );
    mocks.pinned.mockImplementation(async (_caller: unknown, call: { model: string }) => {
      if (call.model === "model-8") return { text: "Ninth member answers", data: null, latencyMs: 1 };
      throw Object.assign(new Error("bad answer"), { category: "bad_response" });
    });
    const outcome = await callHallOfFame(request);
    expect(outcome).toMatchObject({ ok: true, model: "model-8", text: "Ninth member answers" });
    expect(mocks.pinned).toHaveBeenCalledTimes(9);
    expect(outcome.attempts).toHaveLength(9);
  });

  it("skips a provider's other models after a quota or unauthorized failure", async () => {
    mocks.registry.mockResolvedValue([
      registryEntry("groq", "groq-a", 95),
      registryEntry("nvidia", "nvidia-a", 90),
      registryEntry("groq", "groq-b", 85),
      registryEntry("nvidia", "nvidia-b", 80),
      registryEntry("groq", "groq-c", 75),
      registryEntry("cerebras", "cerebras-a", 70),
    ]);
    mocks.pinned.mockImplementation(async (_caller: unknown, call: { provider: string; model: string }) => {
      if (call.provider === "groq") throw Object.assign(new Error("quota spent"), { category: "quota" });
      if (call.provider === "nvidia") throw Object.assign(new Error("key rejected"), { category: "unauthorized" });
      return { text: "Cerebras answers", data: null, latencyMs: 1 };
    });
    const outcome = await callHallOfFame(request);
    expect(outcome).toMatchObject({ ok: true, provider: "cerebras" });
    const called = mocks.pinned.mock.calls.map((call) => (call[1] as { model: string }).model);
    expect(called).toEqual(["groq-a", "nvidia-a", "cerebras-a"]);
  });

  it("does not skip a provider for a single model's bad answer", async () => {
    mocks.registry.mockResolvedValue([registryEntry("groq", "groq-a", 95), registryEntry("groq", "groq-b", 85)]);
    mocks.pinned
      .mockRejectedValueOnce(Object.assign(new Error("bad answer"), { category: "bad_response" }))
      .mockResolvedValueOnce({ text: "second groq model answers", data: null, latencyMs: 1 });
    expect(await callHallOfFame(request)).toMatchObject({ ok: true, model: "groq-b" });
  });

  it("stops at the chain deadline and fails closed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("HALL_OF_FAME_CHAIN_MS", "100000");
    // Isolate the chain deadline from the default per-provider 12s cap.
    vi.stubEnv("HALL_OF_FAME_MEMBER_MS", "100000");
    mocks.registry.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => registryEntry(`prov${i}`, `model-${i}`, 95 - i)),
    );
    mocks.pinned.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 40_000);
      throw Object.assign(new Error("timed out"), { category: "timeout" });
    });
    const outcome = await callHallOfFame(request);
    expect(outcome).toMatchObject({ ok: false, reason: "squad_exhausted" });
    expect(mocks.pinned).toHaveBeenCalledTimes(3);
    if (!outcome.ok) expect(outcome.detail).toContain("chain deadline");
    // Each member is told how much of the chain is left.
    const timeouts = mocks.pinned.mock.calls.map((call) => (call[1] as { timeoutMs: number }).timeoutMs);
    expect(timeouts[0]).toBe(100_000);
    expect(timeouts[2]).toBe(20_000);
  });

  it("honours the attempt cap and a cancelled request", async () => {
    vi.stubEnv("HALL_OF_FAME_MAX_ATTEMPTS", "4");
    mocks.registry.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => registryEntry(`prov${i}`, `model-${i}`, 95 - i)),
    );
    mocks.pinned.mockRejectedValue(Object.assign(new Error("bad"), { category: "bad_response" }));
    const capped = await callHallOfFame(request);
    expect(capped).toMatchObject({ ok: false, reason: "squad_exhausted" });
    expect(mocks.pinned).toHaveBeenCalledTimes(4);

    mocks.pinned.mockClear();
    const controller = new AbortController();
    controller.abort();
    expect(await callHallOfFame({ ...request, signal: controller.signal })).toMatchObject({ ok: false });
    expect(mocks.pinned).not.toHaveBeenCalled();
  });

  it("keeps an explicit small squad (independent reviewers) small", async () => {
    mocks.registry.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => registryEntry(`prov${i}`, `model-${i}`, 95 - i)),
    );
    mocks.pinned.mockRejectedValue(Object.assign(new Error("bad"), { category: "bad_response" }));
    await callHallOfFame({ ...request, squadSize: 2 });
    expect(mocks.pinned).toHaveBeenCalledTimes(2);
  });

  it("recovers a JSON answer wrapped in prose before calling it unusable", async () => {
    mocks.registry.mockResolvedValue([registryEntry("groq", "groq-a", 95), registryEntry("nvidia", "nvidia-a", 90)]);
    mocks.pinned.mockResolvedValue({ text: 'Here you go:\n```json\n{"plan":1}\n```', data: null, latencyMs: 1 });
    const outcome = await callHallOfFame({ ...request, json: true });
    expect(outcome).toMatchObject({ ok: true, model: "groq-a" });
    expect(mocks.pinned).toHaveBeenCalledTimes(1);
  });

  it("still counts an answer with no JSON at all as unusable", async () => {
    mocks.registry.mockResolvedValue([registryEntry("groq", "groq-a", 95)]);
    mocks.pinned.mockResolvedValue({ text: "I cannot help with that.", data: null, latencyMs: 1 });
    expect(await callHallOfFame({ ...request, json: true })).toMatchObject({ ok: false, reason: "squad_exhausted" });
  });

  it("keeps OpenAI and Google out of a wide free-only walk", async () => {
    mocks.registry.mockResolvedValue([
      registryEntry("openai", "gpt-oss-direct", 99),
      registryEntry("google", "gemma-direct", 98),
      registryEntry("groq", "groq-a", 60),
    ]);
    mocks.pinned.mockRejectedValue(Object.assign(new Error("bad"), { category: "bad_response" }));
    await callHallOfFame(request);
    const providers = mocks.pinned.mock.calls.map((call) => (call[1] as { provider: string }).provider);
    expect(providers).toEqual(["groq"]);
  });
});
