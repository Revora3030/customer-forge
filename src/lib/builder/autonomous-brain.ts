/**
 * REVORA AUTONOMOUS BUILDER BRAIN v3
 *
 * Free-first decision layer between plain-English outcomes and the existing
 * deterministic compiler. It diagnoses the current workspace, normalises
 * conversational language, translates business outcomes into coordinated
 * website concerns, then lets the existing safety compiler produce bounded
 * actions.
 *
 * This layer never executes mutations, calls a model, accesses the network, or
 * invents business facts.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import { buildDeterministicPlan, type BuilderOptions, type DeterministicPlan } from "./deterministic";
import { diagnoseSite, applyAutopilot, autopilotSummary } from "./autopilot";
import { interpret } from "./interpreter";
import { normalise } from "./normalize";
import { qualityProfile } from "./quality-profile";

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/**
 * Determine whether the request describes a broad site-level outcome.
 *
 * Normalisation intentionally rewrites phrases such as "make my website
 * better" into compiler vocabulary such as "redesign conversion visual...".
 * Broad detection therefore recognizes both owner language and the stable
 * vocabulary produced by the normalizer. This prevents semantic preprocessing
 * from accidentally downgrading a broad request into a narrow request.
 */
const broadRequest = (text: string): boolean => {
  const value = text.toLowerCase();
  return [
    "make my website better", "make my site better", "improve my website",
    "improve the site", "fix everything", "fix whatever is wrong",
    "upgrade my website", "make it great", "make this great", "make it better",
    "grow my business", "grow the business", "help my business grow",
    "get more customers", "get more leads", "get more calls", "get more bookings",
    "book more jobs", "sell more", "convert more", "increase conversions",
    "look more professional", "look premium", "make it premium", "make it modern",
    "make it look expensive", "make it look better", "make it cleaner",
    "get found", "rank better", "improve seo", "improve local seo",
    "fix mobile", "make it mobile friendly", "work better on phones",
    "make it clearer", "make it simple", "make it easier", "less confusing",
    "whole site", "entire site", "every page", "all pages", "sitewide", "site-wide",
    "redesign", "restyle", "conversion", "more leads", "premium visual",
    "visual hierarchy", "mobile responsive", "local seo",
  ].some((phrase) => value.includes(phrase));
};

/**
 * Outcome bundles turn human goals into coordinated, deterministic concerns.
 * They are deliberately additive: the user's request remains the source of
 * truth and site diagnosis decides which areas are actually worth touching.
 */
const OUTCOME_BUNDLES: Array<{ phrases: string[]; terms: string[]; label: string }> = [
  {
    phrases: [
      "more customers", "more leads", "more calls", "more bookings", "book more jobs", "convert more",
      "conversion leads", "conversion calls", "conversion booking", "call to action leads",
    ],
    terms: ["conversion", "call to action", "leads", "mobile", "trust"],
    label: "customer acquisition",
  },
  {
    phrases: [
      "look premium", "look expensive", "more professional", "make it premium", "make it modern", "look better",
      "premium visual", "visual premium", "restyle", "redesign",
    ],
    terms: ["design", "restyle", "hierarchy", "typography", "premium"],
    label: "premium presentation",
  },
  {
    phrases: ["get found", "rank better", "improve seo", "local seo", "seo"],
    terms: ["seo", "local seo", "content", "trust"],
    label: "search visibility",
  },
  {
    phrases: ["fix mobile", "mobile friendly", "work better on phones", "mobile responsive", "mobile"],
    terms: ["mobile", "responsive", "conversion"],
    label: "mobile experience",
  },
  {
    phrases: ["make it clearer", "make it simple", "make it easier", "less confusing", "simple hierarchy"],
    terms: ["hierarchy", "clarity", "call to action", "conversion"],
    label: "clarity and usability",
  },
];

/** Translate a request and inferred intent into deduplicated outcome terms. */
function outcomeTerms(instruction: string, inferred: { goals: string[]; verbs: string[]; moods: string[] }) {
  const value = instruction.toLowerCase();
  const matched = OUTCOME_BUNDLES.filter((bundle) =>
    bundle.phrases.some((phrase) => value.includes(phrase)),
  );

  return {
    labels: matched.map((bundle) => bundle.label),
    terms: unique([
      ...matched.flatMap((bundle) => bundle.terms),
      ...inferred.goals,
      ...inferred.verbs,
      ...inferred.moods,
    ]),
  };
}

/**
 * Build one coherent plan from a broad outcome request.
 *
 * v3 makes the language normaliser the first semantic boundary. That means
 * typos, contractions, idioms and follow-up pronouns are resolved before the
 * autonomous diagnosis and outcome bundles make decisions. The original text
 * remains available to the deterministic compiler through the final prompt,
 * so normalisation improves matching without discarding user wording.
 */
export function buildAutonomousPlan(
  context: AgentContext,
  instruction: string,
  options: BuilderOptions = {},
): DeterministicPlan {
  const history = options.history ?? [];
  const normalized = normalise(instruction, history);
  const planningInstruction = normalized.text || instruction;
  const diagnosis = diagnoseSite(context);
  const baseIntent = interpret(planningInstruction, history);
  const inferred = applyAutopilot(context, planningInstruction, baseIntent);
  const outcomes = outcomeTerms(planningInstruction, inferred);

  if (!broadRequest(planningInstruction)) {
    const plan = buildDeterministicPlan(context, planningInstruction, options);
    return {
      ...plan,
      trace: unique([
        ...plan.trace,
        normalized.text !== normalized.original
          ? "Autonomous Brain v3: normalised conversational wording before planning."
          : "",
        `Site readiness: ${autopilotSummary(diagnosis)}`,
      ].filter(Boolean)),
    };
  }

  const priorities = qualityProfile({
    completeness: diagnosis.completeness,
    conversionReadiness: diagnosis.conversionReadiness,
    contentReadiness: diagnosis.contentReadiness,
    missingMobileCta: diagnosis.missingMobileCta,
    missingTrust: diagnosis.missingTrust,
    missingFaq: diagnosis.missingFaq,
    missingHomeHero: diagnosis.missingHomeHero,
  });

  const priorityVocabulary: Record<string, string> = {
    design: "design restyle hierarchy",
    conversion: "conversion call to action leads",
    content: "rewrite content",
    mobile: "mobile responsive",
    seo: "seo local seo",
    trust: "trust reviews",
    faq: "faq",
  };

  const repairTerms = priorities.priorities
    .map((priority) => priorityVocabulary[priority])
    .filter(Boolean);

  const enrichedInstruction = unique([
    planningInstruction,
    ...outcomes.terms,
    ...repairTerms,
    diagnosis.pages > 1 ? "on every page" : "",
  ]).filter(Boolean).join(" ");

  const plan = buildDeterministicPlan(context, enrichedInstruction, options);

  return {
    ...plan,
    trace: unique([
      ...plan.trace,
      "Autonomous Brain v3: normalised and inspected the existing workspace before planning.",
      autopilotSummary(diagnosis),
      outcomes.labels.length
        ? `Autonomous Brain v3: recognized ${outcomes.labels.join(", ")} outcome${outcomes.labels.length === 1 ? "" : "s"}.`
        : "Autonomous Brain v3: translated the request into site-level concerns.",
      `Autonomous Brain v3: prioritized ${priorities.priorities.length ? priorities.priorities.join(", ") : "no weak dimensions"}.`,
      normalized.carried
        ? `Autonomous Brain v3: carried forward the prior subject — ${normalized.carried}.`
        : "",
      "Autonomous Brain v3: compiled one bounded plan through the existing deterministic safety pipeline.",
    ].filter(Boolean)),
    notes: unique([
      ...plan.notes,
      diagnosis.missingTrust ? "Trust structure is limited; only existing real proof may be used." : "",
      diagnosis.missingFaq ? "FAQ opportunity detected; answers must remain factual." : "",
    ].filter(Boolean)),
  };
}
