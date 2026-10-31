/**
 * QP-4 · The step chain: plan → copy → layout → self-review.
 *
 * Replaces one giant prompt with four small, focused ones. Each step sees only what it needs and returns a
 * typed result the next step builds on. The runner is pure and takes the model call as an injected function, so it
 * is testable offline and the server code decides how to reach a model (it passes the role from `model-routing`).
 *
 * Nothing here reaches a model, a database or the network.
 */
import { type QualityStep, roleForStep } from "@/lib/builder/quality/model-routing";
import type { ModelRole } from "@/lib/ai/config";

export type ChainStep = "plan" | "copy" | "layout" | "review";
export const CHAIN_ORDER: readonly ChainStep[] = ["plan", "copy", "layout", "review"];

/** Text blocks the earlier modules produce. All optional so the chain still runs with whatever exists. */
export type ChainInputs = {
  /** `LoadedBlueprint.promptBlock` */
  blueprintBlock: string;
  /** Owner intake rendered as supplied facts plus owner-fill markers for the gaps. */
  factsBlock: string;
  /** `goldReferenceBlock(...)` */
  goldBlock: string;
  /** What the owner asked for, in their words, if anything. */
  request?: string;
};

export type ReviewIssue = { part: string; problem: string };

export type ChainResults = {
  plan?: string;
  copy?: string;
  layout?: string;
  review?: { passed: boolean; issues: ReviewIssue[] };
};

export type StepCall = { step: ChainStep; role: ModelRole; system: string; prompt: string };
/** Returns the model's text. Throws on failure. */
export type StepExecutor = (call: StepCall) => Promise<string>;

export type StepTrace = { step: ChainStep; role: ModelRole; ok: boolean; ms: number; promptChars: number; error?: string };

export type ChainOutcome = { ok: boolean; results: ChainResults; trace: StepTrace[]; failedStep: ChainStep | null };

const RULES =
  "Use only the owner's supplied facts. Where a fact is missing keep its [Add your ...] marker exactly as written. Never invent a review, rating, number, phone, price, year or award.";

/** The system and user prompt for one step. Focused: each step gets only the blocks it needs. */
export function stepPrompt(step: ChainStep, inputs: ChainInputs, results: ChainResults): { system: string; prompt: string } {
  const request = inputs.request ? `OWNER REQUEST:\n${inputs.request}` : "";
  switch (step) {
    case "plan":
      return {
        system: `You plan a small-business website. ${RULES} Reply with the page plan only: sections in order, the purpose of each, which owner facts feed it, and the signature tool.`,
        prompt: [inputs.blueprintBlock, inputs.factsBlock, request].filter(Boolean).join("\n\n"),
      };
    case "copy":
      return {
        system: `You write the words for a small-business website from an approved plan. ${RULES} Plain, specific, human wording. No filler phrases.`,
        prompt: [`PLAN:\n${results.plan ?? ""}`, inputs.factsBlock, request].filter(Boolean).join("\n\n"),
      };
    case "layout":
      return {
        system: `You design the layout and motion for a small-business website from an approved plan and copy. ${RULES} Follow the gold references for quality and motion, not for content.`,
        prompt: [inputs.blueprintBlock, inputs.goldBlock, `PLAN:\n${results.plan ?? ""}`, `COPY:\n${results.copy ?? ""}`].filter(Boolean).join("\n\n"),
      };
    case "review":
      return {
        system:
          'You review a finished draft against its plan and the owner\'s facts. Reply with JSON only: {"passed": boolean, "issues": [{"part": string, "problem": string}]}. Flag invented facts, generic template wording, missing owner-fill markers and sections that do not match the plan.',
        prompt: [`PLAN:\n${results.plan ?? ""}`, inputs.factsBlock, `COPY:\n${results.copy ?? ""}`, `LAYOUT:\n${results.layout ?? ""}`].join("\n\n"),
      };
  }
}

/** Reads the review step's JSON. Anything unreadable counts as not passed, never as passed. */
export function parseReview(text: string): { passed: boolean; issues: ReviewIssue[] } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { passed: false, issues: [{ part: "review", problem: "the review did not return a readable answer" }] };
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { passed?: unknown; issues?: unknown };
    const issues: ReviewIssue[] = Array.isArray(raw.issues)
      ? raw.issues
          .filter((i): i is { part?: unknown; problem?: unknown } => !!i && typeof i === "object")
          .map((i) => ({ part: String(i.part ?? "page").slice(0, 80), problem: String(i.problem ?? "").slice(0, 300) }))
          .filter((i) => i.problem)
      : [];
    return { passed: raw.passed === true && issues.length === 0, issues };
  } catch {
    return { passed: false, issues: [{ part: "review", problem: "the review did not return valid JSON" }] };
  }
}

/**
 * Runs plan → copy → layout → review. A failed step stops the chain and is reported; later steps never run on
 * missing input. The review result is data for the quality gate, it does not throw.
 */
export async function runStepChain(
  inputs: ChainInputs,
  execute: StepExecutor,
  options: { env?: Readonly<Record<string, string | undefined>>; now?: () => number } = {},
): Promise<ChainOutcome> {
  const now = options.now ?? Date.now;
  const results: ChainResults = {};
  const trace: StepTrace[] = [];
  for (const step of CHAIN_ORDER) {
    const role = roleForStep(step as QualityStep, options.env);
    const { system, prompt } = stepPrompt(step, inputs, results);
    const started = now();
    try {
      const text = await execute({ step, role, system, prompt });
      if (!text || !text.trim()) throw new Error("empty answer");
      if (step === "review") results.review = parseReview(text);
      else results[step] = text;
      trace.push({ step, role, ok: true, ms: now() - started, promptChars: prompt.length });
    } catch (error) {
      trace.push({ step, role, ok: false, ms: now() - started, promptChars: prompt.length, error: error instanceof Error ? error.message : String(error) });
      return { ok: false, results, trace, failedStep: step };
    }
  }
  return { ok: true, results, trace, failedStep: null };
}
