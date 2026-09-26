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
 * Both are advisory helpers, never gates that can lose a picture:
 *  - if Sol cannot answer, the original request is sent through untouched;
 *  - if Terra cannot answer, the picture passes.
 * Neither may invent business facts: the brief is explicitly forbidden from
 * adding text, logos, awards, reviews, people-as-proof or results into a frame.
 *
 * Server-only: it calls the AI router, which reads server credentials.
 */

import { generateStructuredOutput } from "@/lib/ai/router.server";

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
  "No text, lettering, captions, numbers, watermarks or logos rendered inside the picture.",
  "No award badges, star ratings, review quotes, certifications or guarantees.",
  "No identifiable real customer, employee, licence plate, street address or before-and-after proof.",
  "No plastic AI gloss, no oversaturated HDR, no warped hands, tools, wheels or text-like smears.",
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
      : "Leave calm, uncluttered negative space where headline words will sit, on desktop and on a tall mobile crop.",
    "Photorealistic, natural light, true-to-life colour. Not an illustration, not generic stock.",
    EXCLUSIONS,
  ]
    .filter(Boolean)
    .join(" ");
}

const DIRECTOR_SYSTEM = [
  "You are Sol, the art director for a professional website studio.",
  "You turn a short picture request into one commissioned photography brief that a top image model can shoot exactly.",
  "Always specify: subject and action, environment, time of day and lighting direction and quality, lens and focal length, aperture and depth of field, camera height and angle, composition and where the negative space sits, colour grade, texture and mood.",
  "Composition must reserve clean, low-detail negative space for headline and button text, in both a wide desktop crop and a tall mobile crop.",
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
  /** False only when Terra found a defect serious enough to reshoot. */
  publishable: boolean;
  /** Plain-language defects Terra saw, safe to show an owner. */
  defects: string[];
  /** A corrected prompt to reshoot with, when Terra supplied one. */
  revisedPrompt: string | null;
  /** True when Terra actually looked at the picture. */
  reviewed: boolean;
};

const REVIEWER_SYSTEM = [
  "You are Terra, an adversarial photo editor reviewing one generated website picture before it goes live.",
  "Reject only for real, visible defects: warped or melted objects, extra or missing limbs or fingers, garbled text-like marks, duplicated edges, impossible geometry, heavy noise or blur, a subject that does not match the brief, a frame with no usable space for headline words, or a picture so busy or low-contrast that overlaid words would be unreadable.",
  "Do not reject for taste, style preference, or because you would have shot it differently.",
  'Answer as JSON only: {"publishable": boolean, "defects": string[], "revisedPrompt": string}.',
  "defects are short plain-English phrases a business owner would understand. revisedPrompt is a full corrected photography brief when publishable is false, otherwise an empty string.",
].join(" ");

/**
 * Terra looks at the finished picture and reports whether it is publishable.
 * Any failure to review returns `publishable: true` so a good picture is never
 * thrown away because the reviewer was unreachable.
 */
export async function inspectPhoto(
  picture: { base64: string; mimeType: string },
  brief: { prompt: string; placement?: string },
  caller: { organizationId: string; userId?: string | null },
): Promise<PhotoVerdict> {
  const mimeType = picture.mimeType.split(";")[0] || "image/png";
  try {
    const result = await generateStructuredOutput(
      { organizationId: caller.organizationId, userId: caller.userId ?? null, task: "image.visual_review" },
      {
        role: "vision",
        json: true,
        maxOutputTokens: 700,
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
              { type: "image", dataUrl: picture.base64, mimeType },
            ],
          },
        ],
      },
    );
    return readVerdict(result.data);
  } catch (error) {
    console.warn("[photo-direction] visual review unavailable:", error);
    return { publishable: true, defects: [], revisedPrompt: null, reviewed: false };
  }
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
  // Anything other than an explicit `false` passes: an unclear answer must never
  // discard a picture that may well be fine.
  if (publishable === false) return { publishable: false, defects, revisedPrompt, reviewed: true };
  return { publishable: true, defects, revisedPrompt: null, reviewed: true };
}
