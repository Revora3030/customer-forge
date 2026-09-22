import { describe, expect, it, beforeEach } from "vitest";
import { contractFor, type ModelRecord } from "./contracts";
import { rankCandidates, scoreCandidate } from "./score";
import { analyzeGaps } from "./gap";
import { buildOrchestrationPlan, resolveByVerification } from "./plan";
import { capabilityAwareFailover } from "./failover";
import { SPECIALIST_SIX, specialistCoverage, specialistRecord } from "./specialists";
import { probeCapability, resetProbeCache } from "./probe.server";

const specialists = SPECIALIST_SIX.map((entry) => specialistRecord(entry));

function record(partial: Partial<ModelRecord> & { id: string }): ModelRecord {
  return {
    provider: "groq",
    displayName: partial.id,
    capabilities: { text_generation: "supported", structured_output: "supported" },
    inputModalities: ["text"],
    outputModalities: ["text"],
    contextTokens: 128_000,
    maxOutputTokens: 8_000,
    quality: 50,
    reliability: 90,
    latencyMs: null,
    paid: false,
    costPerMTok: 0,
    specialist: false,
    specializations: [],
    languages: ["*"],
    evidence: "provider_metadata",
    verifiedAt: Date.now(),
    healthy: true,
    blockedReason: null,
    ...partial,
  };
}

describe("quality-first scoring", () => {
  it("never lets a free model beat a stronger compatible model", () => {
    const contract = contractFor("creative_direction");
    const free = record({
      id: "free-small",
      quality: 40,
      capabilities: {
        text_generation: "supported",
        structured_output: "supported",
        reasoning: "supported",
      },
    });
    const paid = record({
      id: "paid-strong",
      paid: true,
      costPerMTok: 40,
      quality: 95,
      capabilities: {
        text_generation: "supported",
        structured_output: "supported",
        reasoning: "supported",
      },
    });
    const ranking = rankCandidates(contract, [free, paid]);
    expect(ranking.eligible[0]?.record.id).toBe("paid-strong");
  });

  it("rejects a model that cannot prove a required capability", () => {
    const contract = contractFor("creative_direction");
    const scored = scoreCandidate(contract, record({ id: "no-reasoning" }));
    expect(scored.eligible).toBe(false);
    expect(scored.reason).toContain("reasoning");
  });

  it("never crosses modality", () => {
    const contract = contractFor("transcription");
    const scored = scoreCandidate(contract, record({ id: "text-only" }));
    expect(scored.eligible).toBe(false);
  });

  it("uses cost only as the final tiebreak", () => {
    const contract = contractFor("metadata");
    const cheap = record({ id: "a-cheap", costPerMTok: 0 });
    const dear = record({ id: "b-dear", costPerMTok: 40, paid: true });
    const ranking = rankCandidates(contract, [dear, cheap]);
    expect(ranking.eligible.map((entry) => entry.record.id)).toEqual(["a-cheap", "b-dear"]);
    // ...but one point of quality outranks the entire cost band.
    const better = record({ id: "b-dear-better", costPerMTok: 40, paid: true, quality: 60 });
    expect(rankCandidates(contract, [better, cheap]).eligible[0]?.record.id).toBe("b-dear-better");
  });
});

describe("specialist six", () => {
  it("owns its domains and covers the contract", () => {
    const coverage = specialistCoverage({
      contract: contractFor("creative_direction"),
      records: specialists,
    });
    expect(coverage.owner?.id).toBe("sol");
    expect(coverage.gaps).toEqual([]);
  });

  it("reports the owner as blocked instead of silently downgrading", () => {
    const blocked = specialists.map((entry) =>
      entry.id === "whisper" ? { ...entry, blockedReason: "no credentials" } : entry,
    );
    const coverage = specialistCoverage({ contract: contractFor("transcription"), records: blocked });
    expect(coverage.owner).toBeNull();
    expect(coverage.ownerBlocked).toBe("no credentials");
  });
});

describe("gap engine", () => {
  it("adds nothing when the six already cover the task", () => {
    const contract = contractFor("creative_direction");
    const coverage = specialistCoverage({ contract, records: specialists });
    const gaps = analyzeGaps({
      contract,
      coverage,
      catalog: [record({ id: "extra", capabilities: { text_generation: "supported" } })],
    });
    expect(gaps.specialists).toEqual([]);
  });

  it("admits every model that fills a real gap, with no hardcoded ceiling", () => {
    const contract = contractFor("embeddings");
    const coverage = specialistCoverage({ contract, records: specialists });
    const catalog = Array.from({ length: 40 }, (_, index) =>
      record({
        id: `embed-${index}`,
        quality: 50 + index,
        capabilities: { embeddings: "supported" },
        outputModalities: ["vector"],
      }),
    );
    const many = analyzeGaps({ contract, coverage, catalog, desiredRedundancy: 30 });
    expect(many.gaps).toContain("embeddings");
    expect(many.specialists.length).toBe(30);
    expect(many.specialists[0]?.record.id).toBe("embed-39");
  });

  it("never claims an unmet capability is covered", () => {
    const contract = contractFor("video_generation");
    const coverage = specialistCoverage({ contract, records: specialists });
    const gaps = analyzeGaps({ contract, coverage, catalog: [record({ id: "text" })] });
    expect(gaps.unmet).toContain("video_generation");
    expect(gaps.specialists).toEqual([]);
  });
});

describe("orchestration plan", () => {
  it("leads with the domain owner and stages synthesis, verification and QA", () => {
    const plan = buildOrchestrationPlan({
      contract: contractFor("creative_direction"),
      specialistRecords: specialists,
      catalog: [],
      requestId: "req-1",
    });
    expect(plan.lead?.record.id).toBe("gpt-5.6-sol");
    expect(plan.stages).toContain("terra_verification");
    expect(plan.stages).toContain("visual_qa");
    expect(plan.decision.participants.some((entry) => entry.role === "verification")).toBe(true);
    expect(plan.degraded).toBe(false);
  });

  it("explains why a capable model was not used", () => {
    const plan = buildOrchestrationPlan({
      contract: contractFor("metadata"),
      specialistRecords: specialists,
      catalog: [record({ id: "spare" })],
      requestId: "req-2",
    });
    expect(plan.decision.rejected.some((entry) => entry.model === "spare")).toBe(true);
  });

  it("resolves conflicts by verification, never by majority", () => {
    const results = [
      { model: "weak-a", provider: "groq", value: "wrong", confidence: 0.4, validated: true },
      { model: "weak-b", provider: "groq", value: "wrong", confidence: 0.3, validated: true },
      { model: "strong", provider: "openai", value: "right", confidence: 0.9, validated: true },
    ];
    const resolved = resolveByVerification(results, (candidate) => candidate.value === "right");
    expect(resolved.chosen?.value).toBe("right");
    expect(resolved.method).toBe("verified");
  });
});

describe("failover", () => {
  it("substitutes only a model that satisfies the same contract", () => {
    const contract = contractFor("transcription");
    const outcome = capabilityAwareFailover({
      contract,
      attempted: ["whisper-1"],
      catalog: [record({ id: "text-only" })],
    });
    expect(outcome.kind).toBe("capability_unavailable");
  });
});

describe("capability probes", () => {
  beforeEach(() => resetProbeCache());

  it("only records a capability a probe proved", async () => {
    const state = await probeCapability({
      provider: "groq",
      model: "some-model",
      capability: "structured_output",
      runner: async () => ({ ok: true, satisfied: false }),
    });
    expect(state).toBe("unsupported");
  });

  it("distinguishes a provider failure from a missing capability", async () => {
    const state = await probeCapability({
      provider: "groq",
      model: "broken",
      capability: "structured_output",
      runner: async () => ({ ok: false, satisfied: false }),
    });
    expect(state).toBe("probe_failed");
  });

  it("caches a proven capability instead of re-probing", async () => {
    let calls = 0;
    const runner = async () => {
      calls += 1;
      return { ok: true, satisfied: true };
    };
    await probeCapability({ provider: "groq", model: "m", capability: "reasoning", runner });
    await probeCapability({ provider: "groq", model: "m", capability: "reasoning", runner });
    expect(calls).toBe(1);
  });
});
