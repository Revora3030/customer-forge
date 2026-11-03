/**
 * Wires the batched repair turn into edit planning.
 *
 * Runs after the fact review and design polish, before edit-scope enforcement
 * and the action reader. Deterministic fixes are always kept. Model repairs
 * are kept only when the fact and safety review re-checks the repaired steps
 * and accepts them; if that review cannot run, the plan keeps only the
 * deterministic fixes. Any error returns the plan unchanged.
 */
import { callBestThinker } from "@/lib/ai/thinker.server";
import type { AgentContext } from "@/lib/site-agent.server";
import { runRepairTurn } from "./repair-turn";
import { editScopeViolations, validatePlanActions, type ScopeBoundary, type PlanValidationContext } from "./violations";

export type PlanRepairResult = {
  actions: unknown[];
  costMicrocents: number;
  /** One owner-facing note when something was repaired, else null. */
  note: string | null;
  log: string[];
};

export async function repairPlanActions(input: {
  actions: unknown[];
  context: AgentContext;
  boundary: ScopeBoundary | null;
  system: string;
  instruction: string;
  organizationId: string;
  /** Re-runs the fact and safety review on a full list; null when it cannot run. */
  review: (actions: unknown[]) => Promise<Record<string, unknown> | null>;
  onStage?: (stage: string, detail?: string) => void;
}): Promise<PlanRepairResult> {
  const unchanged: PlanRepairResult = { actions: input.actions, costMicrocents: 0, note: null, log: [] };
  try {
    const known = {
      pageIds: new Set(input.context.pages.map((page) => page.id)),
      sectionIds: new Set(input.context.pages.flatMap((page) => page.sections.map((section) => section.id))),
      componentIds: new Set(
        input.context.pages.flatMap((page) => page.sections.flatMap((section) => section.components.map((component) => component.id))),
      ),
    };
    // Mirror the scope check's fail-open rule: when every step is outside the
    // declared scope, the scope is wrong, not the plan — don't "repair" the
    // plan into a wrong scope.
    const scopeHits = editScopeViolations(input.actions, input.context, input.boundary);
    const boundary = input.boundary && scopeHits.length < input.actions.length ? input.boundary : null;
    const validation: PlanValidationContext = { known, scopeContext: input.context, boundary };
    const validate = (list: unknown[]) => validatePlanActions(list, validation);

    if (!validate(input.actions).length) return unchanged;
    input.onStage?.("repairing the plan", "fixing the steps the checks flagged, in one pass");

    const outcome = await runRepairTurn({
      actions: input.actions,
      validate,
      known,
      callModel: async ({ user, signal }) => {
        const answer = await callBestThinker({
          json: true,
          purpose: "creative_direction",
          complexity: "medium",
          stage: "batched_repair",
          system: input.system,
          user,
          organizationId: input.organizationId,
          maxOutputTokens: 6000,
          signal,
        });
        return answer.ok ? { ok: true, text: answer.text, costMicrocents: answer.costMicrocents } : { ok: false, reason: answer.reason };
      },
    });
    const log = [...outcome.log, `stopped: ${outcome.stopped}`];
    let actions = outcome.actions;
    const cost = outcome.costMicrocents;

    // Model-written steps must pass the fact and safety review again.
    const changed = actions
      .map((action, index) => (JSON.stringify(action) !== JSON.stringify(outcome.deterministicActions[index]) ? index : -1))
      .filter((index) => index >= 0);
    if (changed.length) {
      const verdict = await input.review(actions);
      if (!verdict) {
        log.push("review unavailable: model repairs discarded");
        actions = outcome.deterministicActions;
      } else {
        const rawReject = Array.isArray(verdict["reject"]) ? (verdict["reject"] as unknown[]) : [];
        const reject = rawReject.map((value) => Number(value)).filter((value) => changed.includes(value));
        if (reject.length) {
          // A repaired step the reviewer rejects goes back to its pre-repair
          // form, so the normal rules below decide it exactly as before.
          const rejected = new Set(reject);
          actions = actions.map((action, index) => (rejected.has(index) ? outcome.deterministicActions[index] : action));
          log.push(`review rejected ${reject.length} repaired step(s): reverted`);
        }
      }
    }

    const after = validate(actions);
    const fixedCount = outcome.before.length - after.length;
    console.info("[ai-agent-plan] batched repair", {
      before: outcome.before.length,
      after: after.length,
      modelCalls: outcome.modelCalls,
      deterministicFixes: outcome.deterministicFixes,
      costMicrocents: cost,
      log,
    });
    return {
      actions,
      costMicrocents: cost,
      note:
        fixedCount > 0
          ? fixedCount === 1
            ? "One step the checks flagged was fixed automatically before showing it to you."
            : `${fixedCount} steps the checks flagged were fixed automatically before showing them to you.`
          : null,
      log,
    };
  } catch (error) {
    console.error("[ai-agent-plan] batched repair failed open", error);
    return unchanged;
  }
}
