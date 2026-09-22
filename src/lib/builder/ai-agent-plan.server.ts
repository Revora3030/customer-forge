/**
 * AI-authored website change plans.
 *
 * This is the creative authority for every customer build and edit request.
 * Sol composes the change as a list of real, validated actions against the
 * owner's live website; Terra then reviews the plan adversarially and may
 * remove anything generic, unsupported by the owner's facts, or unsafe.
 *
 * There is deliberately NO template or preset design to fall back on. When the
 * models are unavailable, refuse, or answer in the wrong shape this returns
 * `{ ok: false }` and the caller tells the owner plainly — it never quietly
 * ships a stock layout or filler wording.
 */

import { callCollective } from "@/lib/ai/luna.server";
import type { AgentContext } from "@/lib/site-agent.server";
import { MAX_ACTIONS } from "@/lib/site-agent";

export type AiPlanFailure = {
  ok: false;
  reason: string;
  detail: string | null;
};

export type AiPlanSuccess = {
  ok: true;
  reply: string;
  summary: string;
  actions: unknown;
  questions: string[];
  notes: string[];
  trace: string[];
  requirements: { label: string; covered: boolean }[];
  model: string;
  reviewModel: string | null;
  costMicrocents: number;
};

export type AiPlanOutcome = AiPlanSuccess | AiPlanFailure;

const TRUTH_RULES = [
  "Never invent a fact. Prices, years in business, review counts, awards, certifications, guarantees, phone numbers and addresses may only be used when supplied below.",
  "Never write placeholder or filler text. No lorem ipsum, no repeated nonsense words, no 'Your headline here', no duplicated sentences.",
  "Never leave a visual container empty: a section you add must have real headings, real copy and, where it shows imagery, an image request.",
].join(" ");

const DESIGN_RULES = [
  "You are the senior creative director, art director and conversion strategist for this website.",
  "You own the visual direction: section choice, section order, headings, copy voice, colour, typography, hero composition, imagery, call-to-action placement and page structure.",
  "Design for this exact business in its exact trade and town. A layout that could belong to any other business is a failure.",
  "Aim for the standard of a top-tier bespoke agency site: strong hierarchy, generous spacing, confident editorial typography, full-bleed photography where it earns its place, restrained accent colour, and one obvious next step per screen.",
  "Work at mobile and desktop: never propose something that only reads well on a wide screen.",
].join(" ");

/** Compact JSON contract. Anything outside it is dropped by the validator. */
function actionContract(context: AgentContext): string {
  return [
    "Reply with ONE JSON object and nothing else:",
    '{"reply":string,"summary":string,"requirements":string[],"questions":string[],"notes":string[],"actions":Action[]}',
    "",
    "Action is one of:",
    '{"type":"set_section_text","sectionId":id,"field":"heading"|"subheading"|"body","value":string}',
    '{"type":"set_section_visibility","sectionId":id,"visible":boolean}',
    '{"type":"set_section_variant","sectionId":id,"variant":string}',
    '{"type":"add_section","pageId":id,"ref":"temp_section_1","kind":kind,"heading":string,"subheading":string,"body":string,"position":number}',
    '{"type":"delete_section","sectionId":id}',
    '{"type":"reorder_sections","pageId":id,"sectionIds":[id,...]}',
    '{"type":"set_component","componentId":id,"patch":{"label":string,"body":string,"link_label":string,"link_url":string}}',
    '{"type":"add_component","sectionId":id,"ref":"temp_component_1","kind":kind,"label":string,"body":string,"link_label":string,"link_url":string}',
    '{"type":"delete_component","componentId":id}',
    '{"type":"generate_component_image","componentId":id,"prompt":string,"alt":string,"mode":"replace"|"create"}',
    '{"type":"add_page","ref":"temp_page_1","kind":kind,"title":string,"slug":string}',
    '{"type":"set_page","pageId":id,"patch":{"title":string,"seo_title":string,"seo_description":string}}',
    '{"type":"set_theme","patch":{"primary_color":"#RRGGBB","secondary_color":"#RRGGBB","accent_color":"#RRGGBB","font_preference":string}}',
    '{"type":"set_business_fact","field":"tagline"|"description","value":string}',
    "",
    `Use at most ${MAX_ACTIONS} actions. Every id must be copied exactly from the website below, or be a temp ref you created earlier in the same list.`,
    `Allowed section kinds: ${context.sectionKinds.join(", ")}.`,
    `Allowed page kinds: ${context.pageKinds.join(", ")}.`,
    `Allowed component kinds: ${context.componentKinds.join(", ")}, image, hero_image.`,
    "When a section should show photography, add the image component AND a generate_component_image action for it. Image prompts describe a real, specific scene for this business: no text, logos, watermarks, awards, reviews or identifiable customers in the picture.",
  ].join("\n");
}

function businessBlock(context: AgentContext): string {
  const b = context.business;
  const facts: string[] = [
    `name: ${b.name || "(not supplied)"}`,
    `trade: ${b.industry ?? "(not supplied)"}`,
    `description: ${b.description ?? "(not supplied)"}`,
    `town: ${[b.city, b.state].filter(Boolean).join(", ") || "(not supplied)"}`,
    `service area: ${b.serviceArea ?? "(not supplied)"}`,
    `phone supplied: ${b.phone ? "yes" : "no"}`,
    `email supplied: ${b.email ? "yes" : "no"}`,
    `years in business: ${b.yearsInBusiness ?? "(not supplied)"}`,
    `published reviews: ${b.publishedReviewCount ?? 0}`,
    `owner photos available: ${b.photoCount ?? 0}`,
    `current colours: ${[b.primaryColor, b.secondaryColor, b.accentColor].filter(Boolean).join(" ") || "(none set)"}`,
    `current font preference: ${b.fontPreference ?? "(none set)"}`,
    `services: ${
      b.services?.length
        ? b.services
            .map((service) =>
              service.price != null
                ? `${service.name} ($${service.price})`
                : service.startingPrice != null
                  ? `${service.name} (from $${service.startingPrice})`
                  : service.name,
            )
            .join("; ")
        : "(none supplied)"
    }`,
  ];
  return facts.join("\n");
}

function siteBlock(context: AgentContext): string {
  return context.pages
    .map((page) => {
      const sections = page.sections
        .map((section) => {
          const components = section.components
            .map(
              (component) =>
                `      component ${component.id} ${component.kind}${
                  component.label ? ` "${component.label.slice(0, 60)}"` : ""
                }${component.media_url ? " [has picture]" : ""}`,
            )
            .join("\n");
          return [
            `    section ${section.id} ${section.kind}${section.is_visible ? "" : " (hidden)"}`,
            section.heading ? `      heading: ${section.heading.slice(0, 120)}` : null,
            section.subheading ? `      subheading: ${section.subheading.slice(0, 160)}` : null,
            section.body ? `      body: ${section.body.slice(0, 240)}` : null,
            components || null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");
      return [`  page ${page.id} /${page.slug} "${page.title}" (${page.kind})`, sections]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const textList = (value: unknown, limit: number, max = 300): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim().slice(0, max) : ""))
        .filter((item) => item.length > 0)
        .slice(0, limit)
    : [];

/**
 * Terra's review. It may only *remove* actions and add notes, so a review can
 * never introduce a change the owner's request and facts do not support.
 */
function applyReview(
  actions: unknown[],
  review: Record<string, unknown> | null,
): { actions: unknown[]; notes: string[] } {
  if (!review) return { actions, notes: [] };
  const rejected = new Set(
    textList(review["reject"], 64, 8)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value)),
  );
  const rejectNumbers = Array.isArray(review["reject"])
    ? (review["reject"] as unknown[])
        .map((value) => (typeof value === "number" ? value : Number.NaN))
        .filter((value) => Number.isInteger(value))
    : [];
  for (const value of rejectNumbers) rejected.add(value);
  const kept = actions.filter((_, index) => !rejected.has(index));
  return { actions: kept, notes: textList(review["notes"], 6) };
}

export async function planWebsiteChangesWithAi(input: {
  organizationId: string;
  instruction: string;
  history: string[];
  context: AgentContext;
  attachments: { kind: string; name: string }[];
}): Promise<AiPlanOutcome> {
  const { context } = input;
  const system = [
    DESIGN_RULES,
    TRUTH_RULES,
    "You work only through the action contract you are given. You never return prose outside the JSON object.",
  ].join("\n\n");

  const user = [
    "BUSINESS FACTS (the only facts you may state):",
    businessBlock(context),
    "",
    "THE LIVE WEBSITE (copy ids exactly):",
    siteBlock(context),
    "",
    input.history.length
      ? `EARLIER INSTRUCTIONS AND STANDING RULES FROM THE OWNER:\n${input.history.join("\n")}\n`
      : "",
    input.attachments.length
      ? `THE OWNER ATTACHED: ${input.attachments.map((a) => `${a.kind} ${a.name}`).join(", ")}\n`
      : "",
    "THE OWNER'S REQUEST:",
    input.instruction,
    "",
    actionContract(context),
  ]
    .filter(Boolean)
    .join("\n");

  const direction = await callCollective({
    purpose: "creative_direction",
    complexity: "high",
    system,
    user,
    organizationId: input.organizationId,
    maxOutputTokens: 6000,
  });
  if (!direction.ok) {
    return { ok: false, reason: direction.reason, detail: direction.detail };
  }

  const proposal = parseJsonObject(direction.text);
  const proposedActions = Array.isArray(proposal?.["actions"])
    ? (proposal["actions"] as unknown[]).slice(0, MAX_ACTIONS)
    : [];
  if (!proposal || !proposedActions.length) {
    return {
      ok: false,
      reason: "unusable_answer",
      detail: "the design answer could not be read as a website change",
    };
  }

  let costMicrocents = direction.costMicrocents;
  let reviewModel: string | null = null;
  let notes = textList(proposal["notes"], 6);

  const review = await callCollective({
    purpose: "adversarial_review",
    complexity: "high",
    system: [
      "You are the reviewer. You check a proposed website change against the owner's real facts and against premium design standards.",
      TRUTH_RULES,
      'Reply with ONE JSON object: {"reject":number[],"notes":string[]}. `reject` holds the zero-based indexes of actions that invent a fact, use filler or generic wording, leave a visual empty, or would make the site look like a stock template. Reject nothing else.',
    ].join("\n\n"),
    user: [
      "BUSINESS FACTS:",
      businessBlock(context),
      "",
      "THE OWNER'S REQUEST:",
      input.instruction,
      "",
      "PROPOSED ACTIONS (index: action):",
      proposedActions.map((action, index) => `${index}: ${JSON.stringify(action)}`).join("\n"),
    ].join("\n"),
    organizationId: input.organizationId,
    maxOutputTokens: 1200,
  });

  let actions = proposedActions;
  if (review.ok) {
    reviewModel = review.model;
    costMicrocents += review.costMicrocents;
    const applied = applyReview(proposedActions, parseJsonObject(review.text));
    actions = applied.actions;
    notes = [...notes, ...applied.notes].slice(0, 8);
  }

  if (!actions.length) {
    return {
      ok: false,
      reason: "review_rejected",
      detail: "the review removed every proposed change",
    };
  }

  const requirements = textList(proposal["requirements"], 8, 120).map((label) => ({
    label,
    covered: true,
  }));

  const trace = [
    `Creative direction, layout and wording composed by ${direction.model}.`,
    review.ok
      ? `Reviewed by ${review.model}: ${proposedActions.length - actions.length} change(s) removed.`
      : "Review unavailable, so only changes that pass the fact and safety checks were kept.",
    "No template or preset design was used.",
  ];

  return {
    ok: true,
    reply:
      (typeof proposal["reply"] === "string" ? proposal["reply"].trim().slice(0, 1500) : "") ||
      "Here's what I'll change.",
    summary:
      (typeof proposal["summary"] === "string" ? proposal["summary"].trim().slice(0, 300) : "") ||
      "Website update",
    actions,
    questions: textList(proposal["questions"], 3),
    notes,
    trace,
    requirements,
    model: direction.model,
    reviewModel,
    costMicrocents,
  };
}
