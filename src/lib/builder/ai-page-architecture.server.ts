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

import { callBestThinker } from "@/lib/ai/hall-of-fame.server";
import type { PageArchitecture } from "@/lib/builder/creative-authority";
import {
  normalizePageArchitecture,
  parsePageArchitecture,
  type ArchitectureRejection,
} from "@/lib/builder/ai-page-architecture";
import { parseReview } from "@/lib/builder/collective-copy";
import { creativeQualityPrompt } from "@/lib/builder/creative-quality-matrix";

export type PageArchitectureOutcome = {
  architecture: PageArchitecture[] | null;
  /** Plain-language reason the AI plan was not used, when it was not. */
  skipped: string | null;
  rejected: ArchitectureRejection[];
  models: string[];
  costMicrocents: number;
};

const RULES = [
  "You design real websites for real businesses.",
  "Never invent facts, services, prices, reviews, awards or results.",
  "Working features (quote forms, booking, contact, embeds) exist only where listed.",
].join(" ");

export async function proposePageArchitecture(input: {
  organizationId: string;
  businessName: string;
  industry: string | null;
  conversionGoal: string;
  candidate: PageArchitecture[];
  /** Real supplied facts so the plan can cover the whole business. */
  description?: string | null;
  services?: string[];
  serviceArea?: string | null;
  signal?: AbortSignal;
  /** Reviewer notes from a refused plan; Sol gets one revision with them. */
  revisionNotes?: string;
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
    conversionGoal: input.conversionGoal,
    description: input.description?.trim().slice(0, 1200) || null,
    services: input.services?.filter((service) => service.trim()).slice(0, 30) ?? [],
    serviceArea: input.serviceArea?.trim() || null,
  };

  const system = `${RULES} You are Sol, the lead information and conversion architect. Decide the page set, the sections on each page and their order so the whole site converts for this specific business. Every page structure is your decision; nothing about its shape is prescribed. ${creativeQualityPrompt()}`;
  const prompt = [
      "SUPPLIED BUSINESS FACTS:",
      JSON.stringify(businessFacts, null, 2),
      "",
      "EXISTING PAGES AND SECTIONS (reorder, omit, or add your own):",
      JSON.stringify(available, null, 2),
      "",
       'Return JSON: {"pages": [{"slug": "home", "title": "...", "purpose": "...", "primaryAction": "...", "sections": [{"role": "...", "heading": "...", "subheading": "...", "body": "...", "layout": "your composition name", "intent": "why it exists", "media": "none|optional|required", "includes": ["primary_action", "service_cards"]}]}]}',
      "includes is optional: add \"primary_action\" to put the business's main action button in that section, and \"service_cards\" to list the real services as cards there. Nothing is added to a section you do not ask for.",
      "Keep the home page. Omit anything that weakens the site. Order sections deliberately.",
      "There is no required page anatomy: you decide how each page opens, flows and closes. Only place working features (quote, booking, contact) where they genuinely help.",
      "You may invent any justified content sections and pages within the supplied facts. Give every section its own layout, intent and media requirement. Give each new section a plain role name, heading, and body of up to 1200 characters.",
      "Invented words may only restate the business's supplied facts, services and place — never new claims, numbers, reviews or guarantees. You cannot invent forms, booking, contact, embeds, heroes or galleries.",
      "Write your own heading (<=120 chars) and optional subheading (<=260 chars) for every section except each page's hero. There are no default headings: a section you leave without one shows none.",
      "Headings may only use the business name, its real services and its real place — never an unsupported claim.",
      input.revisionNotes ? `REVIEWER REFUSED YOUR LAST PLAN — address this: ${input.revisionNotes.slice(0, 1500)}` : null,
      "COMPLETENESS: plan a whole website, not a stub. A visitor must be able to understand what the business does, see each real service explained, understand how working together goes, and act — using only the facts above. A plan that is just an opening and a form is incomplete and will be refused. The shape, count and order of pages and sections are still entirely yours.",
    ].filter((line) => line !== null).join("\n");
  let sol = await callBestThinker({
    json: true,
    purpose: "information_architecture",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 5000,
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
      maxOutputTokens: 5000,
      ...(input.signal ? { signal: input.signal } : {}),
      system,
      user: `${prompt}\n\nREPAIR: Your previous page plan was not valid JSON in the required shape. Return one complete JSON object only, with a non-empty pages array and a home page.`,
    });
  }

  if (!sol.ok)
    return {
      architecture: null,
      skipped: sol.detail ?? sol.reason,
      rejected: [],
      models: [],
      costMicrocents: 0,
    };

  const proposal = parsePageArchitecture(sol.text);
  if (!proposal)
    return {
      architecture: null,
      skipped: "the page plan was not in the agreed shape",
      rejected: [],
      models: sol.model ? [sol.model] : [],
      costMicrocents: sol.costMicrocents,
    };

  const normalized = normalizePageArchitecture({ proposal, candidate: input.candidate });
  if (!normalized)
    return {
      architecture: null,
      skipped: "the proposed page plan could not be filled with real content",
      rejected: [],
      models: sol.model ? [sol.model] : [],
      costMicrocents: sol.costMicrocents,
    };

  const terra = await callBestThinker({
    json: true,
    purpose: "plan_review",
    complexity: "medium",
    organizationId: input.organizationId,
    maxOutputTokens: 700,
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
      "Approve only if the proposed structure gives a first-time visitor enough factual coverage to understand what this business does, which supplied services matter, where it serves, and how to take a real available action. Refuse unsupported claims, omitted critical supplied facts, fake capabilities, or stub-like plans. Do not require any specific number of pages, sections, visual beats, or a house layout.",
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
      rejected: normalized.rejected,
      models,
      costMicrocents: cost,
    };

  const review = parseReview(terra.text);
  const approved = review?.approvedFields.some((field) => /structure|pages?/i.test(field)) ?? false;
  if (!approved && review !== null && !input.revisionNotes) {
    const notes = JSON.stringify(review.notes ?? []).slice(0, 1500) || "the structure was too thin";
    const revised = await proposePageArchitecture({ ...input, revisionNotes: notes });
    return {
      ...revised,
      models: [...models, ...revised.models],
      costMicrocents: cost + revised.costMicrocents,
    };
  }
  if (!approved)
    return {
      architecture: null,
      skipped: review === null
        ? "the structure review was not in the agreed shape"
        : "the reviewer refused the proposed structure",
      rejected: [...normalized.rejected, ...(review?.notes ?? [])],
      models,
      costMicrocents: cost,
    };

  return {
    architecture: normalized.architecture,
    skipped: null,
    rejected: normalized.rejected,
    models,
    costMicrocents: cost,
  };
}
