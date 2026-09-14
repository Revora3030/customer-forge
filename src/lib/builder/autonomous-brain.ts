/**
 * REVORA AUTONOMOUS BUILDER BRAIN
 *
 * A free-first decision layer between the user's plain-English request and
 * the existing deterministic compiler. It performs:
 *   diagnose -> prioritize -> enrich -> compile -> quality snapshot
 *
 * It does not execute mutations, call a model, access the network, invent
 * business facts, or bypass the existing site-agent safety boundaries.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import { buildDeterministicPlan, type BuilderOptions, type DeterministicPlan } from "./deterministic";
import { diagnoseSite, applyAutopilot, autopilotSummary } from "./autopilot";
import { interpret } from "./interpreter";
import { qualityProfile } from "./quality-profile";

const unique = <T>(items: T[]): T[] => [...new Set(items)];

const broadRequest = (text: string): boolean => {
  const value = text.toLowerCase();
  return [
    "make my website better", "make my site better", "improve my website",
    "improve the site", "fix everything", "fix whatever is wrong",
    "upgrade my website", "make it great", "make this great", "grow my business",
    "get more customers", "get more leads", "get more calls", "get more bookings",
    "whole site", "entire site", "every page", "all pages",
  ].some((phrase) => value.includes(phrase));
};

/**
 * Build one coherent plan from a broad outcome request.
 * Explicit requests still flow through the normal compiler unchanged.
 */
export function buildAutonomousPlan(
  context: AgentContext,
  instruction: string,
  options: BuilderOptions = {},
): DeterministicPlan {
  const diagnosis = diagnoseSite(context);
  const baseIntent = interpret(instruction, options.history ?? []);
  const inferred = applyAutopilot(context, instruction, baseIntent);

  if (!broadRequest(instruction)) {
    const plan = buildDeterministicPlan(context, instruction, options);
    return {
      ...plan,
      trace: unique([
        ...plan.trace,
        autopilotSummary(diagnosis),
      ]),
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
    mobile: "mobile",
    seo: "seo",
    trust: "trust reviews",
    faq: "faq",
  };

  // Only append deterministic concepts that the site diagnosis says are weak.
  // This lets a vague request trigger a coordinated multi-area improvement
  // without inventing any business-specific copy or facts.
  const repairTerms = priorities.priorities
    .map((priority) => priorityVocabulary[priority])
    .filter(Boolean)
    .join(" ");

  const inferredTerms = unique([
    ...inferred.goals,
    ...inferred.verbs,
    ...inferred.moods,
  ]).join(" ");

  const enrichedInstruction = [
    instruction,
    inferredTerms,
    repairTerms,
    diagnosis.pages > 1 ? "on every page" : "",
  ].filter(Boolean).join(" ");

  const plan = buildDeterministicPlan(context, enrichedInstruction, options);

  return {
    ...plan,
    trace: unique([
      ...plan.trace,
      "Autonomous Brain: inspected the existing workspace before planning.",
      autopilotSummary(diagnosis),
      `Autonomous Brain: prioritized ${priorities.priorities.length ? priorities.priorities.join(", ") : "no weak dimensions"}.`,
      "Autonomous Brain: compiled one bounded plan through the existing deterministic safety pipeline.",
    ]),
    notes: unique([
      ...plan.notes,
      diagnosis.missingTrust ? "Trust structure is limited; only existing real proof may be used." : "",
      diagnosis.missingFaq ? "FAQ opportunity detected; answers must remain factual." : "",
    ].filter(Boolean)),
  };
}
