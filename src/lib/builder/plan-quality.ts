/**
 * REVORA AUTONOMOUS PLAN QUALITY GUARD v5
 *
 * Pure, local validation/sanitization for plans produced by the deterministic
 * compiler. It never executes changes, calls a provider, or touches the DB.
 *
 * The goal is to catch regressions at the planning boundary before a plan is
 * shown to the owner or reaches the existing apply/rollback pipeline.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import type { DeterministicPlan } from "./deterministic";
import { critiquePlan } from "./plan-critique";

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

function isAllowedReference(
  value: unknown,
  ids: Set<string>,
  refs: Set<string>,
) {
  return typeof value === "string" && (ids.has(value) || refs.has(value));
}

function actionIsSafe(
  action: unknown,
  ids: ReturnType<typeof allowedIds>,
  refs: { pages: Set<string>; sections: Set<string>; components: Set<string> },
): boolean {
  if (!action || typeof action !== "object") return false;
  const item = action as Record<string, unknown>;

  if ("pageId" in item && !isAllowedReference(item["pageId"], ids.pages, refs.pages)) return false;
  if ("sectionId" in item && !isAllowedReference(item["sectionId"], ids.sections, refs.sections)) return false;
  if ("componentId" in item && !isAllowedReference(item["componentId"], ids.components, refs.components)) return false;

  if (item["type"] === "reorder_sections") {
    const sectionIds = item["sectionIds"];
    if (!Array.isArray(sectionIds)) return false;
    if (sectionIds.some((id) => !isAllowedReference(id, ids.sections, refs.sections))) return false;
  }

  if (item["type"] === "reorder_components") {
    const componentIds = item["componentIds"];
    if (!Array.isArray(componentIds)) return false;
    if (componentIds.some((id) => !isAllowedReference(id, ids.components, refs.components))) return false;
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
  const critiqued = critiquePlan(plan);
  const ids = allowedIds(context);
  const issues: string[] = [];
  const seen = new Set<string>();
  const actions = [] as DeterministicPlan["actions"];
  const refs = {
    pages: new Set<string>(),
    sections: new Set<string>(),
    components: new Set<string>(),
  };
  const pageSlugs = new Map(
    context.pages.map((page) => [page.slug.replace(/^\/+|\/+$/g, "").toLowerCase(), page.id]),
  );

  for (const action of critiqued.actions.slice(0, MAX_PLAN_ACTIONS)) {
    const key = JSON.stringify(action) ?? "";
    if (seen.has(key)) {
      issues.push(`Removed duplicate action: ${action.type}.`);
      continue;
    }
    seen.add(key);

    if (!actionIsSafe(action, ids, refs)) {
      issues.push(`Removed an action with an invalid or unresolved reference: ${action.type}.`);
      continue;
    }

    if (action.type === "add_page") {
      const slug = action.slug.replace(/^\/+|\/+$/g, "").toLowerCase();
      if (pageSlugs.has(slug)) {
        issues.push("Removed duplicate page slug: " + action.slug + ".");
        continue;
      }
      pageSlugs.set(slug, action.ref ?? "__planned_page_" + actions.length);
      if (action.ref) refs.pages.add(action.ref);
    }
    if (action.type === "add_section" && action.ref) refs.sections.add(action.ref);
    if (action.type === "add_component" && action.ref) refs.components.add(action.ref);

    actions.push(action);
  }

  if (critiqued.actions.length > MAX_PLAN_ACTIONS)
    issues.push(`Capped the plan at ${MAX_PLAN_ACTIONS} actions.`);

  const changed = actions.length !== critiqued.actions.length;
  const coverage =
    actions.length === 0 && critiqued.actions.length > 0
      ? "none"
      : changed && critiqued.coverage === "full"
        ? "partial"
        : critiqued.coverage;

  return {
    ...critiqued,
    actions,
    coverage,
    trace: unique([
      ...critiqued.trace,
      issues.length
        ? `Autonomous Brain v5: quality guard ${issues.length} correction${issues.length === 1 ? "" : "s"} applied before execution.`
        : "Autonomous Brain v5: quality guard passed the native plan.",
    ]),
    notes: unique([
      ...critiqued.notes,
      ...issues,
    ]),
  };
}
