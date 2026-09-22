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

import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import type { AgentContext } from "@/lib/site-agent.server";
import { MAX_ACTIONS } from "@/lib/site-agent";
import { SITE_HEADING_FONTS } from "@/lib/site-theme";

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
  "Never invent a business fact. Prices, years in business, review counts, awards, certifications, guarantees, phone numbers and addresses may only be used when supplied below.",
  "Never emit executable markup, unsafe URLs, scripts, or values that could escape the website's safe rendering boundary.",
].join(" ");

const DESIGN_RULES = [
  "You are the senior creative director, art director and conversion strategist for this website.",
  "You own the visual direction: section choice, section order, headings, copy voice, colour, typography, composition, imagery, interaction, responsive behavior and page structure.",
  "Design for this exact business in its exact trade and town. Do not reuse a stock composition merely because it is familiar.",
  "There is no required hero, section sequence, spacing rhythm, CTA position, colour palette, typography pairing, motion recipe or conversion pattern. Choose whatever the brief calls for.",
  "Work at mobile and desktop: author responsive behavior explicitly when it matters instead of assuming a generic mobile transformation.",
  "For a direct style request, change only the requested property and target unless the requested result genuinely requires coordinated supporting changes.",
  "A vague request such as 'change the background color' must produce a clearly perceptible change from the current colour while preserving readable contrast.",
  "In customer messages, 'front' or 'fronts' beside colour, background or style almost always means 'font' or 'fonts'. Treat that wording as typography unless foreground/text colour is explicit.",
  "If the owner asks for a whole-site or all-pages colour change, update every explicit section or component colour that would otherwise conceal the requested theme.",
].join(" ");

/** Compact JSON contract. Anything outside it is dropped by the validator. */
function actionContract(context: AgentContext): string {
  const fonts = Object.keys(SITE_HEADING_FONTS).join("|");
  return [
    "Reply with ONE JSON object and nothing else:",
    '{"reply":string,"summary":string,"requirements":string[],"questions":string[],"notes":string[],"actions":Action[],"hasMore":boolean,"cursor":string|null}',
    "",
    "Set hasMore=true only when another chunk is genuinely needed. cursor is an opaque continuation token for the next chunk.",
    "Action is one of:",
    '{"type":"set_section_text","sectionId":id,"field":"heading"|"subheading"|"body","value":string}',
    '{"type":"set_section_visibility","sectionId":id,"visible":boolean}',
    '{"type":"set_section_variant","sectionId":id,"variant":string}',
    '{"type":"set_section_visual","sectionId":id,"patch":{"layout":"legacy compatibility only; prefer set_ai_visual for new creative work"}}',
    '{"type":"set_ai_visual","sectionId":id,"patch":{"anySafeVisualProperty":"safe primitive visual/layout value"}}',
    '{"type":"set_ai_responsive","sectionId":id,"width":390,"patch":{"anySafeResponsiveProperty":"safe primitive responsive value"}}',
    '{"type":"set_ai_component_visual","componentId":id,"patch":{"anySafeVisualProperty":"safe primitive visual value"}}',
    '{"type":"set_ai_component_responsive","componentId":id,"width":390,"patch":{"anySafeResponsiveProperty":"safe primitive responsive value"}}',
    '{"type":"set_block_style","target":"section|component","targetId":id,"device":"desktop|tablet|mobile","patch":{"font":"display|body|serif|mono","size":"10..160","weight":"100..900","align":"left|center|right","lineHeight":"0.75..3","letterSpacing":"-0.1..0.3","textTransform":"none|uppercase|capitalize","italic":boolean,"textColor":"#RRGGBB or common named colour","columns":"1..6","gap":"0..240","maxWidth":"240..1920","contentAlign":"left|center|right","padTop":"0..240","padRight":"0..240","padBottom":"0..240","padLeft":"0..240","marginTop":"-240..240","marginBottom":"-240..240","bgColor":"#RRGGBB or common named colour","bgGradient":"#RRGGBB or common named colour (second gradient stop)","bgGradientAngle":"0..360","bgImage":"safe https URL or internal path","overlay":"0..100","radius":"0..999","borderWidth":"0..12","borderColor":"#RRGGBB or common named colour","shadow":"none|subtle|medium|strong","opacity":"0..100","objectFit":"cover|contain|fill","buttonStyle":"solid|outline|ghost|link","buttonSize":"sm|md|lg","buttonTextColor":"#RRGGBB or common named colour","buttonBgColor":"#RRGGBB or common named colour","hidden":boolean}}',
    '{"type":"add_section","pageId":id,"ref":"temp_section_1","kind":kind,"heading":string,"subheading":string,"body":string,"position":number}',
    '{"type":"delete_section","sectionId":id}',
    '{"type":"reorder_sections","pageId":id,"sectionIds":[id,...]}',
    '{"type":"set_component","componentId":id,"patch":{"label":string,"body":string,"link_label":string,"link_url":string}}',
    '{"type":"set_component_visual","componentId":id,"patch":{"alt":string,"object_fit":"cover|contain","object_position":string,"overlay":"none|soft|dark|brand|gradient","radius":"none|small|medium|large|pill","shadow":"none|soft|medium|strong","aspect_ratio":"1:1|4:3|3:2|16:9|21:9","focal_point":string}}',
    '{"type":"add_component","sectionId":id,"ref":"temp_component_1","kind":kind,"label":string,"body":string,"link_label":string,"link_url":string}',
    '{"type":"delete_component","componentId":id}',
    '{"type":"generate_component_image","componentId":id,"prompt":string,"alt":string,"mode":"replace"|"create"}',
    '{"type":"add_page","ref":"temp_page_1","kind":kind,"title":string,"slug":string}',
    '{"type":"set_page","pageId":id,"patch":{"title":string,"seo_title":string,"seo_description":string}}',
    `{"type":"set_theme","patch":{"primary_color":"#RRGGBB","secondary_color":"#RRGGBB","accent_color":"#RRGGBB","heading_font":"${fonts}","body_font":"${fonts}"}}`,
    '{"type":"set_business_fact","field":"tagline"|"description","value":string}',
    "",
    "Use as many actions as the work genuinely needs — there is no target or budget. Copy existing IDs exactly. New pages, sections and components may use creative kinds invented for this business.",
    "Page, section and component kinds are creative identifiers. For new content, invent the structure needed by this business rather than choosing from a preset library.",


    "When a section should show photography, add the image component AND a generate_component_image action for it. Image prompts describe a real, specific scene for this business: no text, logos, watermarks, awards, reviews or identifiable customers in the picture.",
    "Prefer set_ai_visual/set_ai_responsive for new section creative styling. These values are accepted only after server-side safety filtering; never place HTML, JavaScript or unsafe URLs in them.",

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
                }${component.media_url ? " [has picture]" : ""}${component.settings ? ` settings=${JSON.stringify(component.settings).slice(0, 500)}` : ""}`,
            )
            .join("\n");
          return [
            `    section ${section.id} ${section.kind}${section.is_visible ? "" : " (hidden)"}`,
            section.heading ? `      heading: ${section.heading.slice(0, 120)}` : null,
            section.subheading ? `      subheading: ${section.subheading.slice(0, 160)}` : null,
            section.body ? `      body: ${section.body.slice(0, 240)}` : null,
            section.settings ? `      current settings: ${JSON.stringify(section.settings).slice(0, 900)}` : null,
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

  let costMicrocents = 0;
  let model = "unknown";
  let reviewModel: string | null = null;
  let reply = "Here's what I'll change.";
  let summary = "Website update";
  let questions: string[] = [];
  let notes: string[] = [];
  let requirements: { label: string; covered: boolean }[] = [];
  const trace: string[] = [];
  const actions: unknown[] = [];
  const createdRefs = new Set<string>();
  let cursor: string | null = null;
  let completed = false;

  for (let chunkIndex = 0; chunkIndex < 12; chunkIndex += 1) {
    const contextBlock = [
      "BUSINESS FACTS (the only facts you may state):",
      businessBlock(context),
      "",
      "THE LIVE WEBSITE (copy ids exactly):",
      siteBlock(context),
      "",
      input.history.length
        ? "EARLIER INSTRUCTIONS AND STANDING RULES FROM THE OWNER:\n" + input.history.join("\n")
        : "",
      input.attachments.length
        ? "THE OWNER ATTACHED: " + input.attachments.map((a) => a.kind + " " + a.name).join(", ")
        : "",
      "THE OWNER'S REQUEST:",
      input.instruction,
      "",
      actionContract(context),
    ].filter(Boolean).join("\n");

    const continuation = chunkIndex === 0
      ? ""
      : [
          "CONTINUATION OF THE SAME AI-AUTHORED PLAN.",
          "Do not repeat or undo previously accepted actions.",
          "Plan only the remaining work for the owner's request.",
          "Previously accepted action count: " + actions.length,
          "Existing temporary refs: " + [...createdRefs].slice(0, 500).join(", "),
          "Continuation cursor: " + (cursor ?? "none"),
          "Previous action tail:",
          JSON.stringify(actions.slice(-40)),
        ].join("\n");

    const direction = await callBestThinker({
      json: true,
      purpose: "creative_direction",
      complexity: "high",
      system,
      user: contextBlock + (continuation ? "\n\n" + continuation : ""),
      organizationId: input.organizationId,
      maxOutputTokens: 12000,
    });

    if (!direction.ok) {
      return { ok: false, reason: direction.reason, detail: direction.detail };
    }
    model = direction.model;
    costMicrocents += direction.costMicrocents;

    const proposal = parseJsonObject(direction.text);
    if (!proposal) {
      return {
        ok: false,
        reason: "unusable_answer",
        detail: "the design answer could not be read as a website change in chunk " + (chunkIndex + 1),
      };
    }

    const proposedActions = Array.isArray(proposal["actions"])
      ? (proposal["actions"] as unknown[])
      : [];
    const hasMore = proposal["hasMore"] === true;
    const proposalCursor = typeof proposal["cursor"] === "string"
      ? proposal["cursor"].trim().slice(0, 120)
      : null;

    if (typeof proposal["reply"] === "string") reply = proposal["reply"].trim().slice(0, 1500) || reply;
    if (typeof proposal["summary"] === "string") summary = proposal["summary"].trim().slice(0, 300) || summary;
    questions = [...questions, ...textList(proposal["questions"], 3)].slice(0, 6);
    notes = [...notes, ...textList(proposal["notes"], 6)].slice(0, 12);
    requirements = [...requirements, ...textList(proposal["requirements"], 8, 120).map((label) => ({ label, covered: true }))].slice(0, 12);

    if (!proposedActions.length) {
      if (chunkIndex === 0 || hasMore) {
        return {
          ok: false,
          reason: "unusable_answer",
          detail: hasMore
            ? "the AI requested another continuation chunk without providing additional actions"
            : "the design answer contained no executable website actions",
        };
      }
      completed = true;
      break;
    }

    const review = await callBestThinker({
      json: true,
      purpose: "adversarial_review",
      complexity: "high",
      system: [
        "You are Terra, the adversarial integrity reviewer for an AI-authored website change.",
        TRUTH_RULES,
        'Reply with ONE JSON object: {"reject":number[],"notes":string[]}. Reject only actions that invent unsupported business facts, contain unsafe/executable values, create broken references, violate required accessibility or reduced-motion protections, corrupt ownership/integrity, or otherwise cannot be safely executed. Do not reject an action because of taste, aesthetics, novelty, section choice, copy voice, layout preference, or because it differs from a familiar template.',
      ].join("\n\n"),
      user: [
        "BUSINESS FACTS:",
        businessBlock(context),
        "",
        "THE OWNER'S REQUEST:",
        input.instruction,
        "",
        "PROPOSED ACTIONS (index: action):",
        proposedActions.map((action, index) => index + ": " + JSON.stringify(action)).join("\n"),
      ].join("\n"),
      organizationId: input.organizationId,
      maxOutputTokens: 1200,
    });

    if (!review.ok) {
      return {
        ok: false,
        reason: review.reason,
        detail: review.detail ?? "Terra review was unavailable; no unreviewed actions were accepted.",
      };
    }

    reviewModel = review.model;
    costMicrocents += review.costMicrocents;
    const appliedReview = applyReview(proposedActions, parseJsonObject(review.text));
    const kept = appliedReview.actions;
    actions.push(...kept);
    for (const action of kept) {
      if (!action || typeof action !== "object" || Array.isArray(action)) continue;
      const ref = (action as Record<string, unknown>)["ref"];
      if (typeof ref === "string" && ref.trim()) createdRefs.add(ref.trim().slice(0, 120));
    }
    notes = [...notes, ...appliedReview.notes].slice(0, 12);
    trace.push("AI creative chunk " + (chunkIndex + 1) + " composed by " + direction.model + "; Terra reviewed it and removed " + (proposedActions.length - kept.length) + " unsafe/invalid action(s).");

    if (actions.length > MAX_ACTIONS) {
      return {
        ok: false,
        reason: "continuation_exhausted",
        detail: "the AI plan exceeded the supported action budget; no partial plan was applied",
      };
    }

    cursor = proposalCursor;
    if (!hasMore) {
      completed = true;
      break;
    }
  }

  if (!completed) {
    return {
      ok: false,
      reason: "continuation_exhausted",
      detail: "the AI change exceeded the supported continuation window; no partial plan was applied",
    };
  }
  if (!actions.length) {
    return {
      ok: false,
      reason: "review_rejected",
      detail: "Terra removed every executable website action",
    };
  }

  trace.push("No deterministic creative scaffold, theme preset, or template was used.");
  return {
    ok: true,
    reply,
    summary,
    actions,
    questions,
    notes,
    trace,
    requirements,
    model,
    reviewModel,
    costMicrocents,
  };
}
