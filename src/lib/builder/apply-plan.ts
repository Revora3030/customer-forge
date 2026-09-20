/**
 * REVORA BUILDER — APPLY PIPELINE PREFLIGHT.
 *
 * A plan is produced against the site as it was when the owner asked. By the
 * time they press apply, the site may have moved on: another member edited it,
 * an earlier request in the queue already ran, or a section was deleted. The
 * old pipeline handled this by silently dropping any step whose target it no
 * longer recognised, which surfaced to the owner as a bare
 * "Couldn't apply those changes." with nothing to act on.
 *
 * This module is the preflight that makes an apply truthful and repeatable:
 *
 *  - `orderActionsForApply` puts creators before the steps that depend on them,
 *    so an edited/reordered plan can never reference a page or section that has
 *    not been created yet.
 *  - `dedupeActions` removes exact duplicate operations, so a double press or a
 *    retry cannot add the same section twice.
 *  - `auditActionTargets` reports every step whose target no longer exists,
 *    with a reason, instead of dropping it in silence.
 *  - `stalePlanMessage` turns that report into plain English for the owner.
 *
 * Pure functions only — no network, no Supabase, no timers — so the rules can
 * be tested exactly as the builder runs them.
 */

import type { AgentAction } from "@/lib/site-agent";

/** Ids that really exist in the database right now, per table. */
export type KnownTargets = {
  pageIds: Set<string>;
  sectionIds: Set<string>;
  componentIds: Set<string>;
};

export type StaleTarget = {
  /** Operation type that could not be applied. */
  type: AgentAction["type"];
  /** The id or temporary reference that could not be resolved. */
  target: string;
  reason: "missing_page" | "missing_section" | "missing_component";
};

export type TargetAudit = {
  /** Operations whose every target resolves — safe to send to the writer. */
  ok: AgentAction[];
  /** Operations that cannot run because their target is gone. */
  stale: StaleTarget[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the value looks like a real database id rather than a plan ref. */
export const isStableId = (value: string) => UUID.test(value);

/* ------------------------------- ordering --------------------------------- */

/**
 * Rank used to keep creators ahead of their dependants. Within a rank the
 * original order is preserved, so an owner's deliberate reordering of edits is
 * respected — only genuine create-before-use dependencies are moved.
 */
const RANK: Partial<Record<AgentAction["type"], number>> = {
  add_page: 0,
  add_section: 1,
  add_component: 2,
  reorder_sections: 4,
  reorder_components: 4,
  delete_component: 5,
  delete_section: 6,
  delete_page: 7,
};

const rankOf = (action: AgentAction) => RANK[action.type] ?? 3;

/**
 * Orders a batch so every temporary reference is created before it is used,
 * and removals run last. Steps that depend on nothing keep their given order.
 */
export function orderActionsForApply(actions: AgentAction[]): AgentAction[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => rankOf(a.action) - rankOf(b.action) || a.index - b.index)
    .map((entry) => entry.action);
}

/* ------------------------------- dedupe ----------------------------------- */

/** Canonical form of one operation, used to spot exact repeats in a batch. */
export function actionFingerprint(action: AgentAction): string {
  const row = action as unknown as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  return keys.map((key) => `${key}=${JSON.stringify(row[key] ?? null)}`).join("&");
}

/**
 * Removes exact duplicate operations. A retry that resends the same batch, or a
 * plan that listed the same edit twice, must not write it twice.
 */
export function dedupeActions(actions: AgentAction[]): {
  actions: AgentAction[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const out: AgentAction[] = [];
  let duplicates = 0;
  for (const action of actions) {
    const key = actionFingerprint(action);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    out.push(action);
  }
  return { actions: out, duplicates };
}

/* -------------------------------- audit ----------------------------------- */

/**
 * Splits a batch into operations that can run and operations whose target no
 * longer exists. References created earlier in the same batch count as known,
 * so a plan that creates a page and then fills it stays intact.
 *
 * Must be called on an already-ordered batch (see `orderActionsForApply`).
 */
export function auditActionTargets(actions: AgentAction[], known: KnownTargets): TargetAudit {
  const pages = new Set(known.pageIds);
  const sections = new Set(known.sectionIds);
  const components = new Set(known.componentIds);

  const ok: AgentAction[] = [];
  const stale: StaleTarget[] = [];

  for (const action of actions) {
    const row = action as unknown as Record<string, unknown>;
    const pageId = typeof row["pageId"] === "string" ? row["pageId"] : "";
    const sectionId = typeof row["sectionId"] === "string" ? row["sectionId"] : "";
    const componentId = typeof row["componentId"] === "string" ? row["componentId"] : "";

    if (pageId && !pages.has(pageId)) {
      stale.push({ type: action.type, target: pageId, reason: "missing_page" });
      continue;
    }
    if (sectionId && !sections.has(sectionId)) {
      stale.push({ type: action.type, target: sectionId, reason: "missing_section" });
      continue;
    }
    if (componentId && !components.has(componentId)) {
      stale.push({ type: action.type, target: componentId, reason: "missing_component" });
      continue;
    }

    if (action.type === "reorder_sections") {
      const gone = action.sectionIds.find((id) => !sections.has(id));
      if (gone) {
        stale.push({ type: action.type, target: gone, reason: "missing_section" });
        continue;
      }
    }
    if (action.type === "reorder_components") {
      const gone = action.componentIds.find((id) => !components.has(id));
      if (gone) {
        stale.push({ type: action.type, target: gone, reason: "missing_component" });
        continue;
      }
    }

    // Creators make their reference usable by every later step in the batch.
    if (action.type === "add_page" && action.ref) pages.add(action.ref);
    if (action.type === "add_section" && action.ref) sections.add(action.ref);
    if (action.type === "add_component" && action.ref) components.add(action.ref);

    ok.push(action);
  }

  return { ok, stale };
}

/* ------------------------------ messages ---------------------------------- */

/**
 * Plain-English explanation of a stale plan. Never mentions ids or tables: the
 * owner is told what happened and what to do, and the diagnostics carry the
 * exact targets.
 */
export function stalePlanMessage(stale: StaleTarget[], total: number): string {
  if (!stale.length) return "";
  const allGone = stale.length >= total;
  const what =
    stale.every((entry) => entry.reason === "missing_page") ? "page" :
    stale.every((entry) => entry.reason === "missing_component") ? "button or card" :
    "section";
  return allGone
    ? `Your website changed while Revora was working, so this plan no longer fits it — the ${what} it was going to update isn't there any more. Ask again and Revora will plan against your website as it is now.`
    : `${stale.length} of those ${total} updates pointed at a ${what} that isn't there any more. Revora kept the updates that still fit and skipped the rest.`;
}

/**
 * The whole preflight in one call: order, dedupe, then audit against reality.
 */
export function preflightActions(
  actions: AgentAction[],
  known: KnownTargets,
): TargetAudit & { duplicates: number; ordered: number } {
  const ordered = orderActionsForApply(actions);
  const { actions: unique, duplicates } = dedupeActions(ordered);
  const audit = auditActionTargets(unique, known);
  return { ...audit, duplicates, ordered: unique.length };
}
