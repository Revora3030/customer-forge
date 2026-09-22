/**
 * THE SPECIALIST GAP ENGINE.
 *
 * A model outside the authoritative six may only join a job when it proves a
 * capability the six cannot adequately provide for that exact task. This module
 * is the only place allowed to make that decision.
 *
 * Three rules it enforces:
 *   - no gap, no extra models: a task the six already cover is not fanned out;
 *   - no arbitrary ceiling: if thirty models each fill a real gap, thirty are
 *     eligible; the count is an outcome, never a constant;
 *   - no redundancy theatre: a model whose proven contribution is entirely
 *     covered by a strictly better selected model is dropped, so the fanout
 *     tracks genuine capability, not model count.
 *
 * Pure module.
 */

import type {
  Capability,
  ModelRecord,
  TaskContract,
} from "@/lib/ai/orchestration/contracts";
import { supports } from "@/lib/ai/orchestration/contracts";
import { scoreCandidate, type Scored } from "@/lib/ai/orchestration/score";
import type { SpecialistCoverage } from "@/lib/ai/orchestration/specialists";

export type GapSpecialist = {
  record: ModelRecord;
  /** The gap capabilities this model is being brought in for. */
  fills: Capability[];
  /** True when no other selected model proves one of these capabilities. */
  unique: boolean;
  score: number;
  reason: string;
};

export type GapAnalysis = {
  /** Required capabilities no reachable specialist covers. */
  gaps: Capability[];
  /** Models admitted, strongest first. Empty when there is no gap. */
  specialists: GapSpecialist[];
  /** Gap capabilities nothing in the catalogue can prove. Never faked. */
  unmet: Capability[];
  /** Models considered and rejected, with the reason. */
  rejected: { model: string; provider: string; reason: string }[];
};

/**
 * Finds every model that genuinely fills a gap. `desiredRedundancy` keeps a
 * second proven source for a capability when one exists, so a provider outage
 * does not silently remove a capability mid-build; it defaults to 2 and is not
 * a candidate ceiling.
 */
export function analyzeGaps(input: {
  contract: TaskContract;
  coverage: SpecialistCoverage;
  /** The full live catalogue, excluding the specialist six. */
  catalog: ModelRecord[];
  desiredRedundancy?: number;
}): GapAnalysis {
  const gaps = [...input.coverage.gaps];
  // Optional-but-valuable capabilities the six cannot do are also gaps worth
  // filling when the catalogue proves them — never when it merely suggests them.
  for (const capability of input.contract.preferred)
    if (!input.coverage.covered.includes(capability) && !gaps.includes(capability))
      gaps.push(capability);

  if (gaps.length === 0)
    return { gaps: [], specialists: [], unmet: [], rejected: [] };

  const redundancy = Math.max(1, input.desiredRedundancy ?? 2);
  const rejected: GapAnalysis["rejected"] = [];
  const perCapability = new Map<Capability, Scored[]>();

  for (const capability of gaps) {
    const able = input.catalog.filter((record) => supports(record, capability));
    const scored = able
      .map((record) => ({ record, capability, scored: scoreCandidate(input.contract, record) }))
      .filter((entry) => {
        // A gap specialist does not have to satisfy the whole contract — the
        // specialist six still lead — but it must be usable and must match the
        // modality the capability needs.
        const { record } = entry;
        if (record.blockedReason) {
          rejected.push({
            model: record.id,
            provider: record.provider,
            reason: `blocked: ${record.blockedReason}`,
          });
          return false;
        }
        if (!record.healthy) {
          rejected.push({ model: record.id, provider: record.provider, reason: "unhealthy" });
          return false;
        }
        if (input.contract.sensitive && record.sensitiveSafe === false) {
          rejected.push({
            model: record.id,
            provider: record.provider,
            reason: "not cleared for tenant-sensitive content",
          });
          return false;
        }
        return true;
      })
      .map((entry) => entry.scored)
      .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    perCapability.set(capability, scored);
  }

  const unmet = gaps.filter((capability) => (perCapability.get(capability) ?? []).length === 0);

  const chosen = new Map<string, GapSpecialist>();
  for (const capability of gaps) {
    const ranked = perCapability.get(capability) ?? [];
    // Everything already chosen that proves this capability counts towards the
    // redundancy target, so a model with three gap capabilities is not
    // duplicated by three near-identical models.
    let have = 0;
    for (const entry of chosen.values()) if (supports(entry.record, capability)) have += 1;
    for (const scored of ranked) {
      const existing = chosen.get(scored.record.id);
      if (existing) {
        if (!existing.fills.includes(capability)) existing.fills.push(capability);
        continue;
      }
      if (have >= redundancy) {
        rejected.push({
          model: scored.record.id,
          provider: scored.record.provider,
          reason: `${capability} is already proven by ${have} stronger model(s); adding it would not improve the result`,
        });
        continue;
      }
      chosen.set(scored.record.id, {
        record: scored.record,
        fills: [capability],
        unique: have === 0,
        score: scored.score,
        reason: `fills ${capability}, which no reachable specialist-six model provides`,
      });
      have += 1;
    }
  }

  const specialists = [...chosen.values()].sort(
    (a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id),
  );
  return { gaps, specialists, unmet, rejected };
}
