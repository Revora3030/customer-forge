/**
 * THE ORCHESTRATION PLAN.
 *
 * One deterministic function turns a capability contract plus the live model
 * catalogue into the exact execution plan:
 *
 *   task contract
 *     -> specialist-six coverage
 *     -> gap detection over the full live catalogue
 *     -> every verified gap specialist (no arbitrary ceiling)
 *     -> parallel specialist execution
 *     -> Sol synthesis
 *     -> Terra adversarial verification
 *     -> Luna utility / metadata pass
 *     -> validation
 *     -> visual / functional QA
 *     -> auto-repair
 *     -> final acceptance
 *
 * The plan also carries its own explainability record, so any build can prove
 * which models participated and what unique job each one performed.
 *
 * Pure module: no environment, no network, no secrets.
 */

import type { ModelRecord, TaskContract } from "@/lib/ai/orchestration/contracts";
import { analyzeGaps, type GapAnalysis } from "@/lib/ai/orchestration/gap";
import { rankCandidates, type Scored } from "@/lib/ai/orchestration/score";
import {
  SPECIALIST_SIX,
  specialistById,
  specialistCoverage,
  type Specialist,
  type SpecialistCoverage,
} from "@/lib/ai/orchestration/specialists";
import type { RoutingDecision, RoutingParticipant } from "@/lib/ai/orchestration/telemetry";

export type Stage =
  | "specialist_core"
  | "gap_specialists"
  | "sol_synthesis"
  | "terra_verification"
  | "luna_metadata"
  | "validation"
  | "visual_qa"
  | "auto_repair"
  | "final_acceptance";

export type OrchestrationPlan = {
  contract: TaskContract;
  coverage: SpecialistCoverage;
  /** The model that leads the task: the domain owner, or the best alternative. */
  lead: { record: ModelRecord; specialist: Specialist | null; reason: string } | null;
  /** Capability-aware alternatives for the lead, strongest first. */
  leadFallbacks: Scored[];
  gaps: GapAnalysis;
  stages: Stage[];
  participants: RoutingParticipant[];
  decision: RoutingDecision;
  /** True when the plan cannot deliver every required capability. */
  degraded: boolean;
};

const QA_TASKS = new Set([
  "creative_direction",
  "information_architecture",
  "conversion_architecture",
  "content_strategy",
  "design_fingerprint",
  "visual_review",
  "image_hero",
  "image_support",
  "image_edit",
]);

export function buildOrchestrationPlan(input: {
  contract: TaskContract;
  /** Records for the specialist six as the catalogue currently sees them. */
  specialistRecords: ModelRecord[];
  /** Every other discovered model, already normalized and health-annotated. */
  catalog: ModelRecord[];
  requestId: string;
  correlationId?: string | null;
  desiredRedundancy?: number;
}): OrchestrationPlan {
  const { contract } = input;
  const coverage = specialistCoverage({ contract, records: input.specialistRecords });

  // The domain owner leads whenever it can serve the contract. Otherwise the
  // lead is chosen by the same quality-first ranking over every compatible
  // model — specialists included — and never by price.
  const ranked = rankCandidates(contract, [...input.specialistRecords, ...input.catalog]);
  let lead: OrchestrationPlan["lead"] = null;
  if (coverage.owner) {
    const record = input.specialistRecords.find((entry) => entry.id === coverage.owner?.model);
    if (record)
      lead = {
        record,
        specialist: coverage.owner,
        reason: `owns the ${contract.task} domain and covers every required capability`,
      };
  }
  if (!lead && ranked.eligible[0]) {
    const best = ranked.eligible[0];
    lead = {
      record: best.record,
      specialist: SPECIALIST_SIX.find((entry) => entry.model === best.record.id) ?? null,
      reason: coverage.ownerBlocked
        ? `highest-scoring compatible model while the domain owner is unavailable (${coverage.ownerBlocked})`
        : best.reason,
    };
  }

  const gaps = analyzeGaps({
    contract,
    coverage,
    catalog: input.catalog.filter((record) => record.id !== lead?.record.id),
    ...(input.desiredRedundancy === undefined ? {} : { desiredRedundancy: input.desiredRedundancy }),
  });

  const participants: RoutingParticipant[] = [];
  if (lead)
    participants.push({
      model: lead.record.id,
      provider: lead.record.provider,
      role: lead.record.specialist ? "specialist" : "gap_specialist",
      job: lead.specialist ? lead.specialist.charter : `leads ${contract.task}`,
      fills: contract.required,
      score: ranked.eligible.find((entry) => entry.record.id === lead?.record.id)?.score ?? 0,
      reason: lead.reason,
    });
  for (const entry of gaps.specialists)
    participants.push({
      model: entry.record.id,
      provider: entry.record.provider,
      role: "gap_specialist",
      job: `provides ${entry.fills.join(", ")}`,
      fills: entry.fills,
      score: entry.score,
      reason: entry.reason,
    });

  const stages: Stage[] = ["specialist_core"];
  if (gaps.specialists.length > 0) stages.push("gap_specialists");
  const needsSynthesis = gaps.specialists.length > 0 || contract.complexity === "high";
  const sol = specialistUsable(input.specialistRecords, "sol");
  const terra = specialistUsable(input.specialistRecords, "terra");
  const luna = specialistUsable(input.specialistRecords, "luna");
  if (needsSynthesis && sol) {
    stages.push("sol_synthesis");
    participants.push(specialistParticipant("sol", "synthesis", "merges specialist evidence into one decision"));
  }
  if (terra && (needsSynthesis || contract.complexity !== "low")) {
    stages.push("terra_verification");
    participants.push(
      specialistParticipant("terra", "verification", "adversarially verifies the merged result"),
    );
  }
  if (luna && contract.schemaBound) {
    stages.push("luna_metadata");
    participants.push(specialistParticipant("luna", "utility", "metadata and utility pass"));
  }
  stages.push("validation");
  if (QA_TASKS.has(contract.task)) stages.push("visual_qa", "auto_repair");
  stages.push("final_acceptance");

  const degraded = gaps.unmet.length > 0 || lead === null;
  const decision: RoutingDecision = {
    requestId: input.requestId,
    correlationId: input.correlationId ?? null,
    at: Date.now(),
    task: contract.task,
    required: contract.required,
    specialistCoverage: {
      covered: coverage.covered,
      gaps: coverage.gaps,
      available: coverage.available,
    },
    participants,
    rejected: [
      ...ranked.rejected.map((entry) => ({
        model: entry.record.id,
        provider: entry.record.provider,
        reason: entry.reason,
      })),
      ...ranked.eligible
        .filter(
          (entry) =>
            entry.record.id !== lead?.record.id &&
            !gaps.specialists.some((gap) => gap.record.id === entry.record.id) &&
            !participants.some((participant) => participant.model === entry.record.id),
        )
        .map((entry) => ({
          model: entry.record.id,
          provider: entry.record.provider,
          reason:
            "capable, but adds no capability the specialist six do not already cover for this task",
        })),
      ...gaps.rejected,
    ],
    unmetCapabilities: gaps.unmet,
    stages,
    confidence: degraded ? "low" : lead?.record.specialist ? "high" : "medium",
  };

  return {
    contract,
    coverage,
    lead,
    leadFallbacks: ranked.eligible.filter((entry) => entry.record.id !== lead?.record.id),
    gaps,
    stages,
    participants,
    decision,
    degraded,
  };
}

function specialistUsable(records: ModelRecord[], id: "sol" | "terra" | "luna") {
  const specialist = specialistById(id);
  return records.some(
    (record) => record.id === specialist.model && record.healthy && !record.blockedReason,
  );
}

function specialistParticipant(
  id: "sol" | "terra" | "luna",
  role: RoutingParticipant["role"],
  job: string,
): RoutingParticipant {
  const specialist = specialistById(id);
  return {
    model: specialist.model,
    provider: specialist.provider,
    role,
    job,
    fills: [],
    score: specialist.quality,
    reason: specialist.charter,
  };
}

export type EvidenceResult<T> = {
  model: string;
  provider: string;
  value: T;
  /** 0-1 confidence the producing lane reported. */
  confidence: number;
  /** True when the producing model's output validated against the contract. */
  validated: boolean;
};

export type ConflictResolution<T> = {
  chosen: EvidenceResult<T> | null;
  /** Results that disagreed with the chosen one. */
  conflicts: EvidenceResult<T>[];
  /** How the winner was decided. Never "majority". */
  method: "verified" | "single" | "none";
};

/**
 * Conflict resolution by verification, not by vote.
 *
 * Results are only considered when they validated. The verifier — Terra in the
 * real pipeline — decides; model count is never used as a proxy for truth, so a
 * crowd of weak models can never overwrite a stronger verified result.
 */
export function resolveByVerification<T>(
  results: EvidenceResult<T>[],
  verify: (candidate: EvidenceResult<T>, others: EvidenceResult<T>[]) => boolean,
): ConflictResolution<T> {
  const usable = results.filter((entry) => entry.validated);
  if (usable.length === 0) return { chosen: null, conflicts: results, method: "none" };
  if (usable.length === 1)
    return {
      chosen: usable[0] ?? null,
      conflicts: results.filter((entry) => entry !== usable[0]),
      method: "single",
    };
  const ordered = [...usable].sort(
    (a, b) => b.confidence - a.confidence || a.model.localeCompare(b.model),
  );
  for (const candidate of ordered) {
    const others = ordered.filter((entry) => entry !== candidate);
    if (verify(candidate, others))
      return { chosen: candidate, conflicts: others, method: "verified" };
  }
  return { chosen: null, conflicts: results, method: "none" };
}
