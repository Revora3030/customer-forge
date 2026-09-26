/**
 * REVIEW PANEL — the wider AI team critiques Sol's work in parallel.
 *
 * Reviewers never write the site. Each returns short critique notes for its
 * own area; Sol decides what to change. A reviewer that fails is skipped, so
 * the panel can never block or degrade a build.
 */
import { callBestThinker, callHallOfFame } from "@/lib/ai/hall-of-fame.server";
import type { CollectivePurpose } from "@/lib/ai/collective";

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
  | "deep_conversion";

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
];

const LIGHT_AREAS: ReviewArea[] = ["truthfulness", "seo", "accessibility", "mobile", "completeness", "funnel", "consistency"];

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
 * Areas where an independent free model gives a genuinely different opinion.
 * Truthfulness stays with Terra (paid-first) because it guards against
 * invented facts; the other areas go to the Hall-of-Fame free squad so the
 * panel draws on several providers instead of one model repeated six times.
 * Completeness is here too: spotting a thin page or a dead-end link is
 * checkable work, so it is an extra pair of eyes at no extra spend, and the
 * paid senior reviewer still judges the result.
 * If the free squad cannot answer, that reviewer falls back to Terra/Sol.
 */
const DIVERSE_AREAS = new Set<ReviewArea>([
  "conversion",
  "seo",
  "accessibility",
  "mobile",
  "completeness",
]);

/**
 * A thinker that tries the free squad first for the given areas and falls back
 * to the paid team whenever the free squad cannot answer. `"all"` sends every
 * area to the free squad first — used for the pre-design advisory pass, which
 * is groundwork rather than creative authorship.
 */
function freeFirstThinker(areas: Set<ReviewArea> | "all"): Thinker {
  return async (request) => {
    const purpose = request.purpose;
    const area = (request as { area?: ReviewArea }).area;
    const tryFree = areas === "all" ? true : Boolean(area && areas.has(area));
    if (tryFree) {
      const started = Date.now();
      const free = await callHallOfFame({
        purpose,
        system: request.system,
        user: request.user,
        json: true,
        squadSize: 2,
        ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
        ...(request.organizationId === undefined ? {} : { organizationId: request.organizationId }),
      });
      if (free.ok) {
        const { recordTeamStep } = await import("@/lib/ai/telemetry.server");
        await recordTeamStep({
          organizationId: request.organizationId ?? null,
          stage: request.stage ?? `review.${area ?? "panel"}`,
          purpose,
          lane: "free",
          model: `${free.provider} · ${free.model}`,
          ok: true,
          latencyMs: Date.now() - started,
          reason: `independent ${area ?? "panel"} reviewer from the free squad`,
          contribution: "critique notes",
          costMicrocents: 0,
        });
        return {
          ok: true, lane: "free", tier: null, wanted: "terra", downgraded: false,
          text: free.text, model: `${free.provider} · ${free.model}`, costMicrocents: 0,
          attempts: free.attempts, handoverReason: null,
        } satisfies Awaited<ReturnType<Thinker>>;
      }
    }
    return callBestThinker(request);
  };
}

export const diverseThinker: Thinker = freeFirstThinker(DIVERSE_AREAS);

/**
 * The pre-design pass is groundwork: every adviser tries the free squad first,
 * so the paid designers spend their effort on design and writing instead of
 * research. Anything the free squad cannot answer still falls back to the paid
 * team, so no advice is lost.
 */
export const advisoryThinker: Thinker = freeFirstThinker("all");

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
  input: { organizationId: string; material: string; mode: "full" | "light"; stage?: string; industry?: string | null },
  thinker: Thinker = diverseThinker,
): Promise<{ notes: ReviewNote[]; models: string[]; costMicrocents: number; failed: ReviewArea[] }> {
  const reviewers = panelFor(input.mode);
  // The industry-fit reviewer gets live web research about what buyers in
  // this industry expect before they act. Research is evidence, never copy:
  // it is clearly marked third-party material and only shapes which gaps the
  // reviewer flags — every suggested fix must still come from supplied facts.
  let industryResearch: string | null = null;
  if (input.mode === "full" && input.industry?.trim()) {
    try {
      const { searchWeb } = await import("@/lib/integrations/research.server");
      const found = await searchWeb(
        `what customers expect from a ${input.industry.trim().slice(0, 80)} business website before contacting or booking`,
        5,
      );
      if (found.ok && found.results.length) {
        industryResearch = [
          "LIVE WEB RESEARCH (third-party material, never quote as this business's own facts):",
          ...found.results.map((r) => `- ${r.title} — ${r.snippet} (${r.url})`),
        ].join("\n");
      }
    } catch (error) {
      console.warn("industry research skipped", (error as Error).message);
    }
  }
  const settled = await Promise.allSettled(
    reviewers.map((reviewer) =>
      thinker({
        area: reviewer.area,
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
          reviewer.area === "industry_fit" && industryResearch
            ? [input.material, "", industryResearch].join("\n")
            : input.material,
      }).then((call) => ({ reviewer, call })),
    ),
  );
  const notes: ReviewNote[] = [];
  const models: string[] = [];
  const failed: ReviewArea[] = [];
  let costMicrocents = 0;
  settled.forEach((entry, index) => {
    const area = reviewers[index]!.area;
    if (entry.status !== "fulfilled" || !entry.value.call.ok) {
      failed.push(area);
      return;
    }
    const { call } = entry.value;
    costMicrocents += call.costMicrocents ?? 0;
    if (call.model) models.push(call.model);
    const note = parseNote(call.text, area, call.model ?? null);
    if (note) notes.push(note);
    else failed.push(area);
  });
  if (failed.length) console.warn("review panel: reviewers skipped", failed.join(", "));
  return { notes, models, costMicrocents, failed };
}
