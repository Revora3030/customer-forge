/**
 * Sol authors the page architecture; Terra reviews it.
 *
 * Two passes through the same credential gate, monthly cap and usage ledger as
 * every other paid call. Sol decides which pages the business needs, which
 * sections belong on each, and in what order. Terra independently accepts or
 * refuses the plan. Everything Sol returns is normalized against material that
 * actually exists before it can shape a website.
 *
 * When no model can author and review a safe result, this returns `null` and the
 * caller stops. The material inventory is never promoted into a design.
 */

import { callBestThinker } from "@/lib/ai/thinker.server";
import type { PageArchitecture } from "@/lib/builder/creative-authority";
import {
  normalizePageArchitecture,
  architectureShortfall,
  parsePageArchitecture,
  type ArchitectureRejection,
} from "@/lib/builder/ai-page-architecture";
import { parseReview, substantiveRejections } from "@/lib/builder/collective-copy";
import { creativeQualityPrompt } from "@/lib/builder/creative-quality-matrix";
import { craftBarPrompt } from "@/lib/builder/world-class-craft";
import { businessNameHeadlines, stripBusinessNameHeadlines } from "@/lib/builder/headline-names";
import { auditSiteDepth, depthNumbers, depthRepairNotes } from "@/lib/builder/page-depth";

export type PageArchitectureOutcome = {
  architecture: PageArchitecture[] | null;
  /** Plain-language reason the AI plan was not used, when it was not. */
  skipped: string | null;
  /** The AI team ran out of capacity or returned unusable output (not a reviewer refusal on merits): the job waits and retries. */
  capacity?: boolean;
  rejected: ArchitectureRejection[];
  models: string[];
  costMicrocents: number;
};

const RULES = [
  "You design real websites for real businesses.",
  "Never invent facts, services, prices, reviews, awards or results.",
  "Working features (quote forms, booking, contact, embeds) exist only where listed.",
].join(" ");

/** True when the facts cannot honestly support a deep multi-page site. */
export function isThinFactSheet(facts: { services: string[]; description: string | null }): boolean {
  return facts.services.length === 0 && (facts.description ?? "").length < 400;
}

export async function proposePageArchitecture(input: {
  organizationId: string;
  businessName: string;
  industry: string | null;
  conversionGoal: string | null;
  candidate: PageArchitecture[];
  /** Real supplied facts so the plan can cover the whole business. */
  description?: string | null;
  services?: string[];
  serviceArea?: string | null;
  /** Whether a real phone/email exists, so the reviewer knows contact works. */
  contact?: { phone: boolean; email: boolean };
  signal?: AbortSignal;
  /** Reviewer notes from a refused plan; Sol gets one revision with them. */
  revisionNotes?: string;
  /** How many refused plans Sol has already revised (max three). */
  revisionRound?: number;
}): Promise<PageArchitectureOutcome> {
  const available = input.candidate.map((page) => ({
    slug: page.slug,
    title: page.title,
    purpose: page.purpose,
    availableSections: page.sections.map((section) => section.role),
  }));
  const businessFacts = {
    business: input.businessName,
    industry: input.industry ?? null,
    conversionGoal: input.conversionGoal?.trim() || null,
    description: input.description?.trim().slice(0, 1200) || null,
    services: input.services?.filter((service) => service.trim()).slice(0, 30) ?? [],
    serviceArea: input.serviceArea?.trim() || null,
    realContact: input.contact ?? null,
  };

  // A Jarvis demo often knows only the name, trade and town. Demanding a deep
  // multi-page site from that forces padding the truth reviewer must refuse,
  // so depth scales to the real facts instead. No page shape is imposed.
  const thinFacts = isThinFactSheet(businessFacts);
  const system = `${RULES} You are Sol, the lead information and conversion architect. Decide the page set, the sections on each page and their order so the whole site converts for this specific business. Every page structure is your decision; nothing about its shape is prescribed. ${creativeQualityPrompt()} ${craftBarPrompt("page_architecture")}`;
  const prompt = [
      "SUPPLIED BUSINESS FACTS:",
      JSON.stringify(businessFacts, null, 2),
      "",
      "EXISTING PAGES AND SECTIONS (reorder, omit, or add your own):",
      JSON.stringify(available, null, 2),
      "",
       'Return JSON: {"pages": [{"slug": "home", "title": "...", "purpose": "...", "primaryAction": "...", "seoTitle": "...", "seoDescription": "...", "sections": [{"role": "...", "heading": "...", "subheading": "...", "body": "...", "layout": "your composition name", "intent": "why it exists", "media": "none|optional|required", "includes": ["primary_action", "service_cards", "faqs", "benefits"]}]}]}',
      "includes is optional: add \"primary_action\" to put the business's main action button in that section, \"service_cards\" to list the real services as cards there, \"faqs\" to attach the site's already-written, fact-checked question-and-answer pairs (for a questions section), and \"benefits\" to attach the site's already-written, fact-checked benefit list. Nothing is added to a section you do not ask for.",
      "SEARCH WORDING PER PAGE: give every page its own seoTitle (at most 60 characters) and seoDescription (120-155 characters) written for THAT page's purpose, from the supplied facts only. Never reuse one page's description on another page, and never copy the home page's description onto a sub-page.",
      "A \"gallery\" section appears in the existing sections only when the owner uploaded at least three real work photos. It shows ONLY those real photos; you may move it to any page, but you can never add a gallery that is not offered.",
      "Keep the home page. Omit anything that weakens the site. Order sections deliberately.",
      "There is no required page anatomy: you decide how each page opens, flows and closes. Only place working features (quote, booking, contact) where they genuinely help.",
      "You may invent any justified content sections and pages within the supplied facts. Give every section its own layout, intent and media requirement. Give each new section a plain role name, heading, and body of up to 1200 characters.",
      "Invented words may only restate the business's supplied facts, services and place — never new claims, numbers, reviews or guarantees. You cannot invent forms, booking, contact, embeds, heroes or galleries.",
      "Write your own heading (<=120 chars) and optional subheading (<=260 chars) for every section except each page's hero. There are no default headings: a section you leave without one shows none.",
      "Headings may only use the business's real services and its real place — never an unsupported claim. Do NOT put the business name in section headings (no \"<Business> Process\", \"<Business> Services\"): the name already sits in the logo and page title. Only the home page's opening heading may name the business.",
      thinFacts
        ? "SPARSE FACTS: only the name, trade and place were supplied (no service list, no photos). The site must still be COMPLETE, like a finished site from a top builder, never a stub. Plan three pages: \"home\" (4 to 6 sections), \"about\" (2 to 3 sections) and the contact page. Home flows: an opening naming the trade and place; a plain explanation of what this kind of work generally involves and why it matters to a customer (general trade knowledge, written about the trade, never claiming the business does a specific job); how getting started works using only the real contact routes listed above (reach out, say what you need, get a reply); the area it serves; a closing contact action. Every business-specific statement must restate a supplied fact. FORBIDDEN, because it would be invented: prices, years in business, reviews, ratings, awards, licences, insurance, guarantees, named staff, response times, specific services presented as offered, before/after claims. Mark picture slots media \"optional\" so illustrative pictures can fill them. Do not add an FAQ or social proof section unless a real source exists."
        : null,
      input.revisionNotes ? `REVIEWER REFUSED YOUR LAST PLAN — address this: ${input.revisionNotes.slice(0, 1500)}` : null,
      thinFacts ? null : "COMPLETENESS: plan a whole website, not a stub. A visitor must be able to understand what the business does, see each real service explained, understand how working together goes, and act — using only the facts above. A plan that is just an opening and a form is incomplete and will be refused. The shape, count and order of pages and sections are still entirely yours.",
      thinFacts ? null : "FIRST BUILD IS COMPLETE: this is the customer's first build and it must ship every page they need — nothing is added later. Always include: a home page, a services page that covers EVERY supplied service (with service_cards), an about page, and a contact page (or book page when booking exists). When there are 3 or more services, also give each major service its own page (slug like \"service-name\") explaining that service. Give every page at least one section with media \"required\" so every page has a real picture.",
      thinFacts ? null : "MULTI-PAGE DEPTH: a real commercial site is more than a single page. Plan at least three dedicated pages — a home page, a services page (or pages, one per major offering when the catalogue justifies it), and an about/story page — plus a contact or booking page. Every page must carry its own purpose and earn its place; never repeat the same card grid across pages.",
      thinFacts ? null : "BESPOKE LAYOUTS: give each section its own composition rather than reusing one layout. Vary asymmetric two-column blocks, sticky side-by-side process steps, interactive bento grids, full-bleed media and centered single-column narratives so the site reads as designed, not templated. A layout name is your own composition name, not a preset.",
      "FACT FIDELITY: every word must come from the supplied business facts, services and place. Never invent reviews, awards, stats, certifications, team credentials, prices, guarantees or results. An about page, if any, tells the real commercial backstory and values only — never fabricated milestones.",
      "10/10 QUALITY BAR: aim for the quality of the best AI website builders (Lovable, Framer, Vercel). Every page should feel bespoke and premium — strong visual hierarchy, confident typography, purposeful motion, and a clear conversion path. The site should look like it was designed by a top agency, not generated.",
      "MOBILE-FIRST: every section must work perfectly on a phone. Thumb-reachable CTAs, no horizontal scroll, text that's readable without zooming. Mobile is not a downscaled desktop — it's a designed layout.",
      thinFacts ? null : "CONVERSION ARCHITECTURE: every page has one primary action and one secondary. Trust signals (real facts only) are placed where hesitation occurs. The contact path is never more than one tap away.",
    ].filter((line) => line !== null).join("\n");
  let sol = await callBestThinker({
    json: true,
    purpose: "information_architecture",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 8000,
    ...(input.signal ? { signal: input.signal } : {}),
    system,
    user: prompt,
  });

  // Treat malformed model output as a repairable response. The repair remains
  // AI-authored; candidate inventory is never promoted into a fallback design.
  if (sol.ok && !parsePageArchitecture(sol.text)) {
    sol = await callBestThinker({
      json: true,
      purpose: "information_architecture",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 8000,
      ...(input.signal ? { signal: input.signal } : {}),
      system,
      user: `${prompt}\n\nREPAIR: Your previous page plan was not valid JSON in the required shape. Return one complete JSON object only, with a non-empty pages array and a home page.`,
    });
  }

  if (!sol.ok)
    return {
      architecture: null,
      skipped: sol.detail ?? sol.reason,
      capacity: true,
      rejected: [],
      models: [],
      costMicrocents: 0,
    };

  const proposal = parsePageArchitecture(sol.text);
  if (!proposal)
    return {
      architecture: null,
      skipped: "the page plan was not in the agreed shape",
      capacity: true,
      rejected: [],
      models: sol.model ? [sol.model] : [],
      costMicrocents: sol.costMicrocents,
    };

  let normalized = normalizePageArchitecture({ proposal, candidate: input.candidate, thinFacts });
  if (!normalized) {
    // One AI repair with the concrete shortfall; the repair is still Sol's own
    // plan, never a rule-made substitute.
    const repair = await callBestThinker({
      json: true,
      purpose: "information_architecture",
      complexity: "high",
      organizationId: input.organizationId,
      maxOutputTokens: 8000,
      ...(input.signal ? { signal: input.signal } : {}),
      system,
      user: `${prompt}\n\nREPAIR: Your previous page plan could not be used. ${architectureShortfall({ proposal, candidate: input.candidate, thinFacts })} Return one complete JSON object only.`,
    });
    const repaired = repair.ok ? parsePageArchitecture(repair.text) : null;
    if (repaired) {
      normalized = normalizePageArchitecture({ proposal: repaired, candidate: input.candidate, thinFacts });
      if (normalized && repair.ok) sol = repair;
    }
  }
  if (!normalized)
    return {
      architecture: null,
      skipped: "the proposed page plan could not be filled with real content",
      capacity: true,
      rejected: [],
      models: sol.model ? [sol.model] : [],
      costMicrocents: sol.costMicrocents,
    };

  // Measured depth of the proposed plan: input for Terra and, when a page
  // falls short, repair notes for Sol. Nothing is added to the plan by rule.
  const depth = auditSiteDepth(normalized.architecture);
  const depthNotes = depthRepairNotes(depth);

  const terra = await callBestThinker({
    json: true,
    purpose: "plan_review",
    complexity: "medium",
    organizationId: input.organizationId,
    maxOutputTokens: 1500,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are Terra, the adversarial reviewer of website structure. Judge each page on whether it works for this business and its visitors; never demand a fixed page anatomy. Refuse a structure that is too thin to explain the business and its real services to a first-time visitor. ${creativeQualityPrompt()}`,
    user: [
      "SUPPLIED BUSINESS FACTS:",
      JSON.stringify(businessFacts, null, 2),
      "",
      "AVAILABLE MATERIAL:",
      JSON.stringify(available, null, 2),
      "",
      "PROPOSED STRUCTURE:",
      JSON.stringify(normalized.architecture, null, 2),
      "",
      "MEASURED PAGE DEPTH (visible characters, content beats beyond headings, closing action; input only, not a required anatomy):",
      JSON.stringify(depthNumbers(depth), null, 2),
      "",
      "Approve only if the proposed structure gives a first-time visitor enough factual coverage to understand what this business does, which supplied services matter, where it serves, and how to take a real available action. Refuse unsupported claims, omitted critical supplied facts, fake capabilities, or stub-like plans. Do not require any specific number of pages, sections, visual beats, or a house layout.",
      thinFacts
        ? "THE SUPPLIED FACTS ARE THIN (no service list). Judge coverage against those facts only: a complete small site (home, about, contact) is approvable when every business-specific statement restates a supplied fact and the remaining sections only explain the trade in general, neutral terms. Refuse invented prices, years, reviews, awards, licences, guarantees, staff, response times or specific services presented as offered. Do not refuse a plan only because it has several pages or sections."
        : "",
      '{"approvedFields": ["structure"], "rejected": [{"field": "...", "reason": "..."}]}',
    ].join("\n"),
  });

  const models = [sol.model, terra.ok ? terra.model : null].filter(
    (model): model is string => typeof model === "string" && model.length > 0,
  );
  const cost = sol.costMicrocents + (terra.ok ? terra.costMicrocents : 0);

  if (!terra.ok)
    return {
      architecture: null,
      skipped: `the structure was not independently reviewed: ${terra.detail ?? terra.reason}`,
      capacity: true,
      rejected: normalized.rejected,
      models,
      costMicrocents: cost,
    };

  const review = parseReview(terra.text);
  // Terra must name a real broken rule; a review whose every note clears the
  // field itself ("Not a violation") or names nothing is a pass with advice.
  const approved = review !== null && (review.approvedFields.some((field) => /structure|pages?/i.test(field)) || substantiveRejections(review.notes).length === 0);
  const namedHeadings = businessNameHeadlines(normalized.architecture, input.businessName);
  if (!approved && review !== null && (input.revisionRound ?? 0) < 3) {
    const nameNote = namedHeadings.length
      ? ` Also remove the business name from these headings: ${namedHeadings.map((h) => JSON.stringify(h.heading)).join(", ")}.`
      : "";
    const depthNote = depthNotes.length ? ` Page depth: ${depthNotes.join(" ")}` : "";
    const notes = (JSON.stringify(review.notes ?? []).slice(0, 1300) || "the structure was too thin") + nameNote.slice(0, 200) + depthNote.slice(0, 600);
    const revised = await proposePageArchitecture({ ...input, revisionNotes: notes, revisionRound: (input.revisionRound ?? 0) + 1 });
    return {
      ...revised,
      models: [...models, ...revised.models],
      costMicrocents: cost + revised.costMicrocents,
    };
  }
  if (!approved)
    return {
      architecture: null,
      // An unreadable review is a model output failure, not a verdict: wait
      // and retry through the capacity deferral instead of burning an attempt.
      ...(review === null ? { capacity: true } : {}),
      skipped: review === null
        ? "the structure review was not in the agreed shape"
        : `the reviewer refused the proposed structure: ${JSON.stringify(review?.notes ?? []).slice(0, 400)}`,
      rejected: [...normalized.rejected, ...(review?.notes ?? [])],
      models,
      costMicrocents: cost,
    };

  // An approved plan whose pages are measurably thin goes back to Sol once with
  // the exact shortfalls. If that revision cannot be authored and approved,
  // the approved plan stands and the section-wording pass fills empty bodies.
  if (depthNotes.length && !input.revisionNotes) {
    const revised = await proposePageArchitecture({
      ...input,
      revisionNotes: `PAGE DEPTH SHORTFALLS: ${depthNotes.join(" ")}`,
      revisionRound: 3,
    });
    if (revised.architecture?.length)
      return {
        ...revised,
        models: [...models, ...revised.models],
        costMicrocents: cost + revised.costMicrocents,
      };
    return {
      architecture: stripBusinessNameHeadlines(normalized.architecture, input.businessName),
      skipped: null,
      rejected: normalized.rejected,
      models: [...models, ...revised.models],
      costMicrocents: cost + revised.costMicrocents,
    };
  }

  return {
    architecture: stripBusinessNameHeadlines(normalized.architecture, input.businessName),
    skipped: null,
    rejected: normalized.rejected,
    models,
    costMicrocents: cost,
  };
}
