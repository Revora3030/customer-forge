/**
 * PHOTOGRAPHY ART DIRECTION AND VISUAL INSPECTION.
 *
 * Two AI jobs wrap every picture the platform makes, so the picture models are
 * never asked to guess:
 *
 *  1. Sol (the creative authority, `design` role) turns a short picture request
 *     into a full commissioned-photography brief: lens, lighting, composition,
 *     negative space for the words that sit on top, grade and hard exclusions.
 *  2. Terra (adversarial reviewer, `vision` role) looks at the finished picture
 *     and says whether it is publishable, and if not, what to change.
 *
 * Sol is advisory: if Sol cannot answer, the original request is sent through
 * untouched. Terra separates two very different outcomes:
 *  - `contentRejected`: Terra actually looked at the pixels and found a real
 *    defect. Only this may trigger a corrected reshoot.
 *  - `reviewFailed`: the review itself could not run (timeout, 5xx, network,
 *    adapter error). The picture is NOT regenerated; the review is retried once
 *    on its own and the caller decides the fallback. An infrastructure glitch
 *    used to turn one picture into three generations and three reviews.
 * Neither may invent business facts: the brief is explicitly forbidden from
 * adding text, logos, awards, reviews, people-as-proof or results into a frame.
 *
 * Server-only: it calls the AI router, which reads server credentials.
 */

import { generateStructuredOutput } from "@/lib/ai/router.server";
import { RevoraAiError } from "@/lib/ai/errors";
import { toImageDataUrl } from "@/lib/ai/data-url";

export type PhotoBrief = {
  /** The raw picture request, as authored by the AI plan or the owner. */
  request: string;
  /** What the picture is for, e.g. "hero", "service card", "about". */
  placement?: string;
  /** Business context Sol may use for the scene — facts only, never claims. */
  business?: string;
  /** Site palette so the grade matches the page. */
  palette?: string;
  /** True when words will be laid over the picture. */
  overlaidText?: boolean;
};

const EXCLUSIONS = [
  "No text, lettering, captions, numbers, watermarks or logos rendered inside the picture. No car badges, emblems, seals, stamps or licence plates. Single photograph only: no collage, split-screen, grid or multi-panel layout, no borders.",
  "No award badges, star ratings, review quotes, certifications or guarantees.",
  "No identifiable real customer, employee, licence plate, street address or before-and-after proof.",
  "No plastic 3D CGI gloss, cartoon or illustration styling, oversaturated HDR halos, neon bloom, smeary pseudo-text, waxy skin or impossible materials.",
  "No generic AI stock-photo staging, cloned showroom poses, floating objects, excessive symmetry or fake cinematic light that contradicts the real scene.",
].join(" ");

function craftFallback(brief: PhotoBrief): string {
  // Not a creative decision: it only restates the request as a photography
  // instruction and attaches the exclusions. No scene, subject, claim or
  // business fact is invented here.
  return [
    "Commissioned editorial photograph for a business website.",
    brief.request,
    brief.overlaidText === false
      ? ""
      : "Place the focal subject off-center on a rule-of-thirds grid, reserving clean, low-contrast negative space on the opposite side for overlay copy in a 16:9 desktop crop and a 9:16 mobile crop.",
    "Photorealistic commercial editorial photography with true-to-life colour and material texture; never an illustration or generic stock.",
    EXCLUSIONS,
  ]
    .filter(Boolean)
    .join(" ");
}

const DIRECTOR_SYSTEM = [
  "You are Sol, the art director for a professional website studio.",
  "You turn a short picture request into one commissioned photography brief that a top image model can shoot exactly.",
  "Always specify: subject and action, environment, time of day and lighting direction and quality, camera/lens choice, aperture and depth of field, camera height and angle, composition, colour grade, material texture and mood.",
  "Commercial editorial baseline: 35mm or 50mm prime lens, typically f/1.8–f/2.8 for selective depth of field, with medium-format-like tactile grain only when it remains natural.",
  "Lighting should be physically plausible and directional: natural window light, crisp architectural rim light, or warm golden-hour sidelight as appropriate to the supplied scene.",
  "Composition must place the focal subject off-center on the rule of thirds and reserve clean, low-detail, low-contrast negative space for overlay copy in both a wide 16:9 desktop crop and a tall 9:16 mobile crop.",
  "Never invent a business fact, claim, award, review, result, price, person or place that was not supplied. Describe only a plausible generic scene of the work itself.",
  `Always end with these exclusions verbatim: ${EXCLUSIONS}`,
  'Answer as JSON only: {"prompt": string}. The prompt is one paragraph, at most 1200 characters, no line breaks, no headings, no commentary.',
].join(" ");

/**
 * Expands a picture request into a full photography brief using Sol.
 * Falls back to the request itself (plus exclusions) if Sol is unavailable.
 */
export async function directPhotoPrompt(
  brief: PhotoBrief,
  caller: { organizationId: string; userId?: string | null },
): Promise<{ prompt: string; directed: boolean }> {
  const request = brief.request.trim();
  if (request.length === 0) return { prompt: request, directed: false };
  const context = [
    `PICTURE REQUEST: ${request}`,
    brief.placement ? `WHERE IT APPEARS: ${brief.placement}` : "",
    brief.business ? `BUSINESS FACTS (scene context only): ${brief.business}` : "",
    brief.palette ? `SITE PALETTE TO GRADE TOWARDS: ${brief.palette}` : "",
    brief.overlaidText === false
      ? "No words will be placed over this picture."
      : "Headline or button words will be placed over this picture.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateStructuredOutput(
      { organizationId: caller.organizationId, userId: caller.userId ?? null, task: "image.art_direction" },
      {
        role: "design",
        json: true,
        maxOutputTokens: 900,
        messages: [
          { role: "system", content: DIRECTOR_SYSTEM },
          { role: "user", content: context },
        ],
      },
    );
    const raw = result.data["prompt"];
    const directed = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    if (directed.length < 60) return { prompt: craftFallback(brief), directed: false };
    const withExclusions = directed.includes("No text") ? directed : `${directed} ${EXCLUSIONS}`;
    return { prompt: withExclusions.slice(0, 1800), directed: true };
  } catch (error) {
    console.warn("[photo-direction] art direction unavailable:", error);
    return { prompt: craftFallback(brief), directed: false };
  }
}

export type PhotoVerdict = {
  /** False when Terra rejected the picture OR the review could not run. */
  publishable: boolean;
  /** Plain-language defects Terra saw, safe to show an owner. */
  defects: string[];
  /** A corrected prompt to reshoot with, when Terra supplied one. */
  revisedPrompt: string | null;
  /** True when Terra actually looked at the picture. */
  reviewed: boolean;
  /**
   * True ONLY when Terra inspected the pixels and found a genuine defect.
   * This is the sole signal that may trigger a reshoot.
   */
  contentRejected: boolean;
  /**
   * True when the review itself failed for infrastructure reasons (timeout,
   * network, 5xx, no vision model reachable). Never a reason to reshoot.
   */
  reviewFailed: boolean;
};

/** Per-attempt ceiling for one visual review call (fail fast, fail over). */
export const VISUAL_REVIEW_TIMEOUT_MS = 9_000;
/** Whole-chain budget for one visual review, across every vision model. */
export const VISUAL_REVIEW_CHAIN_MS = 25_000;
/** Review-only retries after an infrastructure failure. Never a reshoot. */
export const VISUAL_REVIEW_RETRIES = 1;

/**
 * What to do with a picture whose review could not run.
 *
 * Default `accept`: the picture is kept under the safe fallback — it was
 * generated from a brief that already forbids text/logos/claims and still has
 * to pass the deterministic first-build image QA gate. Operators who prefer the
 * old fail-closed behaviour set `VISUAL_REVIEW_UNAVAILABLE_POLICY=reject`; even
 * then no reshoot is triggered, the slot is simply left empty.
 */
export function reviewUnavailablePolicy(): "accept" | "reject" {
  return process.env["VISUAL_REVIEW_UNAVAILABLE_POLICY"] === "reject" ? "reject" : "accept";
}

/** True when a verdict may trigger a regenerated picture. */
export function shouldReshoot(verdict: PhotoVerdict): boolean {
  return verdict.contentRejected && verdict.reviewed && !verdict.reviewFailed;
}

/** True when a verdict lets the picture be used (passed, or safe fallback). */
export function acceptedForUse(verdict: PhotoVerdict, policy = reviewUnavailablePolicy()): boolean {
  if (verdict.publishable) return true;
  return verdict.reviewFailed && !verdict.contentRejected && policy === "accept";
}

/**
 * Errors that describe the review infrastructure rather than the picture.
 * Anything else unexpected (a thrown non-AI error) is also infrastructure: the
 * picture was never judged.
 */
export function isInfrastructureFailure(error: unknown): boolean {
  if (!(error instanceof RevoraAiError)) return true;
  return error.category !== "policy" && error.category !== "too_large";
}

function reviewUnavailableVerdict(): PhotoVerdict {
  return {
    publishable: false,
    defects: ["the picture could not be quality-checked right now"],
    revisedPrompt: null,
    reviewed: false,
    contentRejected: false,
    reviewFailed: true,
  };
}

const REVIEWER_SYSTEM = [
  "You are Terra, an adversarial photo editor reviewing one generated website picture before it goes live on a premium business website. The bar is a top design studio's commissioned photography: if you would not put it on a Lovable, Framer or Apple-grade site, reject it.",
  "Reject for ANY of these: warped or melted objects, extra or missing limbs or fingers, malformed hands, garbled or invented text, letters, numbers, badges, emblems, seals, stamps, licence plates or logos anywhere in the frame (including fake car badges and fake brand marks), real brand logos, duplicated edges, impossible geometry, heavy noise or blur, a subject that does not match the brief, a collage, split-screen, grid or multi-panel composition, visible borders or frames, a frame with no usable space for headline words, or a picture so busy or low-contrast that overlaid words would be unreadable.",
  "Also reject flat, dull, grey or washed-out pictures with no clear focal subject, generic stock-photo staging, and anything that reads as an illustration, cartoon, cel-shaded or painted art, clip art, flat vector, toy-like 3D render, or plastic CGI look.",
  "When in doubt, reject: a missing picture can be reshot, a bad picture damages the customer's brand.",
  'Answer as JSON only: {"publishable": boolean, "defects": string[], "revisedPrompt": string}.',
  "defects are short plain-English phrases a business owner would understand. revisedPrompt is a full corrected photography brief when publishable is false, otherwise an empty string.",
].join(" ");

const TARGETED_REVISION_SYSTEM = [
  "You are Sol performing one targeted commercial-photography revision after Terra rejected a generated frame.",
  "Rewrite only the photography brief details needed to correct Terra's defects. Preserve the real business/service context, documentary realism, physically plausible lighting and commercial editorial intent.",
  "Never add text, logos, awards, reviews, ratings, guarantees, customer proof, prices, addresses, staff identities or invented business facts.",
  "Keep a 35mm or 50mm prime baseline, natural directional light, realistic material texture, off-center composition and useful negative space for copy where the placement requires it.",
  "Do not introduce CGI gloss, illustration, plastic skin, impossible geometry, fake cinematic effects or other uncanny AI tropes.",
  'Answer JSON only: {"prompt":"..."} with one concise paragraph under 1600 characters.',
].join(" ");

async function reviseRejectedPhotoPrompt(
  currentPrompt: string,
  placement: string | undefined,
  defects: string[],
  terraPrompt: string | null,
  caller: { organizationId: string; userId?: string | null },
): Promise<string | null> {
  try {
    const result = await generateStructuredOutput(
      { organizationId: caller.organizationId, userId: caller.userId ?? null, task: "image.art_direction_revision" },
      {
        role: "design",
        json: true,
        maxOutputTokens: 900,
        messages: [
          { role: "system", content: TARGETED_REVISION_SYSTEM },
          {
            role: "user",
            content: [
              `CURRENT BRIEF: ${currentPrompt}`,
              placement ? `PLACEMENT: ${placement}` : "",
              `TERRA DEFECTS: ${defects.join("; ") || "unspecified visible defect"}`,
              terraPrompt ? `TERRA'S SUGGESTED CORRECTION: ${terraPrompt}` : "",
              "Return a corrected brief, not commentary.",
            ].filter(Boolean).join("\n"),
          },
        ],
      },
    );
    const revised = result.data["prompt"];
    if (typeof revised !== "string") return null;
    const normalized = revised.replace(/\s+/g, " ").trim();
    if (normalized.length < 80) return null;
    return normalized.includes("No text") ? normalized.slice(0, 1800) : `${normalized} ${EXCLUSIONS}`.slice(0, 1800);
  } catch (error) {
    console.warn("[photo-direction] targeted revision unavailable:", error);
    return null;
  }
}

/**
 * Terra looks at the finished picture and reports whether it is publishable.
 *
 * A Terra rejection (`contentRejected`) is the only outcome that may lead to a
 * reshoot. When the review itself cannot run, the call is retried once (the
 * review only — the picture is never regenerated for an infrastructure error)
 * and then reported as `reviewFailed` so the caller applies its fallback.
 */
export async function inspectPhoto(
  picture: { base64: string; mimeType: string },
  brief: { prompt: string; placement?: string },
  caller: { organizationId: string; userId?: string | null },
): Promise<PhotoVerdict> {
  const mimeType = picture.mimeType.split(";")[0]?.trim().toLowerCase() || "image/png";
  // Several OpenAI-compatible vision endpoints (Cloudflare, OpenRouter, NVIDIA)
  // reject raw base64 with 400 "invalid image URL". Always send a data URL.
  const fullDataUrl = toImageDataUrl(picture.base64, mimeType);

  let result: Awaited<ReturnType<typeof generateStructuredOutput>> | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= VISUAL_REVIEW_RETRIES && !result; attempt += 1) {
    try {
      result = await reviewOnce(fullDataUrl, mimeType, brief, caller);
    } catch (error) {
      lastError = error;
      // A policy refusal or an oversized picture is the same on retry.
      if (!isInfrastructureFailure(error)) break;
    }
  }
  if (!result) {
    console.warn("[photo-direction] visual review unavailable (no reshoot triggered):", lastError);
    return reviewUnavailableVerdict();
  }

  const verdict = readVerdict(result.data);
  if (!verdict.publishable) {
    // Terra's defects become one targeted Sol revision before the caller can
    // fall back to any other image source. This keeps the retry a true art-
    // direction correction rather than an unconstrained second generation.
    const targeted = await reviseRejectedPhotoPrompt(
      brief.prompt,
      brief.placement,
      verdict.defects,
      verdict.revisedPrompt,
      caller,
    );
    return {
      ...verdict,
      revisedPrompt: targeted ?? verdict.revisedPrompt,
    };
  }
  return verdict;
}

async function reviewOnce(
  fullDataUrl: string,
  mimeType: string,
  brief: { prompt: string; placement?: string },
  caller: { organizationId: string; userId?: string | null },
) {
  return generateStructuredOutput(
      { organizationId: caller.organizationId, userId: caller.userId ?? null, task: "image.visual_review" },
      {
        role: "vision",
        json: true,
        maxOutputTokens: 700,
        // Fail fast and fail over: a slow vision model must not hold a build
        // worker for a minute. The router clamps these to its own ceilings.
        timeoutMs: VISUAL_REVIEW_TIMEOUT_MS,
        chainDeadlineMs: VISUAL_REVIEW_CHAIN_MS,
        messages: [
          { role: "system", content: REVIEWER_SYSTEM },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  brief.placement ? `WHERE IT APPEARS: ${brief.placement}` : "",
                  `BRIEF IT WAS SHOT FROM: ${brief.prompt}`,
                  "Review the attached picture against that brief.",
                ]
                  .filter(Boolean)
                  .join("\n"),
              },
              { type: "image", dataUrl: fullDataUrl, mimeType },
            ],
          },
        ],
      },
    );
}

/** Pure reader for a reviewer answer; exported so the rules are unit-testable. */
export function readVerdict(data: Record<string, unknown>): PhotoVerdict {
  const publishable = data["publishable"];
  const rawDefects = data["defects"];
  const revised = data["revisedPrompt"];
  const defects = Array.isArray(rawDefects)
    ? rawDefects
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.replace(/\s+/g, " ").trim().slice(0, 240))
        .slice(0, 6)
    : [];
  const revisedPrompt =
    typeof revised === "string" && revised.trim().length >= 40 ? revised.replace(/\s+/g, " ").trim().slice(0, 1800) : null;
  // Only an explicit `true` passes. An unclear or malformed answer is treated as
  // a rejection so an unchecked picture can never slip onto a live site.
  if (publishable === true)
    return { publishable: true, defects, revisedPrompt: null, reviewed: true, contentRejected: false, reviewFailed: false };
  return {
    publishable: false,
    defects: defects.length ? defects : ["the picture review was unclear, so the picture was not used"],
    revisedPrompt,
    reviewed: true,
    // Terra answered and did not approve: this is a content judgement.
    contentRejected: true,
    reviewFailed: false,
  };
}
