/**
 * Server-only planner for the Revora Site Agent.
 *
 * The client can type anything — one line or a two-page brief — and the agent
 * answers with a concrete plan of edits across pages, sections, items, page
 * settings, SEO fields, look-and-feel and business details.
 *
 * Two rules are non-negotiable and enforced in the prompt and in validation:
 * it may only touch the workspace it was given, and it may never invent facts
 * about the business (no reviews, awards, licences, guarantees or prices that
 * were not supplied).
 */

import { RevoraAiError } from "@/lib/ai/errors";
import { generateStructuredOutput, transcribeAudio } from "@/lib/ai/router.server";
import type { AiCaller, AiMessage, AiPart } from "@/lib/ai/types";
import type { ModelRole } from "@/lib/ai/config";
import { translateIntent } from "@/lib/intent-translator";
import {
  MAX_ACTIONS,
  readChapters,
  type AgentAttachment,
  type AgentChapter,
  type AgentTurn,
} from "@/lib/site-agent";

export const AGENT_ROLE: ModelRole = "coding";
export const AGENT_FALLBACK_ROLE: ModelRole = "fast";

export type SiteMapPage = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  is_visible: boolean;
  noindex: boolean;
  seo_title: string | null;
  seo_description: string | null;
  sections: {
    id: string;
    kind: string;
    variant: string;
    is_visible: boolean;
    heading: string | null;
    subheading: string | null;
    body: string | null;
    sort_order: number;
    components: {
      id: string;
      kind: string;
      label: string | null;
      body: string | null;
      link_label: string | null;
      link_url: string | null;
      sort_order: number;
      media_url?: string | null;
      settings?: unknown;
    }[];
    settings?: unknown;
  }[];
};

export type AgentContext = {
  business: {
    name: string;
    industry: string | null;
    tagline: string | null;
    description: string | null;
    city: string | null;
    state: string | null;
    serviceArea: string | null;
    phone: string | null;
    email: string | null;
    yearsInBusiness: number | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
    fontPreference: string | null;
    services: { name: string; price: number | null; startingPrice: number | null }[];
    publishedReviewCount: number;
    photoCount: number;
  };
  pages: SiteMapPage[];
  sectionKinds: string[];
  pageKinds: string[];
  componentKinds: string[];
};

const SYSTEM = `You are Revora's website agent. You edit a local business's live website
on the owner's behalf. You are competent, calm and specific — like a senior web
producer who reads a brief and returns a precise change list.

WHAT YOU CAN DO
You return a JSON plan of actions. You can do all of the following, in one plan,
in any combination, and in any quantity up to ${MAX_ACTIONS} actions:
- rewrite any headline, sub-headline or body text
- add, remove, hide, show, restyle and reorder sections
- add, edit or remove items inside a section (features, FAQs, cards, buttons, links)
- add new pages, rename pages, change their web address, hide them, noindex them
- write page titles, meta descriptions, canonical and social (OpenGraph) text
- change brand colours and font preference
- generate a new AI picture, or change an existing picture, and attach the result to the exact requested item
- correct business details (tagline, description, phone, email, city, service area, review link)

HARD RULES
- Only use ids present in the SITE MAP or a temp_* reference created earlier in THIS plan. Never invent an id. Never touch anything else.
- Respect dependency order: create a page before targeting its page reference, create a section before targeting its section reference, and create a component before targeting its component reference.
- Never invent facts: no reviews, ratings, awards, certifications, licences, insurance,
  guarantees, years in business, staff counts, addresses or prices unless supplied.
  If a claim needs a fact you do not have, put the request in "questions" instead.
- Do not use placeholder brackets, lorem ipsum, emoji or ALL CAPS shouting.
- Local-business copy: plain, confident, specific, benefit-first, with a clear next step
  (call, book, get a price). Keep headlines under ~70 characters.
- Visual effects are available: use set_backdrop for a site-wide animated background
  (stars, aurora, nebula, grid, spotlight, gradient_mesh) and set_section_effect for depth
  on a single section (float_3d, tilt_3d, glass, gold_glow, rise, parallax_slow, shine).
  Use them when the owner asks for something premium, 3D, animated or "wow" — never more
  than a couple of section effects per page, so the site stays fast and readable.
- Big requests are welcome: break them into as many small actions as needed and do the
  whole job. Do not stop after one edit when the brief asks for more.
- If part of the request is impossible with the actions available, do it partially and
  say what you skipped in "notes". Never pretend something was done.

ACTION SHAPES (use exactly these)
{"type":"set_section_text","sectionId":"<id>","field":"heading|subheading|body","value":"..."}
{"type":"set_section_visibility","sectionId":"<id>","visible":true|false}
{"type":"set_section_variant","sectionId":"<id>","variant":"default|split|centered|compact"}
{"type":"add_section","pageId":"<id>","kind":"<section kind>","heading":"...","subheading":"...","body":"...","position":2}
{"type":"delete_section","sectionId":"<id>"}
{"type":"reorder_sections","pageId":"<id>","sectionIds":["<id>","<id>", "..."]}
{"type":"reorder_components","sectionId":"<id>","componentIds":["<id>","<id>", "..."]}
{"type":"set_component","componentId":"<id>","patch":{"label":"...","body":"...","link_label":"...","link_url":"...","is_visible":true}}
{"type":"generate_component_image","componentId":"<id>","prompt":"Detailed photographic art direction grounded in the business and requested change","alt":"Factual description without invented claims","mode":"replace|create"}
  (use this whenever the owner asks to make, replace, regenerate, or change a picture. Never use set_component_visual with an invented URL.)
{"type":"add_component","sectionId":"<id>","ref":"temp_component_1","kind":"<component kind>","label":"...","body":"...","link_label":"...","link_url":"/contact"}
  (give a new component a "ref" when later actions in the SAME plan need to edit, style or remove it)
{"type":"delete_component","componentId":"<id>"}
{"type":"add_page","kind":"<page kind>","title":"...","slug":"...","ref":"temp_1"}
  (give every new page a "ref" like temp_1, temp_2 — later actions in the SAME plan may use
   that ref as their "pageId", so you can create a page and fill it with sections in one go)
{"type":"set_page","pageId":"<id>","patch":{"title":"...","slug":"...","is_visible":true,"noindex":false,"seo_title":"...","seo_description":"...","og_title":"...","og_description":"..."}}
{"type":"delete_page","pageId":"<id>"}
{"type":"set_theme","patch":{"primary_color":"#RRGGBB","secondary_color":"#RRGGBB","accent_color":"#RRGGBB","font_preference":"..."}}
{"type":"set_backdrop","backdrop":"none|stars|aurora|nebula|grid|spotlight|gradient_mesh"}
{"type":"set_section_effect","sectionId":"<id>","effect":"none|float_3d|tilt_3d|glass|gold_glow|rise|parallax_slow|shine"}
{"type":"set_custom_block","sectionId":"<id>","spec":{ ...custom block spec... }}
  (build something the fixed section kinds cannot do. Spec types:
   {"type":"calculator","title":"...","note":"Guide price only ...","resultLabel":"...","currency":true,"base":80,
    "fields":[{"id":"size","label":"Vehicle size","kind":"select","options":[{"label":"Car","value":0},{"label":"SUV","value":40}]},
              {"id":"rooms","label":"Rooms","kind":"number","rate":25,"min":1,"max":10,"step":1,"unit":"rooms"}]}
   {"type":"quiz","questions":[{"prompt":"...","options":[{"label":"...","outcome":"repair"}]}],"outcomes":[{"id":"repair","label":"...","body":"..."}]}
   {"type":"comparison","columns":["Standard","Premium"],"rows":[{"label":"Turnaround","cells":["3 days","24 hours"]}]}
   {"type":"steps"|"checklist","items":[{"label":"...","body":"..."}]}
   {"type":"tabs","items":[{"label":"...","body":"..."}]}
   {"type":"metrics","items":[{"label":"Years in business","value":"12"}]}
   {"type":"accordion","items":[{"label":"Do you cover my area?","body":"..."}]}
   {"type":"timeline","items":[{"marker":"Day 1","label":"Site survey","body":"..."}]}
   {"type":"filter","items":[{"label":"Bathroom refit","body":"...","tags":["Bathrooms","Full refit"]}]}
   {"type":"eligibility","note":"Guide only ...","questions":[{"prompt":"Is the property within 20 miles?"}],
    "pass":{"label":"You're covered","body":"..."},"fail":{"label":"Ask us first","body":"..."}}
   {"type":"booking","note":"We confirm every request by phone ...","services":["Service A"],"times":["Weekday mornings"],
    "ctaLabel":"Request this time","ctaHref":"#contact"}
   {"type":"gauge","note":"...","items":[{"label":"Jobs completed on time","value":96,"caption":"..."}]}
   {"type":"freeform","title":"...","note":"Guide only ...","root":[ ...parts... ]}
    USE THIS when the request does not fit any shape above — build the panel part by part.
    Parts: {"node":"stack","direction":"row|column","gap":0-8,"align":"start|center|end","children":[...]}
           {"node":"grid","columns":1-4,"gap":0-8,"children":[...]}
           {"node":"card","tone":"surface|muted|accent|outline","children":[...]}
           {"node":"heading","level":2|3|4,"text":"..."}
           {"node":"text","text":"...","tone":"default|muted","size":"sm|md|lg"}
           {"node":"badge","text":"...","tone":"signal|attention|neutral"}
           {"node":"list","ordered":false,"items":["...","..."]}
           {"node":"image","src":"https://... or /path","alt":"...","ratio":"16:9|4:3|1:1|3:2"}
           {"node":"link","text":"...","href":"#contact","variant":"primary|secondary|quiet"}
           {"node":"divider"}
           {"node":"field","id":"rooms","kind":"number","label":"Rooms","min":1,"max":12,"step":1,"value":3,"unit":"rooms"}
           {"node":"field","id":"depth","kind":"select","label":"...","options":[{"label":"Regular","value":30}]}
           {"node":"field","id":"pets","kind":"toggle","label":"Pets at home?","value":0}
           {"node":"value","label":"Visit length","format":"number|currency|percent|duration","caption":"...",
            "expr":{"op":"mul","args":[{"op":"ref","id":"rooms"},{"op":"ref","id":"depth"}]}}
           {"node":"when","expr":{"op":"gt","args":[{"op":"ref","id":"rooms"},6]},"children":[...]}
    Calculation steps: num, ref, add, sub, mul, div, min, max, round for figures;
    gt, gte, lt, lte, eq, and, or, not for a "when" test. A "ref" may only name a
    "field" id declared EARLIER in the same block. A block that works out a figure
    must carry a "note" saying the result is a guide. At most 12 inputs, 160 parts.
   Only ever use figures, prices and wording the owner actually supplied. An estimator must
   carry a "note" saying the result is an estimate. Add the section first with
   {"type":"add_section","kind":"custom","ref":"temp_block_1", ...} and then target that ref.)
{"type":"set_business_fact","field":"tagline|description|phone|email|city|state|service_area|address|review_link|website","value":"..."}

 
Temporary references can be used in any later action in the same plan. Each namespace is separate: page refs target pages, section refs target sections, and component refs target components. Do not reuse a reference name.

RESPONSE FORMAT — a single JSON object, no markdown:
{
  "reply": "1-4 sentences to the owner, in their language, saying what you're about to change and why it helps them get more customers.",
  "summary": "One line describing the whole plan.",
  "actions": [ ...actions... ],
  "questions": ["only genuine blockers — facts you need from the owner"],
  "notes": ["anything you deliberately did not do"]
}
When the request is a question rather than a change, answer it in "reply" and return an empty "actions" array.

PLAIN LANGUAGE, NO REVORA TERMS
- The owner does not know Revora's vocabulary and must never be asked to learn it.
  Never reply that a request is unclear, unsupported or "not in Revora's terms",
  and never ask them to reword it. Read the intent and act on it.
- Work out for yourself which pages, sections, copy, design, search text, photos,
  buttons and functionality the request implies, even when none of them are named.
- Ask at most ONE question, only when a fact you cannot know is the only thing
  blocking the work. Otherwise proceed and record assumptions in "notes".`;

function siteMap(context: AgentContext) {
  return JSON.stringify(
    {
      business: context.business,
      allowedSectionKinds: context.sectionKinds,
      allowedPageKinds: context.pageKinds,
      allowedComponentKinds: context.componentKinds,
      pages: context.pages,
    },
    null,
    1,
  );
}

type ContentPart = AiPart;
export type ChatMessage = AiMessage;

function attachmentPart(attachment: AgentAttachment): ContentPart {
  if (attachment.kind === "image")
    return { type: "image", dataUrl: attachment.dataUrl, mimeType: attachment.mimeType };
  if (attachment.kind === "video")
    return { type: "video", dataUrl: attachment.dataUrl, mimeType: attachment.mimeType };
  return { type: "audio", dataUrl: attachment.dataUrl, mimeType: attachment.mimeType };
}

export async function callJson(
  role: ModelRole,
  messages: ChatMessage[],
  caller?: Partial<AiCaller>,
) {
  const result = await generateStructuredOutput(
    {
      task: caller?.task ?? "site.agent",
      organizationId: caller?.organizationId ?? null,
      userId: caller?.userId ?? null,
    },
    { messages, role },
  );
  return result.data;
}

/**
 * Runs one planning turn. Native Revora planning is attempted first whenever
 * the deterministic/autonomous brain can safely satisfy the request. This
 * keeps the normal builder path free-first and makes this server planner obey
 * the same safety boundary instead of jumping straight to an external model.
 */
export async function planChanges(
  context: AgentContext,
  instruction: string,
  history: AgentTurn[],
  attachments: AgentAttachment[] = [],
  caller?: Partial<AiCaller>,
): Promise<Record<string, unknown>> {
  const { buildAutonomousPlan } = await import("@/lib/builder/autonomous-brain");
  const native = buildAutonomousPlan(context, instruction, {
    history: history
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.content)
      .slice(-6),
    attachments: attachments.map((attachment) => ({
      kind: attachment.kind,
      name: attachment.name,
    })),
  });

  // Picture creation/editing requires semantic art direction and the dedicated
  // image action. Never let a text-only deterministic plan swallow this intent.
  const requestsPictureWork = /\b(image|photo|picture|photograph|hero shot)\b/i.test(instruction) &&
    /\b(change|replace|regenerate|generate|create|make|edit|swap|new)\b/i.test(instruction);

  if (native.actions.length > 0 && !native.requiresExternalReasoning && !requestsPictureWork) {
    return {
      reply: native.reply,
      summary: native.summary,
      actions: native.actions,
      questions: native.questions,
      notes: native.notes,
      trace: native.trace,
    };
  }

  const intent = translateIntent(instruction);
  const parts: ContentPart[] = [
    {
      type: "text",
      text: `REQUEST FROM THE OWNER:\n${instruction}\n\nTRANSLATED BRIEF (worked out from their words — the owner does not know Revora's terms):\n${intent.brief}${
        intent.question
          ? `\n\nIf and only if this is genuinely blocking, ask exactly this one question and nothing else: ${intent.question}`
          : ""
      }`,
    },
  ];
  if (attachments.length) {
    parts.push({
      type: "text",
      text:
        `The owner attached ${attachments.length} file(s): ${attachments
          .map((attachment) => `${attachment.kind} — ${attachment.name}`)
          .join("; ")}. ` +
        `Use them as context for the request: read any words shown or spoken, describe what is pictured only when it helps the copy, ` +
        `and follow spoken instructions exactly as if they had been typed. Never state a fact (price, award, rating, guarantee) that ` +
        `only appears to be true from a photo — if it matters, ask for it in "questions".` +
        attachments
          .filter((attachment) => attachment.chapters?.length)
          .map(
            (attachment) =>
              `\nMoments already noted in "${attachment.name}": ` +
              attachment
                .chapters!.map((chapter) => `${chapter.at} ${chapter.label} — ${chapter.detail}`)
                .join(" | ") +
              `. When the owner mentions a timestamp, use the moment at that time.`,
          )
          .join(""),
    });
    for (const attachment of attachments) parts.push(attachmentPart(attachment));
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `SITE MAP AND BUSINESS FACTS:\n${siteMap(context)}` },
    ...history.slice(-8).map((turn) => ({ role: turn.role, content: turn.content })),
    {
      role: "user",
      content: parts.length === 1 ? (parts[0] as { text: string }).text : parts,
    },
  ];

  const plannerCaller = { ...caller, task: caller?.task ?? "site.plan" };
  try {
    return await callJson(AGENT_ROLE, messages, plannerCaller);
  } catch (error) {
    if (
      error instanceof RevoraAiError &&
      ["not_configured", "free_unavailable", "unauthorized", "quota", "policy", "rate_limited", "too_large"].includes(
        error.category,
      )
    )
      throw error;
    return await callJson(AGENT_FALLBACK_ROLE, messages, plannerCaller);
  }
}

/* ------------------------------ voice commands ----------------------------- */

export async function transcribeVoice(
  attachment: AgentAttachment,
  caller?: Partial<AiCaller>,
): Promise<string> {
  const result = await transcribeAudio(
    {
      task: caller?.task ?? "site.voice",
      organizationId: caller?.organizationId ?? null,
      userId: caller?.userId ?? null,
    },
    { dataUrl: attachment.dataUrl, mimeType: attachment.mimeType, name: attachment.name },
  );
  return result.text.trim();
}

/* ---------------------------- video chapters ------------------------------- */

export const CHAPTER_ROLE: ModelRole = "vision";

export async function summarizeChapters(
  attachment: AgentAttachment,
  caller?: Partial<AiCaller>,
): Promise<{ summary: string; chapters: AgentChapter[] }> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You index short business videos for a website editor. Reply as JSON only: " +
        '{"summary":"one sentence about the clip","chapters":[{"at":"0:12","label":"short title","detail":"what is visible or said"}]}. ' +
        "Write between 2 and 8 chapters in time order, using m:ss timestamps that exist in the clip. " +
        "Describe only what is actually visible or spoken. Never infer prices, ratings, awards, guarantees or business claims.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: `Index this clip ("${attachment.name}") into chapters.` },
        attachmentPart(attachment),
      ],
    },
  ];

  const raw = await callJson(CHAPTER_ROLE, messages, {
    ...caller,
    task: caller?.task ?? "site.video",
  });
  const summary = typeof raw["summary"] === "string" ? raw["summary"].slice(0, 400) : "";
  return { summary, chapters: readChapters(raw["chapters"]) };
}
