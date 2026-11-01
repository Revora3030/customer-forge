/**
 * Video-bar gate: score a generated site, and if it is under the bar regenerate ONLY the failing parts, at most
 * `maxRetries` times (default 2). Every attempt's failures are returned and handed to `record` so the quality log can
 * store them per trade.
 *
 * Pure orchestration. Nothing here reaches a model, a database or the network: regeneration is an injected function
 * that gets the model role to use (from `model-routing`: the strong roles for copy and layout, the cheap one for the
 * checks, which are mechanical and need no model at all). Parts that passed are never replaced, and the best
 * scoring version is kept, so a retry can never leave a site worse than before.
 */
import type { ModelRole } from "@/lib/ai/config";
import type { IntakeFacts } from "@/lib/builder/quality/facts-guard";
import { type QualityStep, roleForStep } from "@/lib/builder/quality/model-routing";
import {
  VIDEO_BAR, ownerFixList, repairTargets, scoreVideoBar,
  type CriterionId, type CriterionResult, type VideoScore, type VideoScoreInput,
} from "@/lib/builder/quality/video-score";
import type { ModelSection, SiteModel, SiteTheme } from "@/lib/builder/quality/video-site-model";

export const DEFAULT_MAX_RETRIES = 2;
const HARD_MAX_RETRIES = 5;

/** Words (copy) versus structure, motion, type, colour and images (layout). Each goes to the model role built for it. */
export const CRITERION_GROUP: Readonly<Record<CriterionId, "copy" | "layout">> = {
  truth_facts: "copy", anti_ai_lint: "copy",
  hero_cinematic: "layout", scroll_story: "layout", scroll_motion: "layout", signature_tool: "layout", lead_capture: "layout",
  cta_bar: "layout", type_rules: "layout", palette_rules: "layout", images: "layout", section_rhythm: "layout", mobile_layout: "layout", mobile_390: "layout",
};

const GROUP_STEP: Record<"copy" | "layout", QualityStep> = { copy: "copy", layout: "layout" };

/** One focused regeneration call. */
export type RegenerationRequest = {
  attempt: number;
  group: "copy" | "layout";
  step: QualityStep;
  role: ModelRole;
  /** Sections to rewrite. Every other section must be left exactly as it is. */
  sectionIds: string[];
  /** Parts that do not exist yet (for example `signature-tool`, `lead`, `cta-bar`) and must be added. */
  missing: string[];
  targets: CriterionId[];
  /** Plain instructions, one per failing criterion, ready to put in a prompt. */
  instructions: string[];
};

/** What a regeneration returns: replacement or new sections, and optionally theme changes (fonts, palette). */
export type RegenerationResult = { sections?: readonly ModelSection[] | undefined; theme?: Partial<SiteTheme> | undefined };

export type RegenerateFn = (request: RegenerationRequest) => Promise<RegenerationResult>;

export type GateFailureRecord = {
  criterion: CriterionId;
  label: string;
  score: number;
  detail: string;
  fix: string;
  sections: string[];
  missing: string[];
};

export type GateAttempt = {
  attempt: number;
  score: number;
  rawScore: number;
  passed: boolean;
  capped: VideoScore["capped"];
  /** Hard phone-check failures that held the score under the bar (G-A5). Logged inside `failures`, so no schema change. */
  blockers?: string[];
  failures: GateFailureRecord[];
  /** Section ids rewritten after this attempt (empty on the last one). */
  regenerated: string[];
  /** Which role scored this attempt and which roles regenerated. */
  roles: { check: ModelRole; regenerate: ModelRole[] };
  error?: string;
};

export type GateResult = {
  passed: boolean;
  bar: number;
  score: number;
  /** The best version produced, which is what should be saved. */
  site: SiteModel;
  final: VideoScore;
  attempts: GateAttempt[];
  retriesUsed: number;
  /** Criteria still failing at the end, which retries could not fix. */
  needsHuman: GateFailureRecord[];
  /** Plain-language fixes for the owner. Empty when passed. */
  ownerFixes: string[];
};

export const failureRecord = (c: CriterionResult): GateFailureRecord => ({
  criterion: c.id, label: c.label, score: Number(c.score.toFixed(3)), detail: c.detail, fix: c.fix, sections: [...c.sections], missing: [...c.missing],
});

const unmet = (s: VideoScore) => s.criteria.filter((c) => !c.met).map(failureRecord);

/** Splits repair targets into copy and layout requests. */
export function planRegeneration(score: VideoScore, attempt: number, env?: Record<string, string | undefined>): RegenerationRequest[] {
  const targets = repairTargets(score);
  const out: RegenerationRequest[] = [];
  for (const group of ["copy", "layout"] as const) {
    const mine = targets.filter((t) => CRITERION_GROUP[t.id] === group);
    if (!mine.length) continue;
    const step = GROUP_STEP[group];
    out.push({
      attempt, group, step, role: roleForStep(step, env),
      sectionIds: [...new Set(mine.flatMap((t) => t.sections))],
      missing: [...new Set(mine.flatMap((t) => t.missing))],
      targets: mine.map((t) => t.id),
      instructions: mine.map((t) => `${t.label}: ${t.detail} ${t.fix}`.replace(/\s+/g, " ").trim()),
    });
  }
  return out;
}

/** Replaces only the requested sections, adds new ones before the last section, and applies theme patches. */
export function applyRegeneration(site: SiteModel, request: RegenerationRequest, result: RegenerationResult): SiteModel {
  const allowed = new Set(request.sectionIds);
  const returned = new Map((result.sections ?? []).map((s) => [s.id, s]));
  const existing = new Set(site.sections.map((s) => s.id));
  const sections = site.sections.map((s) => (allowed.has(s.id) && returned.has(s.id) ? returned.get(s.id)! : s));
  const added = (result.sections ?? []).filter((s) => !existing.has(s.id) && request.missing.length > 0);
  if (added.length) sections.splice(Math.max(0, sections.length - 1), 0, ...added);
  const themeAllowed = request.targets.includes("type_rules") || request.targets.includes("palette_rules");
  const theme = themeAllowed && result.theme ? { ...site.theme, ...result.theme } : site.theme;
  return theme ? { ...site, sections, theme } : { ...site, sections };
}

export type GateInput = {
  site: SiteModel;
  blueprint: VideoScoreInput["blueprint"];
  intake: IntakeFacts;
  regenerate: RegenerateFn;
  bar?: number;
  maxRetries?: number;
  /** Called after every attempt, including the first, so failures are stored even if a later step throws. */
  record?: (attempt: GateAttempt) => void | Promise<void>;
  env?: Record<string, string | undefined>;
};

export async function runVideoGate(input: GateInput): Promise<GateResult> {
  const bar = input.bar ?? VIDEO_BAR;
  const cap = Math.max(0, Math.min(Math.floor(input.maxRetries ?? DEFAULT_MAX_RETRIES), HARD_MAX_RETRIES));
  const checkRole = roleForStep("review", input.env);
  const attempts: GateAttempt[] = [];
  let best = { site: input.site, score: scoreVideoBar({ site: input.site, blueprint: input.blueprint, intake: input.intake }, bar) };
  let current = best;

  for (let attempt = 0; attempt <= cap; attempt += 1) {
    const requests = current.score.passed ? [] : planRegeneration(current.score, attempt, input.env);
    const willRetry = requests.length > 0 && attempt < cap;
    let next: SiteModel | null = null;
    let error: string | undefined;
    if (willRetry) {
      try {
        let draft = current.site;
        for (const request of requests) draft = applyRegeneration(draft, request, await input.regenerate(request));
        next = draft;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    const record: GateAttempt = {
      attempt, score: current.score.score, rawScore: current.score.rawScore, passed: current.score.passed, capped: current.score.capped, blockers: current.score.blockers,
      failures: unmet(current.score),
      regenerated: willRetry && !error ? [...new Set(requests.flatMap((r) => r.sectionIds))] : [],
      roles: { check: checkRole, regenerate: willRetry ? requests.map((r) => r.role) : [] },
      ...(error ? { error } : {}),
    };
    attempts.push(record);
    await input.record?.(record);
    if (!next) break;
    const scored = scoreVideoBar({ site: next, blueprint: input.blueprint, intake: input.intake }, bar);
    current = { site: next, score: scored };
    if (scored.score >= best.score.score) best = current;
  }

  // Keep the best version seen. A retry never leaves the site worse than it was.
  const final = best.score;
  return {
    passed: final.passed, bar, score: final.score, site: best.site, final, attempts,
    retriesUsed: attempts.filter((a) => a.roles.regenerate.length > 0 && !a.error).length,
    needsHuman: final.passed ? [] : unmet(final),
    ownerFixes: final.passed ? [] : ownerFixList(final),
  };
}
