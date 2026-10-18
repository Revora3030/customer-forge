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
import { readBlockStyle, readComponentVisual } from "@/lib/site-style";
import { LEGACY_CONTENT_KINDS } from "@/lib/builder/legacy-composition";

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

    if (action.type === "set_block_style") {
      const pool = action.target === "section" ? sections : components;
      if (!pool.has(action.targetId)) {
        stale.push({
          type: action.type,
          target: action.targetId,
          reason: action.target === "section" ? "missing_section" : "missing_component",
        });
        continue;
      }
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

/* ----------------------------- already correct ---------------------------- */

/** The fields of a live section a plan can be compared against. */
export type CurrentSectionState = {
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  variant?: string | null;
  is_visible?: boolean | null;
  settings?: unknown;
};

export type CurrentComponentState = { settings?: unknown };
export type CurrentSiteState = {
  sections: Map<string, CurrentSectionState>;
  components?: Map<string, CurrentComponentState>;
};

const sameText = (a: string | null | undefined, b: string) => (a ?? "").trim() === b.trim();

/**
 * Removes steps whose result is already true of the site. A plan that says
 * "set this headline to X" when the headline is already X is not a change, and
 * counting it as applied is what made the builder's own numbers untrustworthy.
 * Only exact, comparable fields are considered — anything uncertain is kept.
 */
export function dropUnchangedActions(
  actions: AgentAction[],
  state: CurrentSiteState,
): { actions: AgentAction[]; unchanged: number; unchangedLabels: string[] } {
  const out: AgentAction[] = [];
  const unchangedLabels: string[] = [];

  for (const action of actions) {
    let noop = false;

    if (action.type === "set_section_text") {
      const current = state.sections.get(action.sectionId);
      if (current && sameText(current[action.field], action.value)) noop = true;
    } else if (action.type === "set_section_visibility") {
      const current = state.sections.get(action.sectionId);
      if (current && current.is_visible === action.visible) noop = true;
    } else if (action.type === "set_component_visual") {
      const current = state.components?.get(action.componentId);
      const visual = readComponentVisual(current?.settings);
      const entries = Object.entries(action.patch);
      noop = Boolean(current) && entries.length > 0 && entries.every(([key, value]) => key === "media_url" ? false : visual[key as keyof typeof visual] === value);
    } else if (action.type === "set_block_style") {
      const current = action.target === "section"
        ? state.sections.get(action.targetId)
        : state.components?.get(action.targetId);
      const style = readBlockStyle(current?.settings, action.device);
      const entries = Object.entries(action.patch);
      noop = Boolean(current) && entries.length > 0 && entries.every(([key, value]) => style[key as keyof typeof style] === value);
    }


    if (noop) unchangedLabels.push(`${action.type} (already correct)`);
    else out.push(action);
  }

  return { actions: out, unchanged: unchangedLabels.length, unchangedLabels };
}

/* ---------------------------- planner feedback ---------------------------- */

/** A step the planner must re-author before the plan can be applied. */
export type PlanFeedback = {
  /** Index of the offending step in the plan as given. */
  index: number;
  type: AgentAction["type"];
  /** The section/component id or temp_* ref the feedback is about. */
  target: string;
  reason: "needs_composition" | "image_without_media";
  problem: string;
};

export const NEEDS_COMPOSITION_PROBLEM =
  "new content sections need a set_composition: compose this section's layout yourself (set_composition targeting the same ref)";
export const IMAGE_WITHOUT_MEDIA_PROBLEM = "pick a real photo from the media library or leave the image out";

const IMAGE_COMPONENT_KINDS: ReadonlySet<string> = new Set(["image", "hero_image"]);

const planRows = (plan: readonly unknown[] | { actions?: unknown }): Record<string, unknown>[] => {
  const list = Array.isArray(plan) ? plan : Array.isArray((plan as { actions?: unknown }).actions) ? ((plan as { actions: unknown[] }).actions) : [];
  return list.map((row) => (row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {}));
};
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Every new content section (a kind that would otherwise fall back to the
 * built-in legacy look) must come with the AI's own layout. Returns one
 * feedback item per add_section that has no set_composition for the same ref.
 * Pure: the caller sends these back to the planner on the same request.
 */
export function missingCompositionFeedback(plan: readonly unknown[] | { actions?: unknown }): PlanFeedback[] {
  const rows = planRows(plan);
  const composed = new Set(rows.filter((row) => row["type"] === "set_composition").map((row) => text(row["sectionId"])).filter(Boolean));
  const out: PlanFeedback[] = [];
  rows.forEach((row, index) => {
    if (row["type"] !== "add_section") return;
    const kind = text(row["kind"]);
    if (!LEGACY_CONTENT_KINDS.has(kind)) return;
    const ref = text(row["ref"]);
    if (ref && composed.has(ref)) return;
    out.push({ index, type: "add_section", target: ref || kind, reason: "needs_composition", problem: NEEDS_COMPOSITION_PROBLEM });
  });
  return out;
}

/**
 * Image items must show a real picture: an image component the plan adds or
 * edits needs a picture source in the same plan (a generated picture for that
 * exact item, or a media-library picture) or one it already has.
 */
export function imageWithoutMediaFeedback(
  plan: readonly unknown[] | { actions?: unknown },
  existing: ReadonlyMap<string, { kind: string; hasMedia: boolean }> = new Map(),
): PlanFeedback[] {
  const rows = planRows(plan);
  const pictured = new Set<string>();
  for (const row of rows) {
    const id = text(row["componentId"]);
    if (!id) continue;
    if (row["type"] === "generate_component_image") pictured.add(id);
    const patch = row["patch"] as Record<string, unknown> | undefined;
    if (row["type"] === "set_component_visual" && text(patch?.["media_url"]).trim()) pictured.add(id);
  }
  const out: PlanFeedback[] = [];
  rows.forEach((row, index) => {
    if (row["type"] === "add_component") {
      if (!IMAGE_COMPONENT_KINDS.has(text(row["kind"]))) return;
      const ref = text(row["ref"]);
      const own = text(row["media_url"]).trim() || text(row["mediaRef"]).trim();
      if (own || (ref && pictured.has(ref))) return;
      out.push({ index, type: "add_component", target: ref || text(row["kind"]), reason: "image_without_media", problem: IMAGE_WITHOUT_MEDIA_PROBLEM });
    } else if (row["type"] === "set_component") {
      const id = text(row["componentId"]);
      const current = existing.get(id);
      if (!current || !IMAGE_COMPONENT_KINDS.has(current.kind) || current.hasMedia || pictured.has(id)) return;
      out.push({ index, type: "set_component", target: id, reason: "image_without_media", problem: IMAGE_WITHOUT_MEDIA_PROBLEM });
    }
  });
  return out;
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
  const what = stale.every((entry) => entry.reason === "missing_page")
    ? "page"
    : stale.every((entry) => entry.reason === "missing_component")
      ? "button or card"
      : "section";
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
