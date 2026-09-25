/**
 * STAGE: DESIGN.
 *
 * Between understanding a request and planning the edits, the agent decides how
 * the finished thing should LOOK and how it should sell — the way a senior
 * designer writes a direction before touching a layout.
 *
 * The output is a short, opinionated direction: the conversion intent, the
 * AI's own layout intent, type and colour intent, story flow, motion intent and
 * any fact/safety constraints. It is injected into the planning brief so the
 * planner follows the AI's own creative decision instead of a stock recipe.
 *
 * A model writes the direction. When no model is usable, this stage returns no
 * creative direction; callers may stop or continue only with owner-supplied intent.
 */

import { callJson } from "@/lib/site-agent.server";
import type { ModelRole } from "@/lib/ai/config";

export type DesignDirection = {
  /** The single action the site is built to produce. */
  goal: string;
  /** Layout intent in the model's own words. */
  layout: string;
  /** Typographic temperament in words the planner can act on. */
  typography: string;
  /** Colour temperament, plus a concrete palette intent. */
  palette: string;
  /** Ordered section story for the main page. */
  story: string[];
  /** Motion intent — always restrained, always purposeful. */
  motion: string;
  /** Fact, safety or owner-specific constraints. Not style preferences. */
  avoid: string[];
  source: "model" | "fallback";
};

const DESIGN_ROLE: ModelRole = "design";

const SYSTEM = `You are a senior brand designer, UX designer and conversion strategist working on a
real local business website. You write the DESIGN DIRECTION before anyone edits the site.

You are deciding taste, not asking for it. The owner will never name a layout, font, colour or
effect, and you never ask them to.

Return JSON only:
{
  "goal": "the ONE action this site exists to produce (a call, a booking, a quote request, a purchase, a signup) and why that is the right one for this business",
  "layout": "the layout intent in your own words, specific to this business and audience",
  "typography": "the typographic temperament and how headings differ from body",
  "palette": "the colour temperament and the role each colour plays (surface, ink, accent, proof)",
  "story": ["4-8 sections in order, each named by its job, e.g. 'hero: the outcome, not the trade'"],
  "motion": "restrained motion intent that survives reduced-motion",
  "avoid": ["fact, safety or owner-specific constraints only; do not list aesthetic dislikes unless the owner supplied them"]
}

Rules:
- Commit to one direction. Never offer options, never hedge.
- Fit the industry, the audience, the offer and the price point. A roofer, a dentist and a
  wedding photographer must not receive the same direction.
- Never rely on facts nobody gave you: no awards, ratings, review counts or guarantees.
- Mobile is a designed layout of its own, not a squeezed desktop one. Say what changes.`;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const list = (value: unknown, max: number, limit: number) =>
  Array.isArray(value)
    ? value
        .map((item) => text(item, max))
        .filter(Boolean)
        .slice(0, limit)
    : [];

/**
 * Empty no-model result. It carries no layout, palette, type or story opinion.
 */
export function designWithoutModel(_industry?: string | null): DesignDirection {
  // Decommissioned industry design recipes. With no model answer there is no
  // direction at all — the planning AI decides layout, type, palette, story
  // and motion itself. Only the anti-fabrication guardrail remains.
  return {
    goal: "",
    layout: "",
    typography: "",
    palette: "",
    story: [],
    motion: "",
    avoid: ["any claim the business has not supplied"],
    source: "fallback",
  };
}

/** Writes the design direction for one request. Never throws. */
export async function designDirection(
  instruction: string,
  goal: string,
  workspaceSummary: string,
  industry?: string | null,
): Promise<DesignDirection> {
  try {
    const raw = await callJson(
      DESIGN_ROLE,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `THE BUSINESS AND ITS CURRENT SITE:\n${workspaceSummary}` },
        {
          role: "user",
          content: `THE OWNER ASKED:\n${instruction}\n\nWHAT THEY WANT, IN ONE LINE:\n${goal}`,
        },
      ],
      { task: "agent.design" },
    );
    const story = list(raw["story"], 160, 8);
    const avoid = list(raw["avoid"], 120, 6);
    const goalText = text(raw["goal"], 300);
    const layout = text(raw["layout"], 400);
    const typography = text(raw["typography"], 300);
    const palette = text(raw["palette"], 300);
    const motion = text(raw["motion"], 240);
    const fallback = designWithoutModel(industry);

    // If the model returned nothing usable in any field, this is the fallback
    // direction wearing a "model" label — say so honestly instead of reporting
    // a bespoke design pass that never actually happened.
    const usedModel = Boolean(
      goalText || layout || typography || palette || motion || story.length || avoid.length,
    );
    if (!usedModel) return fallback;

    return {
      goal: goalText || fallback.goal,
      layout: layout || fallback.layout,
      typography: typography || fallback.typography,
      palette: palette || fallback.palette,
      story: story.length ? story : fallback.story,
      motion: motion || fallback.motion,
      avoid: avoid.length ? avoid : fallback.avoid,
      source: "model",
    };
  } catch {
    return designWithoutModel(industry);
  }
}

/** The design direction as planner-facing instructions. */
export function designBrief(direction: DesignDirection) {
  const lines = [
    "THE AI-AUTHORED DESIGN DIRECTION FOR THIS SITE — follow it, do not replace it with a template:",
    direction.goal ? `- Conversion intent: ${direction.goal}` : null,
    direction.layout ? `- Layout intent: ${direction.layout}` : null,
    direction.typography ? `- Typography intent: ${direction.typography}` : null,
    direction.palette ? `- Colour intent: ${direction.palette}` : null,
    direction.motion ? `- Motion intent: ${direction.motion}` : null,
    direction.story.length ? "- Section story, in this order:" : null,
    ...direction.story.map((step, index) => `  ${index + 1}. ${step}`),
    direction.avoid.length ? "- Fact, safety or owner-specific constraints:" : null,
    ...direction.avoid.map((item) => `  - ${item}`),
    "Write real copy for every section you add — never a placeholder, never a label.",
    "Mobile is a designed layout: keep the conversion action reachable with a thumb and never rely on hover alone.",
  ];
  return lines.filter(Boolean).join("\n");
}
