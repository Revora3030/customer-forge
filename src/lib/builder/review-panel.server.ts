/**
 * REVIEW PANEL — the wider AI team critiques Sol's work in parallel.
 *
 * Reviewers never write the site. Each returns short critique notes for its
 * own area; Sol decides what to change. A reviewer that fails is skipped, so
 * the panel can never block or degrade a build.
 */
import { callBestThinker } from "@/lib/ai/thinker.server";
import type { CollectivePurpose } from "@/lib/ai/collective";
import { NO_EVIDENCE, evidenceFor, gatherReviewEvidence, type ReviewEvidence } from "@/lib/builder/review-evidence.server";
import { DISTINCTIVENESS_REVIEW_BRIEF, VISUAL_CRAFT_REVIEW_BRIEF } from "@/lib/builder/world-class-craft";

export type ReviewArea =
  | "conversion"
  | "truthfulness"
  | "seo"
  | "accessibility"
  | "mobile"
  | "senior"
  | "completeness"
  | "funnel"
  | "consistency"
  | "industry_fit"
  | "whole_site"
  | "markup"
  | "deep_conversion"
  | "visual_craft"
  | "distinctiveness";

export type ReviewNote = { area: ReviewArea; issues: string[]; severity: "low" | "medium" | "high"; model: string | null };

export type Thinker = typeof callBestThinker;

type Reviewer = { area: ReviewArea; purpose: CollectivePurpose; complexity: "high" | "medium" | "low"; brief: string };

const FULL_PANEL: Reviewer[] = [
  { area: "conversion", purpose: "conversion_architecture", complexity: "high", brief: "Critique the conversion flow: clarity of offer, call-to-action placement, friction, trust signals built only from supplied facts." },
  { area: "truthfulness", purpose: "adversarial_review", complexity: "medium", brief: "Flag any wording that states facts, prices, reviews, awards or results not present in the supplied material." },
  { area: "seo", purpose: "seo_analysis", complexity: "medium", brief: "Critique heading structure, keyword clarity, internal links and alt text." },
  { area: "accessibility", purpose: "specialist_review", complexity: "low", brief: "Flag contrast risks, missing alt text, tiny text, unclear link labels and reading order problems." },
  { area: "mobile", purpose: "specialist_review", complexity: "low", brief: "Flag layouts that will break or crowd on a 320–390px phone: multi-column rows, oversized text, overflow." },
  { area: "senior", purpose: "final_review", complexity: "high", brief: "As an independent senior professional reviewer, challenge the lead designer's work: judge whether it is finished, coherent and genuinely serves this business's visitors. Judge whether it works — never ask it to match a template or house style." },
  { area: "completeness", purpose: "completeness_check", complexity: "low", brief: "Flag unfinished or thin pages, empty sections, missing page metadata or structured-data gaps, and broken or dead-end links." },
  { area: "funnel", purpose: "funnel_verification", complexity: "medium", brief: "Trace every way a visitor can become a lead: contact forms, quote requests, booking links, phone and email actions. Flag any call-to-action with no working destination, any form missing a field the business needs to follow up, any duplicated or contradictory contact path, and any page that offers a service with no way to act on it. Use only supplied contact details — never invent one." },
  { area: "consistency", purpose: "site_consistency_audit", complexity: "medium", brief: "Audit the site as a whole: flag navigation that omits or misnames a real page, header/footer differences between pages, contact details or business names that differ page to page, repeated near-identical wording across pages, orphaned pages nothing links to, and links pointing at pages that do not exist." },
  { area: "industry_fit", purpose: "industry_gap_analysis", complexity: "medium", brief: "Judge this site against what visitors in this specific industry actually need before they act. Flag missing information a buyer would expect (service areas, process, what is included, how to prepare, what happens next) and name only gaps answerable from supplied facts — never propose claims, guarantees, credentials or numbers the business did not supply." },
  { area: "whole_site", purpose: "whole_site_review", complexity: "high", brief: "Read every page together as one site. Judge whether the story, offer and next step stay coherent from the first page to the last, and flag pages that contradict, repeat or undercut each other. Critique only — the lead designer decides every change." },
  { area: "markup", purpose: "markup_review", complexity: "medium", brief: "Review the generated page structure as an engineer: flag broken or duplicated heading order, missing labels on form fields, invalid or empty links, images without meaningful alt text, and structure that will render badly or slowly. Report defects only; never restyle." },
  { area: "deep_conversion", purpose: "deep_conversion_audit", complexity: "high", brief: "Walk the whole journey a real buyer takes, step by step, from arrival to contacting the business. Flag each point where they could hesitate, get lost or leave, and why. Base every point on supplied facts only — never suggest invented offers, prices, guarantees or proof." },
  // Independent craft critics: the reviewer is never the model that authored
  // the layout (visual_review and design_alternative route to Terra's tier).
  { area: "visual_craft", purpose: "visual_review", complexity: "high", brief: VISUAL_CRAFT_REVIEW_BRIEF },
  { area: "distinctiveness", purpose: "design_alternative", complexity: "medium", brief: DISTINCTIVENESS_REVIEW_BRIEF },
];

const LIGHT_AREAS: ReviewArea[] = ["truthfulness", "seo", "accessibility", "mobile", "completeness", "funnel", "consistency", "visual_craft"];

/**
 * Best Lovable model per review area (owner decision 2026-10-22), so each
 * reviewer gives an independent opinion instead of one model repeated. The
 * router still fails over to the rest of the paid team, then the free squad.
 */
export const REVIEW_AREA_MODELS: Partial<Record<ReviewArea, string[]>> = {
  truthfulness: ["anthropic/claude-sonnet-5"],
  seo: ["google/gemini-4-argon"],
  conversion: ["openai/gpt-6-sol"],
  deep_conversion: ["openai/gpt-6-sol"],
  accessibility: ["anthropic/claude-haiku-4-5"],
  mobile: ["google/gemini-3.8-flash"],
  completeness: ["openai/gpt-6-astra"],
  senior: ["anthropic/claude-opus-5-5"],
  whole_site: ["anthropic/claude-fable-5-1"],
  markup: ["anthropic/claude-opus-5"],
  funnel: ["google/gemini-3.1-pro-preview"],
  consistency: ["openai/gpt-5.5"],
  industry_fit: ["google/gemini-4-argon"],
  visual_craft: ["google/gemini-3.8-flash"],
  distinctiveness: ["anthropic/claude-opus-5-5"],
};

export function panelFor(mode: "full" | "light"): Reviewer[] {
  return mode === "full" ? FULL_PANEL : FULL_PANEL.filter((r) => LIGHT_AREAS.includes(r.area));
}

export function parseNote(text: string, area: ReviewArea, model: string | null): ReviewNote | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { issues?: unknown; severity?: unknown };
    const issues = Array.isArray(raw.issues)
      ? raw.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0).map((i) => i.trim().slice(0, 300)).slice(0, 8)
      : [];
    const severity = raw.severity === "high" || raw.severity === "medium" ? raw.severity : "low";
    return { area, issues, severity, model };
  } catch {
    return null;
  }
}


/**
 * Reviewers and advisers run on the paid Lovable team first (owner decision
 * 2026-10-22: site building uses the top models); `callBestThinker` hands the
 * step to the free Hall-of-Fame squad only when paid capacity is unavailable.
 */
export const diverseThinker: Thinker = (request) => callBestThinker(request);

/** The pre-design advisory pass follows the same paid-first rule. */
export const advisoryThinker: Thinker = (request) => callBestThinker(request);

/**
 * Advisers speak BEFORE Sol designs: they read only the supplied material and
 * hand Sol evidence-backed notes. They never write the site.
 */
export async function runAdvisoryPanel(
  input: { organizationId: string; material: string },
  thinker: Thinker = advisoryThinker,
) {
  return runReviewPanel(
    {
      organizationId: input.organizationId,
      mode: "full",
      stage: "advise",
      material: ["NO DESIGN EXISTS YET. Advise the lead designer on what this site must get right, using only this material:", input.material].join("\n"),
    },
    thinker,
  );
}


export async function runReviewPanel(
  input: {
    organizationId: string;
    material: string;
    mode: "full" | "light";
    stage?: string;
    industry?: string | null;
    /** Pre-gathered outside evidence; gathered here for full panels when absent. */
    evidence?: ReviewEvidence;
  },
  thinker: Thinker = diverseThinker,
): Promise<{ notes: ReviewNote[]; models: string[]; costMicrocents: number; failed: ReviewArea[] }> {
  const reviewers = panelFor(input.mode);
  // Outside evidence (live research, real search queries, public listing) is
  // labelled third-party material: it shapes which gaps reviewers flag, and
  // every suggested fix must still come from supplied facts.
  const evidence: ReviewEvidence =
    input.evidence ??
    (input.mode === "full" && input.industry?.trim()
      ? await gatherReviewEvidence({ industry: input.industry }).catch(() => NO_EVIDENCE)
      : NO_EVIDENCE);
  const ask = (reviewer: Reviewer, avoid: string[] = []) =>
      thinker({
        area: reviewer.area,
        ...(REVIEW_AREA_MODELS[reviewer.area] ? { preferModels: REVIEW_AREA_MODELS[reviewer.area] } : {}),
        ...(avoid.length ? { avoidModels: avoid } : {}),
        stage: `${input.stage ?? "review"}.${reviewer.area}`,
        json: true,
        purpose: reviewer.purpose,
        complexity: reviewer.complexity,
        organizationId: input.organizationId,
        maxOutputTokens: 1200,
        system: [
          `You are the ${reviewer.area} reviewer on a world-class web studio's review panel.`,
          reviewer.brief,
          "You do not rewrite anything. Give at most 6 short, specific, actionable notes referencing section ids.",
          'Respond with JSON only: {"issues": ["..."], "severity": "low"|"medium"|"high"}. Use an empty list when there is nothing worth changing.',
        ].join(" "),
        user:
          [input.material, ...evidenceFor(reviewer.area, evidence)].join("\n\n"),
      }).then((call) => ({ reviewer, call }));
  const settled = await Promise.allSettled(reviewers.map((reviewer) => ask(reviewer)));
  const notes: ReviewNote[] = [];
  const models: string[] = [];
  const failed: ReviewArea[] = [];
  let costMicrocents = 0;
  // A usable verdict: the call answered AND the answer parses as a note. An
  // answer that came back as prose is a dropped reviewer too, not silence.
  const verdict = (entry: (typeof settled)[number], area: ReviewArea): ReviewNote | null => {
    if (entry.status !== "fulfilled" || !entry.value.call.ok) return null;
    const { call } = entry.value;
    return parseNote(call.text, area, call.model ?? null);
  };
  const charge = (entry: (typeof settled)[number]) => {
    if (entry.status !== "fulfilled" || !entry.value.call.ok) return;
    costMicrocents += entry.value.call.costMicrocents ?? 0;
    if (entry.value.call.model) models.push(entry.value.call.model);
  };
  // One retry per dropped reviewer, steering away from its first-choice model;
  // a reviewer still failing is reported in `failed`, never fails the panel.
  // No retry when the day's or month's paid budget is spent (or the ledger is
  // down): the second ask would be refused the same way.
  const noRetry = new Set(["budget_exhausted", "credits_exhausted", "ledger_unavailable", "free_only", "no_tier_available"]);
  await Promise.all(
    settled.map(async (entry, index) => {
      const reviewer = reviewers[index]!;
      if (verdict(entry, reviewer.area)) return;
      if (entry.status === "fulfilled" && !entry.value.call.ok && noRetry.has(String(entry.value.call.reason))) return;
      // A first answer that could not be parsed was still paid for.
      charge(entry);
      const retry = await Promise.allSettled([ask(reviewer, REVIEW_AREA_MODELS[reviewer.area] ?? [])]);
      settled[index] = retry[0]!;
    }),
  );
  settled.forEach((entry, index) => {
    const area = reviewers[index]!.area;
    charge(entry);
    const note = verdict(entry, area);
    if (note) notes.push(note);
    else failed.push(area);
  });
  if (failed.length) console.warn("review panel: reviewers skipped", failed.join(", "));
  return { notes, models, costMicrocents, failed };
}
