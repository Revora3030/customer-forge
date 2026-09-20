/**
 * REVORA INTENT RESOLUTION
 * ========================
 *
 * When a request is too vague for the deterministic planner to place ("make it
 * better", "sort this out", "it looks off"), Revora should not answer with a
 * question if the website itself already shows what needs doing. This module
 * inspects the real site map and business facts and returns the single most
 * valuable concrete instruction, plus a plain-English reason for the choice.
 *
 * It never invents business facts, never calls a model and never mutates
 * anything: it only rewrites a vague request into a specific one that the
 * existing deterministic planner already knows how to execute.
 */

import type { AgentContext } from "@/lib/site-agent.server";

export type ResolvedIntent = {
  /** Concrete instruction to re-plan with. */
  instruction: string;
  /** Honest, plain-English explanation of the assumption Revora made. */
  because: string;
};

const LEAD_SECTIONS = new Set(["contact", "quote", "lead_form", "booking", "cta"]);

const isBlank = (value: string | null | undefined) => !value || !value.trim();

/**
 * Highest-value gap first: a page with nothing on it, then missing ways to get
 * in touch, then missing search text, then presentation.
 */
export function resolveVagueIntent(context: AgentContext): ResolvedIntent | null {
  const pages = context.pages.filter((page) => page.is_visible);
  if (!pages.length) return null;

  const empty = pages.find((page) => page.sections.filter((s) => s.is_visible).length === 0);
  if (empty)
    return {
      instruction: `Fill the ${empty.title} page with real sections, clear wording and a button that asks for the next step, matching the rest of my website.`,
      because: `your ${empty.title} page is empty, so that was the biggest gap`,
    };

  const thin = pages.find((page) =>
    page.sections.some(
      (section) =>
        section.is_visible &&
        isBlank(section.heading) &&
        isBlank(section.subheading) &&
        isBlank(section.body) &&
        section.components.length === 0,
    ),
  );
  if (thin)
    return {
      instruction: `Write real headings and wording for the empty sections on the ${thin.title} page, and give each one a clear next step.`,
      because: `some sections on your ${thin.title} page had no wording yet`,
    };

  const hasLeadPath = pages.some((page) =>
    page.sections.some(
      (section) =>
        section.is_visible &&
        (LEAD_SECTIONS.has(section.kind) ||
          section.components.some((component) => component.kind === "button" && component.link_url)),
    ),
  );
  if (!hasLeadPath)
    return {
      instruction:
        "Make it easy for customers to get in touch: add a clear call and quote button high on every page and a short enquiry section on the home page.",
      because: "there was no obvious way for a customer to contact you",
    };

  const missingSeo = pages.filter(
    (page) => !page.noindex && (isBlank(page.seo_title) || isBlank(page.seo_description)),
  );
  if (missingSeo.length)
    return {
      instruction:
        "Write a clear page title and description for every page so my website reads well in Google search results.",
      because: `${missingSeo.length} page${missingSeo.length === 1 ? "" : "s"} had no Google search wording`,
    };

  const home = pages[0]!;
  return {
    instruction:
      "Improve my whole website: sharper wording on the first screen, tidier layout, consistent spacing and a clear next step on every page. Keep all of my real business details exactly as they are.",
    because: `nothing was broken, so Revora improved the wording and layout starting with ${home.title}`,
  };
}
