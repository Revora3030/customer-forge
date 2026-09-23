/**
 * STAGE: DESIGN.
 *
 * Between understanding a request and planning the edits, the agent decides how
 * the finished thing should LOOK and how it should sell — the way a senior
 * designer writes a direction before touching a layout.
 *
 * The output is a short, opinionated direction: the one conversion goal, a
 * layout archetype, a typographic and colour temperament, the section order
 * that tells the story, and a list of things this particular site must not look
 * like. It is injected into the planning brief, so the planner is never left to
 * fall back on a generic template arrangement.
 *
 * A model writes the direction. When the gateway is unusable, an industry-aware
 * deterministic direction is used instead, so the design stage never disappears
 * — it only gets less bespoke.
 */

import { callJson } from "@/lib/site-agent.server";
import type { ModelRole } from "@/lib/ai/config";

export type DesignDirection = {
  /** The single action the site is built to produce. */
  goal: string;
  /** Layout archetype, e.g. "editorial split with a full-bleed proof band". */
  layout: string;
  /** Typographic temperament in words the planner can act on. */
  typography: string;
  /** Colour temperament, plus a concrete palette intent. */
  palette: string;
  /** Ordered section story for the main page. */
  story: string[];
  /** Motion intent — always restrained, always purposeful. */
  motion: string;
  /** What this site must NOT become. Anti-generic guardrails. */
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
  "layout": "one distinctive layout archetype in a sentence — editorial, asymmetric, bento, full-bleed, split, dense command-centre — chosen for THIS industry and audience",
  "typography": "the typographic temperament and how headings differ from body",
  "palette": "the colour temperament and the role each colour plays (surface, ink, accent, proof)",
  "story": ["4-8 sections in order, each named by its job, e.g. 'hero: the outcome, not the trade'"],
  "motion": "restrained motion intent that survives reduced-motion",
  "avoid": ["3-6 specific things this site must not look like"]
}

Rules:
- Commit to one direction. Never offer options, never hedge.
- Fit the industry, the audience, the offer and the price point. A roofer, a dentist and a
  wedding photographer must not receive the same direction.
- Never propose purple-on-white SaaS gradients, stacked identical cards, glassmorphism
  everywhere, hero-features-testimonials-footer boilerplate, or motion with no meaning.
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
 * The industry-aware direction used when the gateway cannot be reached. It is
 * deliberately opinionated rather than neutral: a plain fallback is exactly the
 * generic result this stage exists to prevent.
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
  return [
    "THE DESIGN DIRECTION FOR THIS SITE — follow it, do not re-decide it:",
    `- One conversion goal: ${direction.goal}`,
    `- Layout: ${direction.layout}`,
    `- Typography: ${direction.typography}`,
    `- Colour: ${direction.palette}`,
    `- Motion: ${direction.motion}`,
    "- Section story, in this order:",
    ...direction.story.map((step, index) => `  ${index + 1}. ${step}`),
    "- This site must NOT look like:",
    ...direction.avoid.map((item) => `  - ${item}`),
    "Write real copy for every section you add — never a placeholder, never a label.",
    "Mobile is a designed layout: keep the conversion action reachable with a thumb and never rely on hover alone.",
  ].join("\n");
}
