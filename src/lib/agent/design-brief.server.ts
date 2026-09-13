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

const DESIGN_ROLE: ModelRole = "fast";

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
export function designWithoutModel(industry: string | null | undefined): DesignDirection {
  const trade = (industry ?? "").toLowerCase();
  const urgent = /roof|plumb|electric|hvac|restoration|locksmith|tow|pest/.test(trade);
  const considered = /dental|dentist|law|legal|account|financ|clinic|medical|therap|consult/.test(
    trade,
  );
  const visual = /photo|design|interior|landscap|remodel|renovat|salon|event|wedding/.test(trade);

  if (urgent)
    return {
      goal: "One phone call. Everything above the fold answers 'can you come out today?'",
      layout:
        "Split hero: the promise and the phone number on the left, a single real job photo bleeding off the right edge. Proof runs as one horizontal band, not a card grid.",
      typography:
        "Heavy condensed headings, generous plain body text, numbers set large so the phone number reads as a button even before it is one.",
      palette:
        "Dark work-worn surface, one high-visibility accent reserved only for the call action, ink kept near-black for legibility in daylight on a phone.",
      story: [
        "hero: the outcome and the phone number, reachable with a thumb",
        "response: how fast someone actually arrives",
        "services: the specific jobs, in plain words",
        "proof: real work, before and after",
        "area: the towns actually covered",
        "cta: call now, with the alternative for people who would rather write",
      ],
      motion: "Nothing that delays the phone number. Content settles in once and stops.",
      avoid: [
        "a grid of identical service cards",
        "stock photos of unrelated smiling office workers",
        "a hidden phone number below the fold",
        "gradient-heavy SaaS hero",
      ],
      source: "fallback",
    };

  if (considered)
    return {
      goal: "A booked consultation. The site earns trust before it asks for anything.",
      layout:
        "Editorial: a wide calm hero with one line of promise, then asymmetric text-and-portrait rows that read like a considered brochure rather than a landing page.",
      typography:
        "A serif or high-contrast display for headings against a quiet humanist body face; long line lengths kept short enough to read comfortably.",
      palette:
        "Light, low-saturation surface, deep ink, one restrained accent used for the booking action and nothing else.",
      story: [
        "hero: the problem solved, in the client's words",
        "credibility: who they are dealing with",
        "approach: what actually happens, step by step",
        "objections: cost, time and what is included",
        "questions: the things people ask before booking",
        "cta: book a consultation, with a lower-commitment second option",
      ],
      motion: "Slow reveal on scroll for text blocks only. No parallax, no bounce.",
      avoid: [
        "urgency banners and countdowns",
        "identical testimonial cards in a row",
        "clip-art icons standing in for expertise",
        "walls of undifferentiated paragraph text",
      ],
      source: "fallback",
    };

  if (visual)
    return {
      goal: "An enquiry with a project in mind. The work does the selling.",
      layout:
        "Full-bleed and bento: large imagery running edge to edge, broken by an off-centre bento grid of project moments at different sizes.",
      typography:
        "Quiet, wide-tracked headings that stay out of the way of the imagery; captions carry the detail.",
      palette:
        "Near-neutral surface so photography holds all the colour, with a single ink accent for actions.",
      story: [
        "hero: one hero image and one sentence of positioning",
        "work: an intentionally uneven grid, not a carousel of equals",
        "process: what working together looks like",
        "detail: materials, timelines, what is included",
        "cta: start a project, with the practical next step",
      ],
      motion: "Images scale gently on hover; nothing moves on its own.",
      avoid: [
        "a uniform square gallery grid",
        "text laid over busy photos",
        "carousels that hide the best work",
        "heavy overlays that dull the imagery",
      ],
      source: "fallback",
    };

  return {
    goal: "A qualified enquiry through the shortest honest path on the page.",
    layout:
      "Asymmetric hero with the offer weighted left and one supporting visual anchored right, followed by alternating full-width bands so no two sections share a rhythm.",
    typography:
      "Confident display headings with a clearly subordinate body face; one size step between levels so hierarchy is obvious at a glance.",
    palette:
      "One dominant surface, near-black ink, and a single accent that only ever means 'act here'.",
    story: [
      "hero: the outcome and the next step",
      "offer: exactly what is included",
      "proof: real evidence, in whatever form the business actually has",
      "objections: the reasons people hesitate, answered",
      "cta: one clear action, repeated where the decision is made",
    ],
    motion: "One settle-in on load, subtle hover feedback on anything clickable.",
    avoid: [
      "three identical feature cards",
      "purple-to-blue gradients on white",
      "generic SaaS hero with a fake dashboard",
      "large empty sections with one centred sentence",
    ],
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
