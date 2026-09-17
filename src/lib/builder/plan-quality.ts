/**
 * REVORA AUTONOMOUS PLAN QUALITY GUARD v4
 *
 * Pure, local validation/sanitization for plans produced by the deterministic
 * compiler. It never executes changes, calls a provider, or touches the DB.
 *
 * The goal is to catch regressions at the planning boundary before a plan is
 * shown to the owner or reaches the existing apply/rollback pipeline.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import type { DeterministicPlan } from "./deterministic";

const MAX_PLAN_ACTIONS = 56;
const TEMP_REF = /^temp_[a-z0-9_-]+$/i;

const unique = <T>(items: T[]): T[] => [...new Set(items)];

function allowedIds(context: AgentContext) {
  return {
    pages: new Set(context.pages.map((page) => page.id)),
    sections: new Set(context.pages.flatMap((page) => page.sections.map((section) => section.id))),
    components: new Set(
      context.pages.flatMap((page) =>
        page.sections.flatMap((section) => section.components.map((component) => component.id)),
      ),
    ),
  };
}

function isAllowedReference(value: unknown, ids: Set<string>) {
  return typeof value === "string" && (TEMP_REF.test(value) || ids.has(value));
}

function actionIsSafe(action: unknown, ids: ReturnType<typeof allowedIds>): boolean {
  if (!action || typeof action !== "object") return false;
  const item = action as Record<string, unknown>;

  if ("pageId" in item && !isAllowedReference(item["pageId"], ids.pages)) return false;
  if ("sectionId" in item && !isAllowedReference(item["sectionId"], ids.sections)) return false;
  if ("componentId" in item && !isAllowedReference(item["componentId"], ids.components)) return false;

  if (item["type"] === "reorder_sections") {
    const sectionIds = item["sectionIds"];
    if (!Array.isArray(sectionIds)) return false;
    if (sectionIds.some((id) => !isAllowedReference(id, ids.sections))) return false;
  }

  return typeof item["type"] === "string" && item["type"].length > 0;
}

/**
 * Sanitize one native plan before it crosses the autonomous planning boundary.
 * Duplicate actions are removed. Invalid references are dropped rather than
 * passed downstream. The original plan is never mutated.
 */
export function guardAutonomousPlan(
  context: AgentContext,
  plan: DeterministicPlan,
): DeterministicPlan {
  const ids = allowedIds(context);
  const issues: string[] = [];
  const seen = new Set<string>();
  const actions = [] as DeterministicPlan["actions"];

  for (const action of plan.actions.slice(0, MAX_PLAN_ACTIONS)) {
    const key = JSON.stringify(action) ?? "";
    if (seen.has(key)) {
      issues.push(`Removed duplicate action: ${action.type}.`);
      continue;
    }
    seen.add(key);

    if (!actionIsSafe(action, ids)) {
      issues.push(`Removed an action with an invalid or unresolved reference: ${action.type}.`);
      continue;
    }

    actions.push(action);
  }

  if (plan.actions.length > MAX_PLAN_ACTIONS)
    issues.push(`Capped the plan at ${MAX_PLAN_ACTIONS} actions.`);

  const changed = actions.length !== plan.actions.length;
  const coverage =
    actions.length === 0 && plan.actions.length > 0
      ? "none"
      : changed && plan.coverage === "full"
        ? "partial"
        : plan.coverage;

  return {
    ...plan,
    actions,
    coverage,
    trace: unique([
      ...plan.trace,
      issues.length
        ? `Autonomous Brain v4: quality guard ${issues.length} correction${issues.length === 1 ? "" : "s"} applied before execution.`
        : "Autonomous Brain v4: quality guard passed the native plan.",
    ]),
    notes: unique([
      ...plan.notes,
      ...issues,
    ]),
  };
}
