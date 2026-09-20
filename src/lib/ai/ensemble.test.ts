/**
 * ENSEMBLE PROOF.
 *
 * The business promise these tests protect: the ENTIRE verified free model pool
 * can work one job together — not three models per provider — while staying
 * zero-cost, bounded, parallel and immune to any single model failing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelRole } from "@/lib/ai/config";
import type { RegistryModel } from "@/lib/ai/registry.server";

const callPinnedFreeModel = vi.fn();
const buildFreeModelRegistry = vi.fn();

vi.mock("@/lib/ai/router.server", () => ({
  callPinnedFreeModel: (...args: unknown[]) => callPinnedFreeModel(...args),
  freeModelPool: async () => [],
  providerHealth: () => [],
}));

vi.mock("@/lib/ai/registry.server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    buildFreeModelRegistry: (role: ModelRole) => buildFreeModelRegistry(role),
  };
});

const ensemble = () => import("@/lib/ai/ensemble.server");

function model(
  provider: RegistryModel["provider"],
  id: string,
  overrides: Partial<RegistryModel> = {},
): RegistryModel {
  return {
    provider,
    model: id,
    displayName: id,
    modality: "text",
    capabilities: [
      "planning",
      "reasoning",
      "design",
      "critique",
      "copy",
      "seo",
      "cro",
      "accessibility",
      "qa",
      "facts",
      "security",
      "frontend",
      "coding",
    ],
    role: "design",
    free: true,
    freeEvidence: "provider_catalogue",
    confidence: "live",
    verifiedAt: Date.now(),
    weight: 80,
    structuredOutput: true,
    streaming: true,
    contextWindow: null,
    health: { healthy: true, failures: 0, cooldownUntil: null },
    quota: { allowance: "free", remainingToday: null },
    ...overrides,
  };
}

/**
 * A pool of N verified free models spread over the free providers, each id in
 * the shape that provider's real free-eligibility gate accepts.
 */
function pool(count: number): RegistryModel[] {
  const shapes: [RegistryModel["provider"], (i: number) => string][] = [
    ["cloudflare", (i) => `@cf/meta/llama-3.3-70b-${i}`],
    ["groq", (i) => `llama-3.3-70b-versatile-${i}`],
    ["nvidia", (i) => `meta/llama-3.3-70b-instruct-${i}`],
    ["openrouter", (i) => `qwen/qwen3-72b-${i}:free`],
    ["google", (i) => `gemini-2.0-flash-${i}`],
  ];
  return Array.from({ length: count }, (_, index) => {
    const [provider, id] = shapes[index % shapes.length]!;
    return model(provider, id(index));
  });
}

const caller = { task: "test.ensemble" };

const request = (overrides: Record<string, unknown> = {}) => ({
  mode: "maximum" as const,
  prompt: () => [{ role: "user" as const, content: "compose" }],
  parse: ({ data }: { data: Record<string, unknown> }) =>
    typeof data["answer"] === "string" ? { answer: data["answer"] } : null,
  consensusKey: (value: { answer: string }) => value.answer,
  concurrency: 8,
  perProviderConcurrency: 4,
  ...overrides,
});

beforeEach(() => {
  callPinnedFreeModel.mockReset();
  buildFreeModelRegistry.mockReset();
  callPinnedFreeModel.mockResolvedValue({
    provider: "groq",
    model: "x",
    text: "{}",
    data: { answer: "same" },
    latencyMs: 5,
    inputTokens: null,
    outputTokens: null,
  });
});

afterEach(() => {
  delete process.env["ENSEMBLE_MAX_MODELS_PER_LANE"];
});

describe("no 3-model-per-provider cap", () => {
  it("puts far more than three models of one provider to work", async () => {
    const many = Array.from({ length: 12 }, (_, i) => model("groq", `groq-model-${i}-70b`));
    buildFreeModelRegistry.mockResolvedValue(many);
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    const groq = proof.attempted.filter((entry) => entry.provider === "groq");
    expect(groq.length).toBe(12);
  });

  it.each([10, 20, 50, 100])("orchestrates a pool of %i verified free models", async (size) => {
    buildFreeModelRegistry.mockResolvedValue(pool(size));
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect", "uiux", "seo"] }));
    // Every model gets meaningful work; nothing is truncated to three.
    const distinctModels = new Set(proof.attempted.map((entry) => entry.model));
    expect(distinctModels.size).toBe(size);
    expect(proof.attempted.length).toBeGreaterThanOrEqual(size);
  });

  it("uses a minimal set for a tiny edit and the full pool for a rebuild", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(24));
    const { ensembleModeFor, runEnsemble } = await ensemble();
    expect(ensembleModeFor("change this exact phrase in the hero heading")).toBe("minimal");
    expect(ensembleModeFor("rebuild my whole site and make it the best possible")).toBe("maximum");

    const small = await runEnsemble(caller, request({ mode: "minimal", lanes: ["architect"] }));
    // A tiny edit still gets a cross-checked pair, never the whole agency.
    expect(small.attempted.length).toBe(2);
    const standard = await runEnsemble(caller, request({ mode: "standard", lanes: ["architect"] }));
    expect(standard.attempted.length).toBe(24);
    const big = await runEnsemble(caller, request({ mode: "maximum", lanes: ["architect"] }));
    expect(big.attempted.length).toBe(24);
  });
});

describe("parallel dispatch, bounded and resilient", () => {
  it("runs models concurrently within the configured limits", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(18));
    let inFlight = 0;
    let peak = 0;
    const perProviderPeak = new Map<string, number>();
    const perProvider = new Map<string, number>();
    callPinnedFreeModel.mockImplementation(async (_caller: unknown, call: { provider: string }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const now = (perProvider.get(call.provider) ?? 0) + 1;
      perProvider.set(call.provider, now);
      perProviderPeak.set(call.provider, Math.max(perProviderPeak.get(call.provider) ?? 0, now));
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      perProvider.set(call.provider, (perProvider.get(call.provider) ?? 1) - 1);
      return { provider: call.provider, model: "m", text: "{}", data: { answer: "same" }, latencyMs: 10, inputTokens: null, outputTokens: null };
    });

    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(
      caller,
      request({ lanes: ["architect", "seo"], concurrency: 5, perProviderConcurrency: 2 }),
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
    for (const value of perProviderPeak.values()) expect(value).toBeLessThanOrEqual(2);
    expect(proof.succeeded).toBe(proof.attempted.length);
  });

  it("one model failing does not fail the build", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(6));
    let call = 0;
    callPinnedFreeModel.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw Object.assign(new Error("timeout"), { category: "timeout" });
      return { provider: "groq", model: "m", text: "{}", data: { answer: "same" }, latencyMs: 1, inputTokens: null, outputTokens: null };
    });
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.failed).toBe(1);
    expect(proof.succeeded).toBe(5);
    expect(proof.verdict).toBe("PASS");
    expect(proof.outcomes.some((entry) => entry.reason === "timeout")).toBe(true);
  });

  it("treats a malformed or unvalidated answer as that one model's failure", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(3));
    let call = 0;
    callPinnedFreeModel.mockImplementation(async () => {
      call += 1;
      return {
        provider: "groq",
        model: "m",
        text: "not json",
        // A model that answered with unparseable JSON arrives as data: null.
        data: call === 1 ? null : { answer: "same" },
        latencyMs: 1,
        inputTokens: null,
        outputTokens: null,
      };
    });
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.succeeded).toBe(2);
    expect(proof.failed).toBe(1);
  });

  it("stops dispatching once the wall-clock deadline passes", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(30));
    callPinnedFreeModel.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { provider: "groq", model: "m", text: "{}", data: { answer: "same" }, latencyMs: 30, inputTokens: null, outputTokens: null };
    });
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(
      caller,
      request({ lanes: ["architect"], concurrency: 2, deadlineMs: 60 }),
    );
    expect(proof.deadlineHit).toBe(true);
    expect(proof.outcomes.length).toBeLessThan(30);
  });

  it("honours a cancellation signal", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(12));
    const controller = new AbortController();
    controller.abort();
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(
      caller,
      request({ lanes: ["architect"], signal: controller.signal }),
    );
    expect(proof.outcomes).toHaveLength(0);
    expect(callPinnedFreeModel).not.toHaveBeenCalled();
  });
});

describe("zero-cost and quota enforcement", () => {
  it("never assigns a model that is not verified free", async () => {
    buildFreeModelRegistry.mockResolvedValue([
      model("openrouter", "openai/gpt-4o"), // paid id, not `:free`
      model("groq", "openai/gpt-oss-120b"),
    ]);
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.attempted.map((entry) => entry.model)).toEqual(["openai/gpt-oss-120b"]);
    expect(proof.skipped.some((entry) => entry.reason === "not verified free")).toBe(true);
  });

  it("skips a provider that is out of free budget or cooling down", async () => {
    buildFreeModelRegistry.mockResolvedValue([
      model("openrouter", "a-70b:free", { quota: { allowance: "free", remainingToday: 0 } }),
      model("groq", "b-70b", { health: { healthy: false, failures: 3, cooldownUntil: Date.now() + 1000 } }),
      model("nvidia", "nvidia/c-70b"),
    ]);
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.attempted.map((entry) => entry.provider)).toEqual(["nvidia"]);
    expect(proof.skipped.map((entry) => entry.reason)).toContain(
      "provider free budget spent for today",
    );
    expect(proof.skipped.map((entry) => entry.reason)).toContain(
      "provider cooling down after failures",
    );
  });

  it("reports BLOCKED, not success, when no free model is available", async () => {
    buildFreeModelRegistry.mockResolvedValue([]);
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request());
    expect(proof.verdict).toBe("BLOCKED");
    expect(proof.winner).toBeNull();
    expect(callPinnedFreeModel).not.toHaveBeenCalled();
  });

  it("skips a lane when no model has that capability", async () => {
    buildFreeModelRegistry.mockResolvedValue([
      model("groq", "text-only-70b", { capabilities: ["copy"] }),
    ]);
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["vision", "copy"] }));
    expect(proof.lanes).toEqual(["copy"]);
    expect(
      proof.skipped.some(
        (entry) => entry.lane === "vision" && entry.reason.includes("capability"),
      ),
    ).toBe(true);
  });
});

describe("consensus and deduplication", () => {
  it("picks the answer the most models independently reached", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(5));
    const answers = ["blue", "blue", "blue", "red", "green"];
    let index = 0;
    callPinnedFreeModel.mockImplementation(async () => ({
      provider: "groq",
      model: "m",
      text: "{}",
      data: { answer: answers[index++ % answers.length] },
      latencyMs: 1,
      inputTokens: null,
      outputTokens: null,
    }));
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.winner).toEqual({ answer: "blue" });
    expect(proof.agreement).toBe(3);
    expect(proof.conflicts).toBe(2);
    expect(proof.distinct).toBe(3);
  });

  it("reports one distinct proposal when every model agrees", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(4));
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.distinct).toBe(1);
    expect(proof.conflicts).toBe(0);
  });
});

describe("the proof report", () => {
  it("names providers, lanes, latency and a PASS/FAIL verdict", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(6));
    const { runEnsemble, proofSummary } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect", "seo"] }));
    expect(proof.providers.length).toBeGreaterThan(1);
    expect(proof.lanes).toEqual(["architect", "seo"]);
    expect(proof.verdict).toBe("PASS");
    expect(proof.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(proofSummary(proof)).toContain("PASS");
  });

  it("reports FAIL rather than success when every model failed", async () => {
    buildFreeModelRegistry.mockResolvedValue(pool(3));
    callPinnedFreeModel.mockRejectedValue(
      Object.assign(new Error("rate limited"), { category: "rate_limited" }),
    );
    const { runEnsemble } = await ensemble();
    const proof = await runEnsemble(caller, request({ lanes: ["architect"] }));
    expect(proof.verdict).toBe("FAIL");
    expect(proof.winner).toBeNull();
  });
});
