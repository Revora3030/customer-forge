/**
 * THE REVORA AGENT ORCHESTRATOR.
 *
 * UNDERSTAND → INSPECT → DESIGN → PLAN → REFLECT → OBJECTIVE REVIEW → AUTO-FIX →
 * VERIFY → REPORT. Execution itself happens after the owner approves, in
 * `applyWebsiteChanges`.
 *
 * This module owns the pipeline itself and nothing else: understanding comes
 * from `understanding.server`, the workspace picture (INSPECT) from
 * `workspace-context.server`, the design direction from `design-brief.server`,
 * the plan from the site planner, the objective review from `critique.server`, and the
 * writes from `applyWebsiteChanges` after the owner approves. Keeping the
 * stages apart is what lets the agent grow without rewriting the builder.
 *
 * Three honesty rules are enforced here, not just prompted:
 * - a requirement is only reported as covered when the review pass says so,
 * - reflection and objective review are skipped for simple requests, so a small ask
 *   stays cheap, and
 * - a readiness score is only shown when a review pass actually ran.
 */

import type { AgentContext } from "@/lib/site-agent.server";
import type { AgentAttachment, AgentTurn } from "@/lib/site-agent";
import { capabilityBrief } from "@/lib/agent/capabilities";
import { understandRequest, type Understanding } from "@/lib/agent/understanding.server";
import {
  designBrief,
  designDirection,
  designWithoutModel,
  type DesignDirection,
} from "@/lib/agent/design-brief.server";
import { critiquePlan, improvementBrief, type Critique } from "@/lib/agent/critique.server";

export type RequirementCheck = { label: string; covered: boolean };

export type OrchestratedPlan = {
  /** Raw model plan in the shape the existing validator already accepts. */
  raw: Record<string, unknown>;
  understanding: Understanding;
  design: DesignDirection;
  /** Present only when a grading pass actually ran. */
  critique: Critique | null;
  requirements: RequirementCheck[];
  /** One line per pipeline stage that actually ran, for the report. */
  trace: string[];
};

export type PlanFn = (
  context: AgentContext,
  instruction: string,
  history: AgentTurn[],
  attachments: AgentAttachment[],
  /** Who the run belongs to, for AI usage limits and telemetry. */
  caller?: { organizationId?: string | null; userId?: string | null; task?: string },
) => Promise<Record<string, unknown>>;

const str = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const actionList = (value: unknown) =>
  Array.isArray(value)
    ? (value.filter((item) => item && typeof item === "object") as object[])
    : [];

const strings = (value: unknown, limit: number) =>
  Array.isArray(value)
    ? value
        .map((item) => str(item, 300))
        .filter(Boolean)
        .slice(0, limit)
    : [];

/** Merges two action lists without repeating an identical action. */
function mergeActions(first: object[], second: object[]) {
  const seen = new Set(first.map((action) => JSON.stringify(action)));
  const out = [...first];
  for (const action of second) {
    const key = JSON.stringify(action);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

/**
 * The brief the planner receives: the owner's words, the agent's reading of
 * them, and the design direction it committed to.
 */
export function planningBrief(
  instruction: string,
  understanding: Understanding,
  design?: DesignDirection,
) {
  const { guidance, handoffs } = capabilityBrief(understanding.capabilities);
  const lines = [
    `THE OWNER ASKED, IN THEIR OWN WORDS:\n${instruction}`,
    "",
    `WHAT THE AGENT WORKED OUT THEY WANT: ${understanding.goal}`,
    "",
    "REQUIREMENTS THIS PLAN WILL BE CHECKED AGAINST:",
    ...understanding.requirements.map((requirement, index) => `${index + 1}. ${requirement}`),
  ];
  if (design) lines.push("", designBrief(design));
  lines.push(
    "",
    "AREAS THIS TOUCHES, AND WHAT YOU MAY DO IN EACH:",
    ...guidance.map((line) => `- ${line}`),
  );

  if (understanding.tasks.length > 1) {
    lines.push(
      "",
      "DO ALL OF THESE IN THIS ONE PLAN, IN ORDER:",
      ...understanding.tasks.map((task, index) => `${index + 1}. ${task.title} — ${task.brief}`),
    );
  }
  if (handoffs.length) {
    lines.push(
      "",
      "PARTS THAT FINISH OUTSIDE THE WEBSITE CONTENT — plan the website side and put the rest in notes:",
      ...handoffs.map((line) => `- ${line}`),
    );
  }
  lines.push(
    "",
    "Decide for yourself which pages, sections, copy, colours, search text, photos and buttons this needs.",
    "Never reply that the request is unclear or unsupported, and never ask the owner to name a section, colour, font or effect.",
    understanding.question
      ? `Only if it is genuinely the single blocker, ask exactly this one question: ${understanding.question}`
      : "Do not ask any questions — decide with sensible defaults and record assumptions in notes.",
  );
  return lines.join("\n");
}

/** The review pass: the agent grades its own plan against the requirements. */
function reviewBrief(understanding: Understanding, actions: object[]) {
  return [
    "REVIEW YOUR OWN PLAN BEFORE THE OWNER SEES IT.",
    "",
    `THE OUTCOME THEY WANTED: ${understanding.goal}`,
    "",
    "REQUIREMENTS:",
    ...understanding.requirements.map((requirement, index) => `${index + 1}. ${requirement}`),
    "",
    "ACTIONS YOU HAVE PLANNED SO FAR:",
    JSON.stringify(actions).slice(0, 12_000),
    "",
    "Return the same JSON object shape, where:",
    '- "actions" contains ONLY the additional actions still needed to satisfy the requirements above (an empty array if the plan is already complete),',
    '- "missing" lists, word for word, any requirement above that still is not satisfied and that you cannot satisfy with the actions available,',
    '- "reply" is one sentence to the owner about the finished plan,',
    '- "notes" records anything you deliberately left alone.',
    'Do not repeat an action that is already listed above. Do not invent facts to close a gap — list it in "missing" instead.',
  ].join("\n");
}

/**
 * Runs one full agent turn. `plan` is the existing site planner, injected so
 * this pipeline stays testable and the model wiring lives in one place.
 */
export async function orchestrate(options: {
  context: AgentContext;
  workspaceSummary: string;
  instruction: string;
  history: AgentTurn[];
  attachments: AgentAttachment[];
  plan: PlanFn;
  /** Who the run belongs to, for AI usage limits and telemetry. */
  caller?: { organizationId?: string | null; userId?: string | null };
  /** Injectable understanding stage, so the pipeline stays testable. */
  understand?: (
    instruction: string,
    workspaceSummary: string,
    history: AgentTurn[],
  ) => Promise<Understanding>;
  /** Injectable design stage. */
  design?: (
    instruction: string,
    goal: string,
    workspaceSummary: string,
    industry?: string | null,
  ) => Promise<DesignDirection>;
  /** Injectable grading stage. */
  critique?: typeof critiquePlan;
}): Promise<OrchestratedPlan> {
  const { context, instruction, history, attachments, plan } = options;
  const trace: string[] = [];

  const understanding = await (options.understand ?? understandRequest)(
    instruction,
    options.workspaceSummary,
    history,
  );
  trace.push(
    understanding.source === "model"
      ? `Read the request as: ${understanding.goal}`
      : `Read the request with Revora's built-in reader: ${understanding.goal}`,
  );
  if (understanding.tasks.length > 1)
    trace.push(`Broke it into ${understanding.tasks.length} coordinated tasks`);

  // DESIGN. Visual and conversion decisions are made by the model team, not by
  // a fixed template or deterministic layout chooser.
  const industry = context.business.industry;
  let design: DesignDirection;
  let designRetried = false;
  try {
    design = await (options.design ?? designDirection)(
      instruction,
      understanding.goal,
      options.workspaceSummary,
      industry,
    );
  } catch {
    // Retry once with the primary model class instead of falling back to
    // the empty no-model direction — the AI team keeps creative authority.
    try {
      design = await designDirection(
        instruction,
        understanding.goal,
        options.workspaceSummary,
        industry,
      );
      designRetried = true;
    } catch {
      design = designWithoutModel(industry);
    }
  }
  trace.push(
    design.source === "model"
      ? `Set the AI-authored design direction${design.layout ? `: ${design.layout}` : ""}${designRetried ? " (after retry)" : ""}`
      : "No design direction was available; the planning AI decides the design itself",
  );

  const brief = designBrief(design);

  const first = await plan(
    context,
    planningBrief(instruction, understanding, design),
    history,
    attachments,
    options.caller,
  );
  let actions = actionList(first["actions"]);
  trace.push(`Planned ${actions.length} change${actions.length === 1 ? "" : "s"} across the site`);

  let missing = strings(first["missing"], 8);
  let reply = str(first["reply"], 1500);
  let summary = str(first["summary"], 300);
  let notes = strings(first["notes"], 6);
  const questions = strings(first["questions"], 3);

  // Reflection is where a plan earns the right to be called finished. It costs a
  // second call, so only complex work gets it — and only when there is a plan to
  // review and no blocking question outstanding.
  const reviewable = actions.length > 0 && questions.length === 0;
  if (understanding.complexity === "complex" && reviewable) {
    try {
      const second = await plan(
        context,
        reviewBrief(understanding, actions),
        [
          ...history,
          { role: "assistant", content: JSON.stringify({ actions }).slice(0, 8000) } as AgentTurn,
        ],
        [],
        options.caller,
      );
      const extra = actionList(second["actions"]);
      actions = mergeActions(actions, extra);
      missing = strings(second["missing"], 8);
      notes = [...new Set([...notes, ...strings(second["notes"], 6)])].slice(0, 6);
      reply = str(second["reply"], 1500) || reply;
      summary = str(second["summary"], 300) || summary;
      trace.push(
        extra.length
          ? `Reviewed the plan and added ${extra.length} change${extra.length === 1 ? "" : "s"} it was missing`
          : "Reviewed the plan against the request and found nothing missing",
      );
    } catch {
      // A failed review never loses the plan the owner is waiting for.
      trace.push("Could not run the review pass — showing the plan as first drafted");
    }
  }

  // OBJECTIVE REVIEW, then AUTO-FIX. The agent checks its own plan for concrete
  // launch issues. It never blocks or alters a plan because of aesthetic taste.
  let critique: Critique | null = null;
  if (understanding.complexity === "complex" && reviewable) {
    const graded = await (options.critique ?? critiquePlan)({
      goal: understanding.goal,
      designBrief: brief,
      actions,
      requirements: understanding.requirements,
    });
    if (graded.source === "model") {
      critique = graded;
      trace.push(
        `Reviewed its own work for launch issues${graded.verdict ? ` — ${graded.verdict}` : ""}`,
      );
      if (graded.fixes.length) {
        try {
          const improved = await plan(
            context,
            improvementBrief(graded, understanding.goal, actions),
            [],
            [],
            options.caller,
          );
          const extra = actionList(improved["actions"]);
          if (extra.length) {
            actions = mergeActions(actions, extra);
            notes = [...new Set([...notes, ...strings(improved["notes"], 6)])].slice(0, 6);
            reply = str(improved["reply"], 1500) || reply;
            summary = str(improved["summary"], 300) || summary;
            trace.push(
              `Fixed ${extra.length} objective issue${extra.length === 1 ? "" : "s"} before showing you`,
            );
          } else {
            trace.push("Tried to fix the objective issues but found nothing more it could change");
          }
        } catch {
          trace.push("Could not run the improvement pass — showing the reviewed plan");
        }
      }
    }
  }

  const unmet = new Set(missing.map((entry) => entry.toLowerCase()));
  const requirements: RequirementCheck[] = understanding.requirements.map((label) => ({
    label,
    covered: actions.length > 0 && !unmet.has(label.toLowerCase()),
  }));
  if (requirements.length)
    trace.push(
      `Checked ${requirements.filter((requirement) => requirement.covered).length}/${requirements.length} requirements as covered`,
    );

  return {
    raw: {
      ...first,
      actions,
      reply,
      summary,
      notes: missing.length
        ? [...notes, ...missing.map((entry) => `Still open: ${entry}`)].slice(0, 8)
        : notes,
      questions,
    },
    understanding,
    design,
    critique,
    requirements,
    trace,
  };
}
