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
  signal?: AbortSignal;
}): Promise<PageArchitectureOutcome> {
  const available = input.candidate.map((page) => ({
    slug: page.slug,
    title: page.title,
    purpose: page.purpose,
    availableSections: page.sections.map((section) => section.role),
  }));

  const sol = await callBestThinker({
    json: true,
    purpose: "information_architecture",
    complexity: "high",
    organizationId: input.organizationId,
    maxOutputTokens: 5000,
    ...(input.signal ? { signal: input.signal } : {}),
    system: `${RULES} You are Sol, the lead information and conversion architect. Decide the page set, the sections on each page and their order so the whole site converts for this specific business. Give each page a deliberate opening, useful body and real conversion path without forcing every page into the same anatomy. ${creativeQualityPrompt()}`,
    user: [
      `BUSINESS: ${input.businessName}`,
      `INDUSTRY: ${input.industry ?? "not supplied"}`,
      `CONVERSION GOAL: ${input.conversionGoal}`,
      "",
      "EXISTING PAGES AND SECTIONS (reorder, omit, or add your own):",
      JSON.stringify(available, null, 2),
      "",
       'Return JSON: {"pages": [{"slug": "home", "title": "...", "purpose": "...", "primaryAction": "...", "sections": [{"role": "...", "heading": "...", "subheading": "...", "body": "...", "layout": "your composition name", "intent": "why it exists", "media": "none|optional|required"}]}]}',
      "Keep the home page. Omit anything that weakens the site. Order sections deliberately.",
      "You may invent any justified content sections and pages within the supplied facts. Give every section its own layout, intent and media requirement. Give each new section a plain role name, heading, and body of up to 1200 characters.",
      "Invented words may only restate the business's supplied facts, services and place — never new claims, numbers, reviews or guarantees. You cannot invent forms, booking, contact, embeds, heroes or galleries.",
      "Write your own heading (<=120 chars) and optional subheading (<=260 chars) for every section except each page's hero. There are no default headings: a section you leave without one shows none.",
      "Headings may only use the business name, its real services and its real place — never an unsupported claim.",
    ].join("\n"),
  });

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
    system: `${RULES} You are Terra, the adversarial reviewer of website structure. Approve only when every retained page has a deliberate opening, useful body and real conversion path; the pages must share one identity without repeating one generic anatomy. ${creativeQualityPrompt()}`,
    user: [
      `BUSINESS: ${input.businessName}`,
      `CONVERSION GOAL: ${input.conversionGoal}`,
      "",
      "AVAILABLE MATERIAL:",
      JSON.stringify(available, null, 2),
      "",
      "PROPOSED STRUCTURE:",
      JSON.stringify(normalized.architecture, null, 2),
      "",
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
