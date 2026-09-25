/**
 * REVIEW PANEL — the wider AI team critiques Sol's work in parallel.
 *
 * Reviewers never write the site. Each returns short critique notes for its
 * own area; Sol decides what to change. A reviewer that fails is skipped, so
 * the panel can never block or degrade a build.
 */
import { callBestThinker, callHallOfFame } from "@/lib/ai/hall-of-fame.server";
import type { CollectivePurpose } from "@/lib/ai/collective";

export type ReviewArea = "design" | "conversion" | "truthfulness" | "seo" | "accessibility" | "mobile";

export type ReviewNote = { area: ReviewArea; issues: string[]; severity: "low" | "medium" | "high"; model: string | null };

export type Thinker = typeof callBestThinker;

type Reviewer = { area: ReviewArea; purpose: CollectivePurpose; complexity: "high" | "medium" | "low"; brief: string };

const FULL_PANEL: Reviewer[] = [
  { area: "design", purpose: "design_alternative", complexity: "medium", brief: "Critique visual hierarchy, spacing, rhythm, typography and whether each section feels premium and distinct." },
  { area: "conversion", purpose: "conversion_architecture", complexity: "high", brief: "Critique the conversion flow: clarity of offer, call-to-action placement, friction, trust signals built only from supplied facts." },
  { area: "truthfulness", purpose: "adversarial_review", complexity: "medium", brief: "Flag any wording that states facts, prices, reviews, awards or results not present in the supplied material." },
  { area: "seo", purpose: "seo_analysis", complexity: "medium", brief: "Critique heading structure, keyword clarity, internal links and alt text." },
  { area: "accessibility", purpose: "specialist_review", complexity: "low", brief: "Flag contrast risks, missing alt text, tiny text, unclear link labels and reading order problems." },
  { area: "mobile", purpose: "specialist_review", complexity: "low", brief: "Flag layouts that will break or crowd on a 320–390px phone: multi-column rows, oversized text, overflow." },
];

const LIGHT_AREAS: ReviewArea[] = ["truthfulness", "seo", "accessibility", "mobile"];

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
 * If the free squad cannot answer, that reviewer falls back to Terra/Sol.
 */
const DIVERSE_AREAS = new Set<ReviewArea>(["design", "conversion", "seo", "accessibility", "mobile"]);

export const diverseThinker: Thinker = async (request) => {
  const purpose = request.purpose;
  const area = (request as { area?: ReviewArea }).area;
  if (area && DIVERSE_AREAS.has(area)) {
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
        stage: request.stage ?? `review.${area}`,
        purpose,
        lane: "free",
        model: `${free.provider} · ${free.model}`,
        ok: true,
        latencyMs: Date.now() - started,
        reason: `independent ${area} reviewer from the free squad`,
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

/**
 * Advisers speak BEFORE Sol designs: they read only the supplied material and
 * hand Sol evidence-backed notes. They never write the site.
 */
export async function runAdvisoryPanel(
  input: { organizationId: string; material: string },
  thinker: Thinker = diverseThinker,
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
  input: { organizationId: string; material: string; mode: "full" | "light"; stage?: string },
  thinker: Thinker = diverseThinker,
): Promise<{ notes: ReviewNote[]; models: string[]; costMicrocents: number; failed: ReviewArea[] }> {
  const reviewers = panelFor(input.mode);
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
        user: input.material,
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
