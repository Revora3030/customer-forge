/**
 * STAGE: OBJECTIVE SELF-REVIEW, then AUTO-FIX.
 *
 * Before the owner ever sees a plan, the agent reviews its own work against
 * objective launch constraints: request coverage, truthfulness, conversion path,
 * mobile safety, accessibility, SEO, content completeness, links and performance.
 *
 * This is not a taste score. When the model finds fixable launch issues, the
 * orchestrator runs one more planning pass using those issues as the brief.
 */

import { callJson } from "@/lib/site-agent.server";
import type { ModelRole } from "@/lib/ai/config";

export const CRITIQUE_DIMENSIONS = [
  "conversion",
  "mobile",
  "accessibility",
  "seo",
  "content",
  "truthfulness",
  "requirements",
  "links",
  "performance",
] as const;

export type CritiqueDimension = (typeof CRITIQUE_DIMENSIONS)[number];

export type Critique = {
  scores: Record<CritiqueDimension, number>;
  /** Mean objective readiness score, 0-10, one decimal; informational only. */
  overall: number;
  /** Concrete objective fixes, worst dimension first. */
  fixes: string[];
  /** One honest line for the owner. */
  verdict: string;
  source: "model" | "skipped";
};

const CRITIQUE_ROLE: ModelRole = "fast";

const SYSTEM = `You are a demanding launch-safety reviewer for a planned set of changes to a real local
business website before it goes live. You are not a taste judge — you are checking objective failures.

Score each dimension 0-10 only for concrete readiness risks: missing requested work, unsupported claims,
broken or unsafe links/forms, mobile overflow risk, accessibility issues, SEO omissions, thin required content,
or performance-heavy instructions. Do not grade whether a design is beautiful, distinctive or premium.

Return JSON only:
{
  "scores": {"conversion":0,"mobile":0,"accessibility":0,"seo":0,"content":0,"truthfulness":0,"requirements":0,"links":0,"performance":0},
  "fixes": ["specific, actionable fixes for objective issues — name the section and what to change"],
  "verdict": "one honest sentence about the objective readiness of the plan"
}

Rules:
- Judge the plan against the owner's request, supplied facts and objective launch constraints.
- A fix must be something the plan can actually do to the website's pages, sections, copy, colours,
  search text, links or effects. Never suggest inventing reviews, ratings, awards or prices.
- If there are no objective issues, say so and return no fixes. Do not manufacture criticism.`;

const clamp = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 6;
  return Math.max(0, Math.min(10, Math.round(number * 10) / 10));
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Reviews one plan. Never throws: an unusable gateway returns a skipped critique. */
export async function critiquePlan(options: {
  goal: string;
  designBrief: string;
  actions: object[];
  requirements: string[];
}): Promise<Critique> {
  try {
    const raw = await callJson(
      CRITIQUE_ROLE,
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            `THE OWNER'S GOAL: ${options.goal}`,
            "",
            options.designBrief,
            "",
            "REQUIREMENTS THIS PLAN MUST MEET:",
            ...options.requirements.map((item, index) => `${index + 1}. ${item}`),
            "",
            "THE PLANNED CHANGES:",
            JSON.stringify(options.actions).slice(0, 14_000),
          ].join("\n"),
        },
      ],
      { task: "agent.critique" },
    );

    const rawScores = (raw["scores"] ?? {}) as Record<string, unknown>;
    const scores = Object.fromEntries(
      CRITIQUE_DIMENSIONS.map((dimension) => [dimension, clamp(rawScores[dimension])]),
    ) as Record<CritiqueDimension, number>;
    const overall =
      Math.round(
        (CRITIQUE_DIMENSIONS.reduce((total, dimension) => total + scores[dimension], 0) /
          CRITIQUE_DIMENSIONS.length) *
          10,
      ) / 10;
    const fixes = (Array.isArray(raw["fixes"]) ? raw["fixes"] : [])
      .map((item) => text(item, 240))
      .filter(Boolean)
      .slice(0, 6);

    return {
      scores,
      overall,
      fixes,
      verdict: text(raw["verdict"], 300),
      source: "model",
    };
  } catch {
    return {
      scores: Object.fromEntries(CRITIQUE_DIMENSIONS.map((dimension) => [dimension, 0])) as Record<
        CritiqueDimension,
        number
      >,
      overall: 0,
      fixes: [],
      verdict: "",
      source: "skipped",
    };
  }
}

/** The auto-fix brief: address objective issues, do not restate the plan. */
export function improvementBrief(critique: Critique, goal: string, actions: object[]) {
  const weakest = CRITIQUE_DIMENSIONS.filter((dimension) => critique.scores[dimension] < 7).map(
    (dimension) => `${dimension} (${critique.scores[dimension]}/10)`,
  );
  return [
    "YOUR OWN REVIEW FOUND OBJECTIVE LAUNCH ISSUES. FIX THEM WITHOUT CHANGING TASTE FOR ITS OWN SAKE.",
    "",
    `THE OWNER'S GOAL: ${goal}`,
    `READINESS: ${critique.overall}/10${weakest.length ? `. Weakest objective areas: ${weakest.join(", ")}` : ""}`,
    "",
    "FIXES YOU IDENTIFIED YOURSELF:",
    ...critique.fixes.map((fix, index) => `${index + 1}. ${fix}`),
    "",
    "ACTIONS ALREADY PLANNED:",
    JSON.stringify(actions).slice(0, 12_000),
    "",
    'Return the same JSON shape. "actions" must contain ONLY the ADDITIONAL or CORRECTED actions that',
    "carry out the fixes above — do not repeat an action already listed. Write real, specific copy.",
    'Put anything you deliberately did not do in "notes". Never invent a fact to close a gap.',
  ].join("\n");
}
