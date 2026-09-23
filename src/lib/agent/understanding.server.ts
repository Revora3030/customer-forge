/**
 * STAGE 1 OF THE REVORA AGENT — UNDERSTAND.
 *
 * A model reads the owner's words semantically and returns what the request
 * actually means: the outcome, the checkable requirements inside it, the areas
 * of the workspace it touches, and a task breakdown for anything that needs
 * more than one coordinated move.
 *
 * This is deliberately NOT keyword matching. Keyword matching only survives as
 * the offline fallback, so that a gateway outage degrades the agent instead of
 * stopping it — and the fallback says so in the returned `source`.
 */

import { callJson } from "@/lib/site-agent.server";
import type { ModelRole } from "@/lib/ai/config";
import { translateIntent, type IntentArea } from "@/lib/intent-translator";
import { BASELINE_CAPABILITIES, isCapabilityId, type CapabilityId } from "@/lib/agent/capabilities";

/** How complex the work is — drives how much reasoning the agent spends. */
export type AgentComplexity = "simple" | "complex";

export type AgentTask = {
  title: string;
  brief: string;
  capabilities: CapabilityId[];
};

export type Understanding = {
  /** The outcome in one line, in the owner's language. */
  goal: string;
  /** Checkable requirements the finished work is verified against. */
  requirements: string[];
  capabilities: CapabilityId[];
  tasks: AgentTask[];
  complexity: AgentComplexity;
  /** The single question, only when work genuinely cannot start without it. */
  question: string | null;
  /** "model" when read semantically, "fallback" when the gateway was unusable. */
  source: "model" | "fallback";
};

/**
 * Astra's role. Reading what the owner asked for is client-facing conversation
 * work, not creative authority: Astra interprets, Sol still designs and writes.
 */
const UNDERSTAND_ROLE: ModelRole = "conversation";


const SYSTEM = `You read a small business owner's request about their website or business
software and work out what it MEANS. You never ask them to use special vocabulary and you
never reject a request for being vague — "make this look expensive", "make it feel like
Apple", "build me a booking system", "fix whatever is broken" and "make the mobile version
actually good" are all perfectly clear requests that you interpret and act on.

Return JSON only:
{
  "goal": "one line: the outcome the owner wants, in their own language",
  "requirements": ["3-8 short checkable requirements implied by the request, including ones they did not spell out"],
  "capabilities": ["pages","sections","copy","design","motion","seo","images","cta","capture","commerce","portal","analytics"],
  "tasks": [{"title":"short","brief":"what to change and why","capabilities":["copy"]}],
  "complexity": "simple" | "complex",
  "question": null
}

Rules:
- Infer the areas yourself. The owner will not name pages, sections, files, effects or fields.
- "simple" means one focused change. "complex" means it needs several coordinated moves
  (a new capability, a redesign, several pages, or a system such as booking or a portal).
- 1 task for simple requests, 2-5 tasks for complex ones. Tasks must be distinct and ordered.
- "question" is almost always null. Set it ONLY when a fact nobody but the owner can know is
  the single thing blocking all work (their real prices, their real reviews, the exact wording
  of a licence or guarantee). Never ask which section, colour, font, effect or file to use.
- Requirements are what you will be graded against later, so make them concrete and verifiable.`;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const list = (value: unknown, max: number, limit: number) =>
  Array.isArray(value)
    ? value
        .map((item) => text(item, max))
        .filter(Boolean)
        .slice(0, limit)
    : [];

const AREA_TO_CAPABILITY: Record<IntentArea, CapabilityId> = {
  pages: "pages",
  sections: "sections",
  copy: "copy",
  design: "design",
  seo: "seo",
  images: "images",
  cta: "cta",
  functionality: "capture",
};

/**
 * Deterministic understanding, used only when the model cannot be reached. It
 * reuses the intent translator so the agent still produces a full brief rather
 * than telling the owner to reword anything.
 */
export function understandWithoutModel(instruction: string): Understanding {
  const intent = translateIntent(instruction);
  const capabilities = intent.areas.length
    ? intent.areas.map((area) => AREA_TO_CAPABILITY[area])
    : BASELINE_CAPABILITIES;
  const unique = [...new Set(capabilities)];
  return {
    goal: intent.restated,
    requirements: unique.map((capability) => `Improve ${capability} for this request`),
    capabilities: unique,
    tasks: [{ title: "Carry out the request", brief: intent.brief, capabilities: unique }],
    complexity: unique.length > 2 ? "complex" : "simple",
    question: intent.question,
    source: "fallback",
  };
}

/** Reads one request semantically. Never throws: it falls back instead. */
export async function understandRequest(
  instruction: string,
  workspaceSummary: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<Understanding> {
  const trimmed = instruction.trim();
  if (!trimmed) return understandWithoutModel(trimmed);

  try {
    const raw = await callJson(
      UNDERSTAND_ROLE,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `THE WORKSPACE, IN BRIEF:\n${workspaceSummary}` },
        ...history.slice(-4).map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: `THE OWNER'S REQUEST:\n${trimmed}` },
      ],
      { task: "agent.understand" },
    );

    const capabilities = [
      ...new Set(
        (Array.isArray(raw["capabilities"]) ? raw["capabilities"] : []).filter(isCapabilityId),
      ),
    ];
    const tasks: AgentTask[] = (Array.isArray(raw["tasks"]) ? raw["tasks"] : [])
      .slice(0, 5)
      .map((entry) => {
        const task = (entry ?? {}) as Record<string, unknown>;
        const own = [
          ...new Set(
            (Array.isArray(task["capabilities"]) ? task["capabilities"] : []).filter(
              isCapabilityId,
            ),
          ),
        ];
        return {
          title: text(task["title"], 90),
          brief: text(task["brief"], 900),
          capabilities: own.length ? own : capabilities,
        };
      })
      .filter((task) => task.title || task.brief);

    const effective = capabilities.length ? capabilities : BASELINE_CAPABILITIES;
    const declared = raw["complexity"] === "complex" ? "complex" : "simple";
    return {
      goal: text(raw["goal"], 300) || trimmed.slice(0, 300),
      requirements: list(raw["requirements"], 200, 8),
      capabilities: effective,
      tasks: tasks.length
        ? tasks
        : [
            {
              title: "Carry out the request",
              brief: trimmed.slice(0, 900),
              capabilities: effective,
            },
          ],
      // A single-task read of a many-area request is still complex work.
      complexity: declared === "complex" || tasks.length > 1 ? "complex" : "simple",
      question: text(raw["question"], 300) || null,
      source: "model",
    };
  } catch {
    return understandWithoutModel(trimmed);
  }
}
