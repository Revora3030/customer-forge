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
  "You are Terra, an adversarial photo editor reviewing one generated website picture before it goes live on a premium business website. The bar is a top design studio's commissioned photography: if you would not put it on a Lovable, Framer or Apple-grade site, reject it.",
  "Reject for ANY of these: warped or melted objects, extra or missing limbs or fingers, malformed hands, garbled or invented text, letters, numbers, badges, emblems, seals, stamps, licence plates or logos anywhere in the frame (including fake car badges and fake brand marks), real brand logos, duplicated edges, impossible geometry, heavy noise or blur, a subject that does not match the brief, a collage, split-screen, grid or multi-panel composition, visible borders or frames, a frame with no usable space for headline words, or a picture so busy or low-contrast that overlaid words would be unreadable.",
  "Also reject flat, dull, grey or washed-out pictures with no clear focal subject, generic stock-photo staging, and anything that reads as an illustration, cartoon, cel-shaded or painted art, clip art, flat vector, toy-like 3D render, or plastic CGI look.",
  "When in doubt, reject: a missing picture can be reshot, a bad picture damages the customer's brand.",
  'Answer as JSON only: {"publishable": boolean, "defects": string[], "revisedPrompt": string}.',
  "defects are short plain-English phrases a business owner would understand. revisedPrompt is a full corrected photography brief when publishable is false, otherwise an empty string.",
].join(" ");

/**
 * Terra looks at the finished picture and reports whether it is publishable.
 * Fail closed: a picture Terra could not actually look at is NOT published.
 * Unreviewed pictures are how warped badges and fake text reached live sites.
 */
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
  } catch (error) {
    console.warn("[photo-direction] visual review unavailable:", error);
    // Fail closed: an unreviewed picture never reaches a customer's website.
    return {
      publishable: false,
      defects: ["the picture could not be quality-checked, so it was not used"],
      revisedPrompt: null,
      reviewed: false,
    };
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
  // Only an explicit `true` passes. An unclear or malformed answer is treated as
  // a rejection so an unchecked picture can never slip onto a live site.
  if (publishable === true) return { publishable: true, defects, revisedPrompt: null, reviewed: true };
  return {
    publishable: false,
    defects: defects.length ? defects : ["the picture review was unclear, so the picture was not used"],
    revisedPrompt,
    reviewed: true,
  };
}
