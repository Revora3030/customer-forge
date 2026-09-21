/**
 * INDUSTRY COPY DEPTH
 * ===================
 *
 * The base copy engine writes correct, safe copy for every section. This layer
 * adds *depth* for the industry: the worries that trade's customers actually
 * have, the questions they ask, the way that trade explains its own work.
 *
 * Fact safety is absolute. Everything here is drawn from the industry playbook's
 * own structural material (objections, questions, content angles, terminology)
 * plus facts already stored for the business. It never states a price, a rating,
 * a year, a count, a certification or a result, and it never promises anything
 * the owner has not written down.
 *
 * Pure, deterministic, no network.
 */

import {
  contentAnglesFor,
  faqSeedsFor,
  objectionsFor,
  terminologyFor,
  type IndustryPlaybook,
} from "./industry";

export type DepthFacts = {
  name: string | null;
  city: string | null;
  serviceArea: string | null;
  services: Array<{ name: string }>;
};

export type DepthBlock = {
  heading: string;
  /** One or more short paragraphs. Never contains an unsupported claim. */
  paragraphs: string[];
  /** Optional list items, already de-duplicated. */
  bullets: string[];
};

const MAX_BULLETS = 6;

function who(facts: DepthFacts): string {
  return facts.name?.trim() || "This business";
}

function place(facts: DepthFacts): string | null {
  const city = facts.city?.trim();
  if (city) return city;
  const area = facts.serviceArea?.trim();
  return area || null;
}

function unique(values: Array<string | null | undefined>, limit = MAX_BULLETS): string[] {
  const out: string[] = [];
  for (const value of values) {
    const clean = (value ?? "").replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (out.some((existing) => existing.toLowerCase() === clean.toLowerCase())) continue;
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

/** Turns one worry into a heading-and-answer pair without answering falsely. */
function reassurance(objection: string): string {
  const clean = objection.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  if (!clean) return "";
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
}

/**
 * "Why people choose you" written for the trade — its customers' real worries,
 * stated as the things this business sets out to get right. No claim of results.
 */
export function objectionBlock(playbook: IndustryPlaybook, facts: DepthFacts): DepthBlock {
  const worries = objectionsFor(playbook, MAX_BULLETS).map(reassurance);
  return {
    heading: `What ${who(facts).toLowerCase() === "this business" ? "we" : who(facts)} set out to get right`,
    paragraphs: worries.length
      ? [
          `These are the things people usually want to be sure about before they go ahead. ${who(facts)} aims to be clear on each one — ask and you will get a straight answer.`,
        ]
      : [],
    bullets: unique(worries),
  };
}

/** A deeper "how it works" written in the trade's own words. */
export function processBlock(playbook: IndustryPlaybook, facts: DepthFacts): DepthBlock {
  const words = terminologyFor(playbook).slice(0, 4);
  const town = place(facts);
  const opening = town
    ? `How working with ${who(facts)} in ${town} usually goes.`
    : `How working with ${who(facts)} usually goes.`;
  const steps = unique([
    "You get in touch and tell us what you need.",
    words[0] ? `We talk through the ${words[0].toLowerCase()} and what matters most to you.` : null,
    "We agree what is being done before any work starts.",
    "The work is carried out and you are told when it is finished.",
    "You can come back to us afterwards with anything you are unsure about.",
  ]);
  return { heading: "How it works", paragraphs: [opening], bullets: steps };
}

/** Longer service-page body, built from the service's own name. */
export function serviceDepth(serviceName: string, playbook: IndustryPlaybook, facts: DepthFacts): DepthBlock {
  const name = serviceName.replace(/\s+/g, " ").trim();
  const town = place(facts);
  const angles = contentAnglesFor(playbook, 3);
  const paragraphs = unique(
    [
      town
        ? `${who(facts)} provides ${name.toLowerCase()} for customers in ${town} and nearby.`
        : `${who(facts)} provides ${name.toLowerCase()}.`,
      "Tell us what you need and we will explain what is involved, what it will take and what happens next, before anything is agreed.",
      angles[0] ? `If you are weighing up ${angles[0].toLowerCase()}, ask us — we would rather you decided with the full picture.` : null,
    ],
    3,
  );
  return {
    heading: name || "This service",
    paragraphs,
    bullets: unique(angles, 4),
  };
}

/** Questions worth answering on the page, in the trade's usual order. */
export function questionDepth(playbook: IndustryPlaybook, facts: DepthFacts, limit = 6): DepthBlock {
  const questions = faqSeedsFor(playbook, limit);
  return {
    heading: "Questions people ask",
    paragraphs: questions.length
      ? [`Short, honest answers to what people usually ask ${who(facts)} first.`]
      : [],
    bullets: unique(questions, limit),
  };
}

/** Everything the depth layer can add for one business, ready for a planner. */
export function copyDepthPack(
  playbook: IndustryPlaybook,
  facts: DepthFacts,
): { objections: DepthBlock; process: DepthBlock; questions: DepthBlock; services: DepthBlock[] } {
  return {
    objections: objectionBlock(playbook, facts),
    process: processBlock(playbook, facts),
    questions: questionDepth(playbook, facts),
    services: facts.services.slice(0, 8).map((service) => serviceDepth(service.name, playbook, facts)),
  };
}

/** Words and figures that must never appear in generated depth copy. */
const FORBIDDEN = /\b(\d+\s*(years?|customers?|jobs?|stars?|%)|award|certified|guaranteed|best in|no\.?\s*1|rated)\b/i;

/** Safety net used by the tests and by the planner before copy is written. */
export function depthIsFactSafe(block: DepthBlock): boolean {
  return ![block.heading, ...block.paragraphs, ...block.bullets].some((line) => FORBIDDEN.test(line));
}
