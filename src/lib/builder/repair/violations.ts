/**
 * REVORA BUILDER — STRUCTURED VALIDATOR VIOLATIONS (repair hints).
 *
 * Before this module the edit validators (edit scope, the action reader,
 * content integrity, the business-facts precheck, the review firewall) each
 * dropped or refused a step with a sentence for the owner, and the planner
 * never heard why. Here every rejection becomes one `Violation` in a single
 * shape, so a repair turn can carry ALL of them at once:
 *
 *   path      JSON pointer into the plan ("/actions/2/tree/root/children/0/text")
 *   rule      stable id ("edit-scope.outside-boundary", "content-integrity.lorem_ipsum")
 *   severity  P0 (step would be dropped or is unsafe) · P1 · P2 (cosmetic)
 *   expected  one imperative line saying what would pass
 *   got       the offending value, truncated to 120 chars
 *   fixable   "deterministic" → fixed in code, zero tokens, before any model call
 *             "model"         → goes into the batched repair prompt
 *             "none"          → reported only, never repaired (see below)
 *
 * The review firewall is authoritative: a step the fact reviewer removed for
 * inventing facts is never revived by a repair turn (`fixable: "none"`).
 * Content integrity never invents a replacement: its violations ask the model
 * to use the owner's real facts or give up (`__unfixable__`), never to fill in.
 *
 * Pure: no network, no database, no model.
 */
import { readActions } from "@/lib/site-agent";
import { inspectContentIntegrity, type IntegrityViolation } from "@/lib/builder/content-integrity";
import { actionWithinEditScope, type EditScopeContext } from "@/lib/builder/edit-scope";
import { repairId } from "@/lib/builder/apply-plan";
import type { LaunchQualityReport } from "@/lib/builder/launch-quality-gate";
import { joinPointer, stringLeaves } from "./anchor-resolver";

export type Severity = "P0" | "P1" | "P2";

export type Violation = {
  path: string;
  rule: string;
  severity: Severity;
  expected: string;
  got: string;
  fixable: "deterministic" | "model" | "none";
};

export const SEVERITY_WEIGHT: Record<Severity, number> = { P0: 100, P1: 10, P2: 1 };
const SEVERITY_ORDER: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };

export const truncate = (value: unknown, max = 120): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export function sortViolations(list: Violation[]): Violation[] {
  return [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.path.localeCompare(b.path));
}

/** Weighted badness of a violation list; lower is better. */
export function violationScore(list: Violation[]): number {
  return list.reduce((sum, v) => sum + SEVERITY_WEIGHT[v.severity], 0);
}

/** "/actions/3/..." → 3 */
export function actionIndexOf(path: string): number | null {
  const match = /^\/actions\/(\d+)(?:\/|$)/.exec(path);
  return match ? Number(match[1]) : null;
}

export type KnownIds = { pageIds: Set<string>; sectionIds: Set<string>; componentIds: Set<string> };

/* ------------------------------- edit scope -------------------------------- */

export type ScopeBoundary = { sectionIds: string[] } | { pageIds: string[] };

export function editScopeViolations(actions: unknown[], context: EditScopeContext, boundary: ScopeBoundary | null): Violation[] {
  if (!boundary) return [];
  const allowed = "sectionIds" in boundary ? `section ${boundary.sectionIds.join(", ")}` : `page ${boundary.pageIds.join(", ")}`;
  const out: Violation[] = [];
  actions.forEach((action, index) => {
    if (actionWithinEditScope(action, context, boundary)) return;
    out.push({
      path: joinPointer(["actions", index]),
      rule: "edit-scope.outside-boundary",
      severity: "P1",
      expected: `Keep this change inside the requested ${allowed}: re-target it there, or return it as __unfixable__ if it only makes sense elsewhere.`,
      got: truncate(action),
      fixable: "model",
    });
  });
  return out;
}

/* ------------------------------ action reader ------------------------------ */

const ID_FIELDS: Array<{ key: string; pool: keyof KnownIds }> = [
  { key: "pageId", pool: "pageIds" },
  { key: "sectionId", pool: "sectionIds" },
  { key: "componentId", pool: "componentIds" },
];

/**
 * Which steps the action reader would refuse, and why. A step is judged in
 * the context of the steps before it (so a temporary ref created earlier
 * still resolves), exactly as the real reader sees the whole list.
 */
export function actionReaderViolations(actions: unknown[], known: KnownIds): Violation[] {
  const out: Violation[] = [];
  let previous = 0;
  for (let index = 0; index < actions.length; index += 1) {
    const dropped: string[] = [];
    const count = readActions(actions.slice(0, index + 1), known, dropped).length;
    if (count <= previous) {
      const action = actions[index] as Record<string, unknown> | null;
      const reason = dropped[dropped.length - 1] ?? "the step could not be read";
      const idSlip = action && typeof action === "object" ? ID_FIELDS.find(({ key, pool }) => {
        const value = action[key];
        if (typeof value !== "string" || known[pool].has(value)) return false;
        const repaired = repairId(value, known[pool]);
        return repaired !== value && known[pool].has(repaired);
      }) : undefined;
      out.push({
        path: joinPointer(["actions", index]),
        rule: idSlip ? "action-reader.near-miss-id" : "action-reader.refused",
        severity: "P0",
        expected: idSlip
          ? `Use the real ${idSlip.key} from the site.`
          : "Return a step the builder accepts: a known action type, real ids from the site (or a temp_ ref created earlier), and every required field.",
        got: truncate(reason),
        fixable: idSlip ? "deterministic" : "model",
      });
    }
    previous = Math.max(previous, count);
  }
  return out;
}

/* ---------------------------- content integrity ---------------------------- */

/** Keys whose string values reach a rendered page as words. */
const COPY_KEYS = new Set(["text", "value", "heading", "subheading", "body", "title", "headline", "label", "description", "caption", "quote", "alt", "items"]);
const HEADING_KEYS = new Set(["heading", "headline", "title"]);

/** The string leaves of one step that are owner-visible copy. */
export function copyLeaves(action: unknown, index: number) {
  if (!action || typeof action !== "object") return [];
  const row = action as Record<string, unknown>;
  const valueIsCopy = row["type"] === "set_business_fact" || row["type"] === "set_section_text";
  return stringLeaves(action, ["actions", index])
    .map((leaf) => ({ ...leaf, copyKey: /^\d+$/.test(leaf.key) ? (leaf.pointer.split("/").slice(-2, -1)[0] ?? "") : leaf.key }))
    .filter((leaf) => COPY_KEYS.has(leaf.copyKey) && (leaf.copyKey !== "value" || valueIsCopy));
}

function integrityRule(prefix: string, violation: IntegrityViolation, path: string, got: string): Violation {
  return {
    path,
    rule: `${prefix}.${violation.kind}`,
    severity: "P0",
    expected: `${violation.detail} Use only the owner's real facts; if they are missing, return this path as __unfixable__ instead of inventing anything.`,
    got: truncate(got),
    fixable: "model",
  };
}

/**
 * Content-integrity violations inside the copy a plan writes. Business facts
 * (`set_business_fact`) are judged by the same gate as the business-facts
 * precheck and reported under its rule namespace.
 */
export function contentIntegrityViolations(actions: unknown[]): Violation[] {
  const out: Violation[] = [];
  actions.forEach((action, index) => {
    if (!action || typeof action !== "object") return;
    const row = action as Record<string, unknown>;
    const isFact = row["type"] === "set_business_fact";
    const leaves = copyLeaves(action, index);
    for (const leaf of leaves) {
      const found = inspectContentIntegrity([
        { field: leaf.pointer, value: leaf.value, heading: HEADING_KEYS.has(leaf.key) || (row["field"] === "heading" && leaf.key === "value"), allowDuplicate: true },
      ]);
      for (const violation of found)
        out.push(integrityRule(isFact ? "business-facts-precheck" : "content-integrity", violation, leaf.pointer, leaf.value));
    }
  });
  return out;
}

/* ------------------------------ whitespace --------------------------------- */

const MESSY_SPACE = /^\s|\s$|[ \t]{2,}/;

export function whitespaceViolations(actions: unknown[]): Violation[] {
  const out: Violation[] = [];
  actions.forEach((action, index) => {
    for (const leaf of copyLeaves(action, index)) {
      if (!leaf.value.trim() || !MESSY_SPACE.test(leaf.value)) continue;
      out.push({
        path: leaf.pointer,
        rule: "text.whitespace",
        severity: "P2",
        expected: "No leading/trailing spaces and no runs of spaces.",
        got: truncate(leaf.value),
        fixable: "deterministic",
      });
    }
  });
  return out;
}

/* ------------------------------ authority ---------------------------------- */

/** Steps the fact reviewer removed. Reported, never repaired: rejection is authoritative. */
export function reviewFirewallViolations(rejected: { index: number; action: unknown }[]): Violation[] {
  return rejected.map(({ index, action }) => ({
    path: joinPointer(["proposed", index]),
    rule: "authority-firewall.review-rejected",
    severity: "P0",
    expected: "Removed by the fact and safety review; it is not brought back by a repair.",
    got: truncate(action),
    fixable: "none",
  }));
}

/* ---------------------------- launch quality ------------------------------- */

const LAUNCH_SEVERITY: Record<LaunchQualityReport["findings"][number]["priority"], Severity> = { critical: "P0", high: "P1", medium: "P2" };

/** Launch-quality findings as repair hints for a site-level repair (path "/site/<dimension>"). */
export function launchQualityViolations(report: LaunchQualityReport): Violation[] {
  return report.findings.map((finding) => ({
    path: joinPointer(["site", finding.dimension]),
    rule: `launch-quality-gate.${finding.dimension}`,
    severity: LAUNCH_SEVERITY[finding.priority],
    expected: finding.recommendation,
    got: `${finding.title} (score ${Math.round(finding.score)})`,
    fixable: "model",
  }));
}

/* ------------------------------ all at once -------------------------------- */

export type PlanValidationContext = {
  known: KnownIds;
  scopeContext: EditScopeContext;
  boundary: ScopeBoundary | null;
};

/** Every plan-level validator, in one list, ordered by severity. */
export function validatePlanActions(actions: unknown[], context: PlanValidationContext): Violation[] {
  return sortViolations([
    ...actionReaderViolations(actions, context.known),
    ...editScopeViolations(actions, context.scopeContext, context.boundary),
    ...contentIntegrityViolations(actions),
    ...whitespaceViolations(actions),
  ]);
}
