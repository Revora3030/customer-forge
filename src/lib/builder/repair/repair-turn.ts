/**
 * REVORA BUILDER — THE BATCHED REPAIR TURN.
 *
 * One repair turn carries every failure at once, not N turns carrying one each.
 * The ladder, never more than two model calls:
 *
 *   round 0  deterministic fixes only (zero tokens): near-miss ids, whitespace;
 *   round 1  ONE batched repair call with every model-fixable violation, the
 *            failing subtrees keyed by path, ordered by severity;
 *   round 2  the same, plus the round-1 violations restated as "attempted and
 *            failed";
 *   stop     whatever still fails is handed back to the caller's existing
 *            drop/keep rules with its reason. Never a third call.
 *
 * Bounded: a hard per-call timeout, a total wall-clock budget, and a spend
 * budget checked before every call. Any error, timeout or unusable answer
 * fails open to the pre-repair plan, so the repair turn can only ever make a
 * plan better, never block it.
 *
 * Apply is pure assignment at a JSON pointer, or search/replace inside one
 * string resolved by the fuzzy anchor cascade (minConfidence 0.8). Only paths
 * inside a violation may be written; a repaired plan is accepted only when its
 * weighted violation score is strictly lower and no step that was clean before
 * picked up a new violation.
 */
import { repairId } from "@/lib/builder/apply-plan";
import {
  ANCHOR_MIN_CONFIDENCE,
  applyBatch,
  getAtPointer,
  pointerTokens,
  resolveNodeAnchor,
  setAtPointer,
} from "./anchor-resolver";
import {
  actionIndexOf,
  sortViolations,
  truncate,
  violationScore,
  type KnownIds,
  type Violation,
} from "./violations";

export const REPAIR_MAX_MODEL_CALLS = 2;
export const REPAIR_CALL_TIMEOUT_MS = 25_000;
export const REPAIR_TOTAL_TIMEOUT_MS = 45_000;
/** 25 cents. Checked before each call, against what this turn already spent. */
export const REPAIR_MAX_COST_MICROCENTS = 25_000_000;
export const REPAIR_MAX_VIOLATIONS_IN_PROMPT = 24;
const FRAGMENT_CHARS = 6_000;

export type RepairModelCall = (request: { user: string; signal: AbortSignal }) => Promise<
  { ok: true; text: string; costMicrocents: number } | { ok: false; reason: string }
>;

export type RepairBudget = { maxCalls?: number; callTimeoutMs?: number; totalTimeoutMs?: number; maxCostMicrocents?: number };

export type RepairOutcome = {
  actions: unknown[];
  /** The plan after round 0 only (no model output in it). */
  deterministicActions: unknown[];
  before: Violation[];
  after: Violation[];
  modelCalls: number;
  costMicrocents: number;
  deterministicFixes: number;
  unfixable: string[];
  /** One line per event, for the server log and plan trace. */
  log: string[];
  /** Why the loop stopped. */
  stopped: "clean" | "nothing_model_fixable" | "max_calls" | "budget" | "timeout" | "no_improvement" | "model_unavailable";
};

/* ---------------------------- deterministic -------------------------------- */

const ID_KEYS: Array<{ key: string; pool: keyof KnownIds }> = [
  { key: "pageId", pool: "pageIds" },
  { key: "sectionId", pool: "sectionIds" },
  { key: "componentId", pool: "componentIds" },
];

/** Round 0. Fixes every `fixable: "deterministic"` violation in code. */
export function applyDeterministicFixes(actions: unknown[], violations: Violation[], known: KnownIds): { actions: unknown[]; fixed: number } {
  let out = actions;
  let fixed = 0;
  for (const violation of violations) {
    if (violation.fixable !== "deterministic") continue;
    if (violation.rule === "text.whitespace") {
      const at = getAtPointer({ actions: out }, violation.path);
      if (!at.found || typeof at.value !== "string") continue;
      const clean = at.value.replace(/[ \t]{2,}/g, " ").trim();
      if (clean === at.value || !clean) continue;
      const next = setAtPointer({ actions: out }, violation.path, clean);
      if (next.ok) {
        out = next.root.actions;
        fixed += 1;
      }
    } else if (violation.rule === "action-reader.near-miss-id") {
      const index = actionIndexOf(violation.path);
      const action = index == null ? null : (out[index] as Record<string, unknown> | undefined);
      if (!action || typeof action !== "object") continue;
      const copy = { ...action };
      let changed = false;
      for (const { key, pool } of ID_KEYS) {
        const value = copy[key];
        if (typeof value !== "string" || known[pool].has(value)) continue;
        const repaired = repairId(value, known[pool]);
        if (repaired !== value && known[pool].has(repaired)) {
          copy[key] = repaired;
          changed = true;
        }
      }
      if (changed) {
        out = out.map((item, i) => (i === index ? copy : item));
        fixed += 1;
      }
    }
  }
  return { actions: out, fixed };
}

/* -------------------------------- prompt ----------------------------------- */

export function buildRepairPrompt(actions: unknown[], violations: Violation[], failedBefore: Violation[] = []): string {
  const list = sortViolations(violations).slice(0, REPAIR_MAX_VIOLATIONS_IN_PROMPT);
  const fragment: Record<string, unknown> = {};
  for (const v of list) {
    const at = getAtPointer({ actions }, v.path);
    if (at.found) fragment[v.path] = at.value;
  }
  let fragmentText = JSON.stringify(fragment, null, 1);
  if (fragmentText.length > FRAGMENT_CHARS) fragmentText = `${fragmentText.slice(0, FRAGMENT_CHARS)}\n…(truncated)`;
  const lines = [
    "You are repairing a JSON website change plan. The plan is JSON. Some of its steps fail the following rules.",
    "",
    "TREE (only the failing subtrees are included, keyed by their root paths):",
    "<tree_fragment>",
    fragmentText,
    "</tree_fragment>",
    "",
    `VIOLATIONS (${list.length} total, ordered by severity):`,
    ...list.flatMap((v, i) => [
      `${i + 1}. path: ${v.path}`,
      `   rule: ${v.rule}`,
      `   severity: ${v.severity}`,
      `   expected: ${v.expected}`,
      `   got: ${JSON.stringify(v.got)}`,
    ]),
  ];
  if (failedBefore.length) {
    lines.push(
      "",
      "THESE WERE ATTEMPTED AND FAILED in the previous repair. Do not repeat that answer; fix them differently or mark them __unfixable__:",
      ...sortViolations(failedBefore)
        .slice(0, REPAIR_MAX_VIOLATIONS_IN_PROMPT)
        .map((v) => `- ${v.path} (${v.rule})`),
    );
  }
  lines.push(
    "",
    "OUTPUT CONTRACT — read carefully:",
    "- Return ONE JSON object and nothing else: no commentary, no markdown fences.",
    "- To replace a node: a key that is EXACTLY one of the `path` strings above; the value is the complete replacement node at that path (not a diff). Do not invent or renumber paths.",
    '- To change words inside one text value: put {"path": <a path above or a path inside it>, "search": <the exact current words>, "replace": <the new words>} objects in an "__edits__" array.',
    "- Do not return unchanged nodes, siblings, or the whole plan.",
    "- Never invent facts (prices, licences, years, reviews, phone numbers, addresses). Use only facts already in the plan or the owner's request.",
    '- If a violation cannot be fixed without changing something outside its own path, or without inventing a fact, list its path in "__unfixable__": ["<path>", ...].',
    "",
    "Shape:",
    '{ "/actions/2": { ...full step... }, "__edits__": [{"path": "/actions/4/value", "search": "old words", "replace": "new words"}], "__unfixable__": [] }',
  );
  return lines.join("\n");
}

/* --------------------------------- apply ----------------------------------- */

const isInside = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

function parseObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Applies one repair answer. Replacements must target a violation path
 * exactly; search/replace edits must land inside a violation path and are
 * resolved with the fuzzy anchor cascade. Everything else is ignored.
 */
export function applyRepairAnswer(
  actions: unknown[],
  answerText: string,
  violations: Violation[],
): { actions: unknown[]; applied: number; ignored: string[]; unfixable: string[] } {
  const answer = parseObject(answerText);
  const ignored: string[] = [];
  if (!answer) return { actions, applied: 0, ignored: ["answer was not a JSON object"], unfixable: [] };
  const paths = new Set(violations.map((v) => v.path));
  const unfixable = Array.isArray(answer["__unfixable__"])
    ? (answer["__unfixable__"] as unknown[]).filter((p): p is string => typeof p === "string" && paths.has(p))
    : [];
  let doc: { actions: unknown[] } = { actions };
  let applied = 0;

  for (const [key, value] of Object.entries(answer)) {
    if (key === "__edits__" || key === "__unfixable__") continue;
    if (!paths.has(key) || !pointerTokens(key)) {
      ignored.push(`replacement for unknown path ${truncate(key, 60)}`);
      continue;
    }
    const next = setAtPointer(doc, key, value);
    if (next.ok) {
      doc = next.root;
      applied += 1;
    } else ignored.push(`replacement path ${key} no longer exists`);
  }

  const edits = Array.isArray(answer["__edits__"]) ? (answer["__edits__"] as unknown[]) : [];
  // Group edits by the string leaf they resolve to, then apply each group as
  // one order-invariant batch against that leaf's original text.
  const groups = new Map<string, { id: string; search: string; replace: string }[]>();
  edits.forEach((raw, i) => {
    const edit = raw as Record<string, unknown> | null;
    const path = typeof edit?.["path"] === "string" ? (edit["path"] as string) : "";
    const search = typeof edit?.["search"] === "string" ? (edit["search"] as string) : "";
    const replace = typeof edit?.["replace"] === "string" ? (edit["replace"] as string) : null;
    const owner = [...paths].find((p) => isInside(path, p));
    if (!owner || !search || replace === null) {
      ignored.push(`edit ${i + 1} is outside every violation path or incomplete`);
      return;
    }
    const anchor = resolveNodeAnchor(doc, { path, expectText: search, scope: owner }, { minConfidence: ANCHOR_MIN_CONFIDENCE });
    if (anchor.matchType === "none" || anchor.matchType === "ambiguous") {
      ignored.push(`edit ${i + 1}: ${anchor.matchType} anchor`);
      return;
    }
    const leaf = getAtPointer(doc, anchor.path);
    if (!leaf.found || typeof leaf.value !== "string") {
      ignored.push(`edit ${i + 1}: target is not text`);
      return;
    }
    groups.set(anchor.path, [...(groups.get(anchor.path) ?? []), { id: String(i + 1), search, replace }]);
  });
  for (const [path, group] of groups) {
    const original = getAtPointer(doc, path).value as string;
    const result = applyBatch(original, group, { minConfidence: ANCHOR_MIN_CONFIDENCE });
    for (const failure of result.failed) ignored.push(`edit ${failure.editId}: ${failure.matchType} (${failure.hint})`);
    if (!result.applied) continue;
    const next = setAtPointer(doc, path, result.text);
    if (next.ok) {
      doc = next.root;
      applied += result.applied;
    }
  }
  return { actions: doc.actions, applied, ignored, unfixable };
}

/** Steps (by index) that carry at least one violation. */
const dirtySteps = (list: Violation[]) => new Set(list.map((v) => actionIndexOf(v.path)).filter((i): i is number => i !== null));

/**
 * Accept a repaired plan only if it is strictly better and did not make a
 * previously clean step dirty (or change the number of steps).
 */
export function isImprovement(before: { actions: unknown[]; violations: Violation[] }, after: { actions: unknown[]; violations: Violation[] }): boolean {
  if (after.actions.length !== before.actions.length) return false;
  if (violationScore(after.violations) >= violationScore(before.violations)) return false;
  const wasDirty = dirtySteps(before.violations);
  for (const index of dirtySteps(after.violations)) if (!wasDirty.has(index)) return false;
  // Only violating steps may have changed at all.
  for (let i = 0; i < before.actions.length; i += 1)
    if (!wasDirty.has(i) && JSON.stringify(before.actions[i]) !== JSON.stringify(after.actions[i])) return false;
  return true;
}

/* ---------------------------------- loop ----------------------------------- */

export async function runRepairTurn(input: {
  actions: unknown[];
  validate: (actions: unknown[]) => Violation[];
  known: KnownIds;
  callModel: RepairModelCall;
  budget?: RepairBudget;
  now?: () => number;
}): Promise<RepairOutcome> {
  const now = input.now ?? Date.now;
  const started = now();
  const maxCalls = Math.min(input.budget?.maxCalls ?? REPAIR_MAX_MODEL_CALLS, REPAIR_MAX_MODEL_CALLS);
  const callTimeout = input.budget?.callTimeoutMs ?? REPAIR_CALL_TIMEOUT_MS;
  const totalTimeout = input.budget?.totalTimeoutMs ?? REPAIR_TOTAL_TIMEOUT_MS;
  const maxCost = input.budget?.maxCostMicrocents ?? REPAIR_MAX_COST_MICROCENTS;
  const log: string[] = [];

  const before = input.validate(input.actions);
  let actions = input.actions;
  let violations = before;
  let deterministicFixes = 0;

  // Round 0: deterministic, zero tokens.
  if (violations.some((v) => v.fixable === "deterministic")) {
    const fixed = applyDeterministicFixes(actions, violations, input.known);
    const revalidated = input.validate(fixed.actions);
    if (fixed.fixed && isImprovement({ actions, violations }, { actions: fixed.actions, violations: revalidated })) {
      actions = fixed.actions;
      violations = revalidated;
      deterministicFixes = fixed.fixed;
      log.push(`deterministic: fixed ${fixed.fixed}`);
    }
  }

  const deterministicActions = actions;
  let modelCalls = 0;
  let costMicrocents = 0;
  const unfixable = new Set<string>();
  let failedBefore: Violation[] = [];
  let stopped: RepairOutcome["stopped"] = "clean";

  for (;;) {
    const open = violations.filter((v) => v.fixable === "model" && !unfixable.has(v.path));
    if (!violations.length) {
      stopped = "clean";
      break;
    }
    if (!open.length) {
      stopped = "nothing_model_fixable";
      break;
    }
    if (modelCalls >= maxCalls) {
      stopped = "max_calls";
      break;
    }
    if (costMicrocents >= maxCost) {
      stopped = "budget";
      break;
    }
    const remaining = totalTimeout - (now() - started);
    if (remaining <= 1_000) {
      stopped = "timeout";
      break;
    }
    const controller = new AbortController();
    const limit = Math.min(callTimeout, remaining);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<{ ok: false; reason: string }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, reason: "timeout" });
      }, limit);
    });
    modelCalls += 1;
    let answer: Awaited<ReturnType<RepairModelCall>>;
    try {
      answer = await Promise.race([input.callModel({ user: buildRepairPrompt(actions, open, failedBefore), signal: controller.signal }), timeout]);
    } catch (error) {
      answer = { ok: false, reason: error instanceof Error ? error.message : "error" };
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!answer.ok) {
      log.push(`repair call ${modelCalls}: ${answer.reason}`);
      stopped = answer.reason === "timeout" ? "timeout" : "model_unavailable";
      break;
    }
    costMicrocents += Math.max(0, answer.costMicrocents || 0);
    const repaired = applyRepairAnswer(actions, answer.text, open);
    for (const path of repaired.unfixable) unfixable.add(path);
    const revalidated = input.validate(repaired.actions);
    log.push(
      `repair call ${modelCalls}: applied ${repaired.applied}, unfixable ${repaired.unfixable.length}, ignored ${repaired.ignored.length}, violations ${violations.length} → ${revalidated.length}`,
    );
    if (repaired.applied && isImprovement({ actions, violations }, { actions: repaired.actions, violations: revalidated })) {
      failedBefore = revalidated.filter((v) => open.some((o) => o.path === v.path));
      actions = repaired.actions;
      violations = revalidated;
    } else {
      failedBefore = open;
      if (modelCalls >= maxCalls) {
        stopped = "no_improvement";
        break;
      }
    }
  }

  return { actions, deterministicActions, before, after: violations, modelCalls, costMicrocents, deterministicFixes, unfixable: [...unfixable], log, stopped };
}

