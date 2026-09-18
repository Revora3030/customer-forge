/**
 * REVORA AUTONOMOUS BUILDER BRAIN v4
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
import { guardAutonomousPlan } from "./plan-quality";
import { buildExecutionBlueprint, blueprintTrace } from "./execution-blueprint";
import { scopeContextForIntent } from "./context-targeting";

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

function finalizePlan(context: AgentContext, plan: DeterministicPlan): DeterministicPlan {
  return guardAutonomousPlan(context, plan);
}

/**
 * Estimate which quality dimensions a compiled plan actually covers.
 *
 * This deterministic self-critique checks the proposed actions against the
 * diagnosed weaknesses before the plan crosses the final safety boundary.
 */
function planCoverage(actions: DeterministicPlan["actions"], priority: string): boolean {
  const serialized = actions.map((action) => JSON.stringify(action).toLowerCase()).join(" ");

  switch (priority) {
    case "design":
      return /set_theme|set_section_variant|set_section_visual|set_component_visual|set_backdrop|set_section_effect/.test(serialized);
    case "conversion":
      return /call|book|quote|cta|conversion|lead|set_component|add_component|add_section/.test(serialized);
    case "content":
      return /set_section_text|set_component|add_section/.test(serialized);
    case "mobile":
      return /mobile|responsive|set_theme|set_section_visual|set_component_visual|set_component/.test(serialized);
    case "seo":
      return /seo_|noindex|canonical|meta|set_page/.test(serialized);
    case "trust":
      return /reviews|testimonial|trust|credential|set_section_text|add_section/.test(serialized);
    case "faq":
      return /faq|question|add_section|set_section_text/.test(serialized);
    default:
      return true;
  }
}

/**
 * Return only diagnosed dimensions that the compiled action set does not
 * clearly address. The caller deliberately caps recovery work.
 */
function missingPriorities(
  actions: DeterministicPlan["actions"],
  priorities: string[],
): string[] {
  return priorities.filter((priority) => !planCoverage(actions, priority));
}

/**
 * Merge focused deterministic passes without allowing one broad request to
 * overwhelm the executor. The primary pass owns the customer-facing response;
 * focused passes contribute additional safe native actions for dimensions the
 * diagnosis says are weak.
 */
function mergeFocusedPlans(
  primary: DeterministicPlan,
  focused: DeterministicPlan[],
  cap = 56,
): DeterministicPlan {
  const actions: DeterministicPlan["actions"] = [];
  const seen = new Set<string>();

  for (const plan of [primary, ...focused]) {
    for (const action of plan.actions) {
      if (actions.length >= cap) break;
      const key = JSON.stringify(action);
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push(action);
    }
    if (actions.length >= cap) break;
  }

  return {
    ...primary,
    actions,
    tasks: [...primary.tasks, ...focused.flatMap((plan) => plan.tasks)]
      .filter((task, index, all) => all.findIndex((candidate) => candidate.title === task.title) === index),
    notes: unique([primary.notes, ...focused.map((plan) => plan.notes)].flat()),
    trace: unique([primary.trace, ...focused.map((plan) => plan.trace)].flat()),
    coverage: [primary, ...focused].some((plan) => plan.coverage === "partial")
      ? "partial"
      : primary.coverage,
    requiresExternalReasoning: [primary, ...focused].some((plan) => plan.requiresExternalReasoning),
    externalReason:
      primary.externalReason ??
      focused.find((plan) => plan.externalReason)?.externalReason ??
      null,
  };
}

/**
 * Build one coherent plan from a broad outcome request.
 *
 * v4 adds a final pure quality boundary after compilation. The compiler still
 * owns action generation; this guard only removes duplicate or unresolved work
 * before a plan can cross the autonomous boundary.
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
  const target = scopeContextForIntent(context, baseIntent);

  if (!target.matched) {
    return finalizePlan(context, {
      reply: `I can make that change, but I need to know which page you mean: ${target.requested.join(", ")}.`,
      summary: "No changes planned because the requested page could not be matched safely.",
      actions: [],
      questions: [`Which existing page should I change? I could not match: ${target.requested.join(", ")}.`],
      notes: ["No homepage fallback was used because the request named a page that could not be resolved."],
      coverage: "none",
      trace: ["Autonomous Brain v4: explicit page target could not be resolved; returned a safe no-op."],
      intent: baseIntent,
      tasks: [],
      requiresExternalReasoning: false,
      externalReason: null,
    });
  }

  const planningContext = target.context;
  const inferred = applyAutopilot(planningContext, planningInstruction, baseIntent);
  const outcomes = outcomeTerms(planningInstruction, inferred);

  if (!broadRequest(planningInstruction)) {
    const plan = buildDeterministicPlan(planningContext, planningInstruction, options);
    return finalizePlan(context, {
      ...plan,
      trace: unique([
        ...plan.trace,
        normalized.text !== normalized.original
          ? "Autonomous Brain v3: normalised conversational wording before planning."
          : "",
        target.scoped
          ? `Autonomous Brain v4: scoped planning to page ${target.pageTitle ?? target.pageId ?? "target"}.`
          : "",
        `Site readiness: ${autopilotSummary(diagnosis)}`,
      ].filter(Boolean)),
    });
  }

  const priorities = qualityProfile({
    completeness: diagnosis.completeness,
    conversionReadiness: diagnosis.conversionReadiness,
    contentReadiness: diagnosis.contentReadiness,
    missingMobileCta: diagnosis.missingMobileCta,
    missingTrust: diagnosis.missingTrust,
    missingFaq: diagnosis.missingFaq,
    missingHomeHero: diagnosis.missingHomeHero,
    emptySections: diagnosis.emptySections,
    pagesMissingSeo: diagnosis.pagesMissingSeo,
    ctaCount: diagnosis.ctaCount,
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
    diagnosis.pages > 1 && (target.scoped ? false : true) ? "on every page" : "",
  ]).filter(Boolean).join(" ");

  const primaryPlan = buildDeterministicPlan(planningContext, enrichedInstruction, options);

  // Broad requests benefit from several narrow, deterministic passes. This is
  // deliberately not a second AI provider: each pass uses the same existing
  // compiler, business facts, industry playbook and executor vocabulary. The
  // merge is bounded and the final quality guard still validates every action.
  const initialFocusedPlans =
    priorities.priorities.length > 1
      ? priorities.priorities.slice(0, 4).map((priority) =>
          buildDeterministicPlan(
            planningContext,
            `${planningInstruction} Focus this pass on ${priorityVocabulary[priority] ?? priority}. Preserve existing business facts and only make evidence-safe website changes.`,
            options,
          ),
        )
      : [];

  const initialMerged = mergeFocusedPlans(primaryPlan, initialFocusedPlans);

  // Self-critique the actual action set. If a diagnosed dimension is still
  // uncovered, run at most two targeted recovery passes. This adds a bounded
  // plan → inspect → repair loop without introducing a paid model dependency.
  const recoveryPriorities = missingPriorities(
    initialMerged.actions,
    priorities.priorities,
  ).slice(0, 2);

  const recoveryPlans = recoveryPriorities.map((priority) =>
    buildDeterministicPlan(
      planningContext,
      `${planningInstruction} Recovery pass: the existing plan did not clearly cover ${priorityVocabulary[priority] ?? priority}. Add only safe, evidence-backed changes for ${priorityVocabulary[priority] ?? priority}. Preserve existing business facts.`,
      options,
    ),
  );

  const focusedPlans = [...initialFocusedPlans, ...recoveryPlans];
  const plan = mergeFocusedPlans(primaryPlan, focusedPlans);

  const blueprint = buildExecutionBlueprint(plan.actions);

  return finalizePlan(context, {
    ...plan,
    blueprint,
    trace: unique([
      ...plan.trace,
      "Autonomous Brain v3: normalised and inspected the existing workspace before planning.",
      target.scoped
        ? `Autonomous Brain v4: scoped planning to page ${target.pageTitle ?? target.pageId ?? "target"}.`
        : "",
      autopilotSummary(diagnosis),
      outcomes.labels.length
        ? `Autonomous Brain v3: recognized ${outcomes.labels.join(", ")} outcome${outcomes.labels.length === 1 ? "" : "s"}.`
        : "Autonomous Brain v3: translated the request into site-level concerns.",
      `Autonomous Brain v3: prioritized ${priorities.priorities.length ? priorities.priorities.join(", ") : "no weak dimensions"}.`,
      normalized.carried
        ? `Autonomous Brain v3: carried forward the prior subject — ${normalized.carried}.`
        : "",
      focusedPlans.length
        ? `Autonomous Brain v6: ran ${focusedPlans.length} focused quality passes and merged them into one bounded plan.`
        : "Autonomous Brain v6: one focused planning pass was sufficient for the diagnosed request.",
      recoveryPlans.length
        ? `Autonomous Brain v7: self-critique found ${recoveryPlans.length} uncovered quality dimension${recoveryPlans.length === 1 ? "" : "s"} and ran targeted recovery passes.`
        : "Autonomous Brain v7: self-critique found no uncovered diagnosed quality dimensions.",
      blueprintTrace(blueprint),
      "Autonomous Brain v3: compiled one bounded plan through the existing deterministic safety pipeline.",
    ].filter(Boolean)),
    notes: unique([
      ...plan.notes,
      diagnosis.missingTrust ? "Trust structure is limited; only existing real proof may be used." : "",
      diagnosis.missingFaq ? "FAQ opportunity detected; answers must remain factual." : "",
    ].filter(Boolean)),
  });
}
